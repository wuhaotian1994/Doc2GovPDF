import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {blank,draft,validateDraft,metadataNames,fieldsForEngine} from '../web/write-model.js';
import {contentFromText,contentText,table} from '../web/write-content.js';
import {setAnnex} from '../web/write-annexes.js';
import {reviewItems,ReviewDecisions} from '../web/write-checks.js';

const root=resolve(import.meta.dirname,'..'),out=resolve(root,'build/qa/issue-metadata-compat-review');
await mkdir(out,{recursive:true});
const files=['web/write.js','web/write.html','web/write-boot.js','web/write-checks.js','web/write-model.js','web/write-library.js'];
const sha=async path=>createHash('sha256').update(await readFile(resolve(root,path))).digest('hex');
const report={sourceSHA:Object.fromEntries(await Promise.all(files.map(async p=>[p,await sha(p)]))),baseline:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),checks:[]};
const check=async(name,fn)=>{try{await fn();report.checks.push({name,passed:true});console.log('PASS '+name);}catch(error){report.checks.push({name,passed:false,error:error.stack});console.error('FAIL '+name+': '+error.message);}};
let baseline=execFileSync('git',['show','HEAD:web/write-checks.js'],{cwd:root,encoding:'utf8'});
baseline=baseline.replace(/from '(\.\/[^']+)'/g,(_,p)=>`from '${pathToFileURL(resolve(root,'web',p)).href}'`);
const old=await import('data:text/javascript;base64,'+Buffer.from(baseline).toString('base64'));
const para=(id,text,role='body')=>({paragraph:{id,text,role,font:'仿宋',size:16}});
const issue=(extra={})=>({id:'finding',paragraphId:'b',rule:'unknown.document-rule',severity:'review',message:'独立核对',original:'数值12kg',basis:'测试规则',...extra});
const fixture={page:{width:210,height:297},blocks:[para('b','数值12kg')]};
for(let version=1;version<=6;version++)await check('v'+version+' legacy document/local fingerprints and receipts unchanged',()=>{
 let content=version>=4?contentFromText('数值12kg'):null;
 if(version===5)content.postscript=contentFromText('原后文');
 if(version===6){content=contentFromText('附件\n清单\n数值12kg');content=setAnnex(content,content.blocks[0].id);}
 const f={...blank(),title:'兼容机制稿',body:content?contentText(content):'数值12kg'};
 if(version===2)f.sourceMaterial='旧材料';if(version===3)f.postscript='原后文';
 const saved=draft(f,0,'legacy-'+version,undefined,content);saved.version=version;
 for(const name of metadataNames)delete saved.fields[name];
 if(version===1){delete saved.fields.sourceMaterial;delete saved.fields.pendingMaterial;delete saved.fields.postscript;}
 if(version===2)delete saved.fields.postscript;
 const restored=validateDraft(saved),legacyFields=Object.fromEntries(Object.entries(restored.fields).filter(([k])=>!metadataNames.includes(k)));
 assert.equal(restored.version,version);
 for(const rule of ['unknown.document-rule','number.unit-space']){
  const inspection={version:'0.2.0',issues:[issue({rule})]};
  const prior=old.reviewItems(fixture,inspection,legacyFields,saved.id,content)[0];
  for(const extras of [{signer:'',issuer:'',issueDate:''},{signer:' ',issuer:'  ',issueDate:''}]){
   const next={...restored.fields,...extras},current=reviewItems(fixture,inspection,next,saved.id,content)[0];
   assert.equal(current.key,prior.key);
   const ledger=new ReviewDecisions();ledger.restore({version:1,documentId:saved.id,keys:[prior.key]},next,saved.id,content);
   assert.equal(ledger.has(current),true);assert.deepEqual([...ledger.reconcile([current])],['finding']);
  }
 }
 assert.equal(Object.hasOwn(fieldsForEngine(restored.fields),'signer'),false);
});
await check('nonempty metadata revokes only document-wide old receipts',()=>{
 const f={...blank(),body:'数值12kg'},base={...f};for(const n of metadataNames)delete base[n];
 for(const rule of ['unknown.document-rule','number.unit-space']){
  const item=old.reviewItems(fixture,{version:'0.2.0',issues:[issue({rule})]},base,'id')[0];
  const ledger=new ReviewDecisions();ledger.restore({version:1,documentId:'id',keys:[item.key]},{...f,signer:'明确签发者'},'id');
  assert.equal(ledger.receipts.size,rule==='number.unit-space'?1:0);
 }
});
const referenceProbe=(reference,signer,replacement,rule='word.variant')=>{
 const f={...blank(),reference,signer},text=reference+'\t签发人：'+signer;
 return reviewItems({blocks:[para('r',text,'reference')]},{version:'0.2.0',issues:[issue({paragraphId:'r',rule,original:text,replacement})]},f,'source')[0];
};
await check('reference word correction locates reference, signer correction locates signer',()=>{
 assert.equal(referenceProbe('部份办〔2024〕1号','张甲','部分办〔2024〕1号\t签发人：张甲').source?.field,'reference');
 assert.equal(referenceProbe('试办〔2024〕1号','部份','试办〔2024〕1号\t签发人：部分').source?.field,'signer');
 assert.equal(referenceProbe('试办〔2024〕1号','签发〔2024〕001号','试办〔2024〕1号\t签发人：签发〔2024〕1号','reference.format').source?.field,'signer');
});
await check('ambiguous duplicate names or cross-field correction never invent signer focus',()=>{
 assert.equal(referenceProbe('部份办〔2024〕1号','部份','部分办〔2024〕1号\t签发人：部份').source?.field,'reference');
 assert.equal(referenceProbe('部份','部份','部分\t签发人：部份').source,null);
 assert.equal(referenceProbe('试办〔2024〕1号','张甲','另办〔2024〕1号\t签发人：张乙').source,null);
 assert.equal(referenceProbe('试办〔2024〕1号','张甲','', 'style.word').source,null);
 assert.equal(referenceProbe('试办〔2024〕1号','张甲','', 'reference.format').source,null);
 assert.equal(referenceProbe('试办〔2024〕001号','张甲','试办〔2024〕1号\t签发人：张甲','reference.serial-zero').source?.field,'reference');
});

await check('imprint correction locates changed authored fact; date rule does not imply printing date',()=>{
 const f={...blank(),issuer:'2024年08月19日会议组',issueDate:'2024-08-19'},text=f.issuer+'\t2024年8月19日印发';
 const inspect=(rule,replacement)=>reviewItems({blocks:[para('print',text,'imprint')]},{version:'0.2.0',issues:[issue({paragraphId:'print',rule,original:text,replacement})]},f,'print-source')[0];
 assert.equal(inspect('date.inline-padding',text.replace('08月','8月')).source?.field,'issuer');
 assert.equal(inspect('style.word','').source,null);
 assert.equal(inspect('date.incomplete','').source,null);
 assert.equal(inspect('word.variant',text.replace('会议组','会议组乙')).source?.field,'issuer');
 assert.equal(inspect('word.variant',text.replace('8月19日印发','8月20日印发')).source?.field,'issueDate');
 assert.equal(inspect('word.variant',text.replace('会议组','会议组乙').replace('19日印发','20日印发')).source,null);
});
if(process.env.ISSUANCE_REVIEW_BROWSER!=='0'){
 const require=createRequire(new URL('./browser-tests/package.json',import.meta.url));
 const {chromium,firefox,webkit}=require('playwright');
 const webRoot=resolve(root,process.env.WRITER_WEB_ROOT||'build/qa/issuance-feedback-web');
 report.candidateSHA=Object.fromEntries(await Promise.all(['index.html','write.js','write-model.js','write-boot.js','write-library.js','write-checks.js','document-engine.wasm'].map(async p=>[p,createHash('sha256').update(await readFile(resolve(webRoot,p))).digest('hex')])));
 const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.svg':'image/svg+xml','.ttf':'font/ttf','.woff2':'font/woff2'};
 for(const profile of [{name:'chrome',type:chromium,channel:'chrome'},{name:'firefox',type:firefox},{name:'webkit',type:webkit}]){
  const browser=await profile.type.launch({headless:true,...(profile.channel?{channel:profile.channel}:{}),env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',http_proxy:'',https_proxy:'',all_proxy:'',NO_PROXY:'localhost,127.0.0.1'},...(profile.name==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
  try{
   await check(profile.name+' v7 blocked module emergency download/reload/structured recovery',async()=>{
    const content=contentFromText('仅用于机制测试的虚构正文');content.blocks.push(table(2,2));content.postscript=contentFromText('虚构回执后文');
    const seed=draft({...blank(),title:'虚构兼容验证',signer:'签发者甲',issuer:'虚构印发处',issueDate:'2024-08-19',signature:'独立落款',date:'2024-08-15'},1,'v7-recovery',undefined,content);
    const context=await browser.newContext({serviceWorkers:'block',locale:'zh-CN'});let blockModule=true;
    await context.addInitScript(seed=>{if(!localStorage.getItem('gongwen-writer-v1'))localStorage.setItem('gongwen-writer-v1',JSON.stringify(seed));localStorage.setItem('gongwen-font-start-v1','chosen');},seed);
    await context.route('**/*',async route=>{
     const url=new URL(route.request().url());if(url.origin!=='http://localhost:49191')return route.abort();
     if(blockModule&&url.pathname==='/write.js')return route.abort();
     try{const name=decodeURIComponent(url.pathname)==='/'?'index.html':decodeURIComponent(url.pathname).slice(1);if(name.includes('..'))return route.abort();const data=await readFile(resolve(webRoot,name));await route.fulfill({status:200,contentType:mime[extname(name)]||'application/octet-stream',body:data});}catch{await route.fulfill({status:404,body:'Not found'});}
    });
    const page=await context.newPage();page.setDefaultTimeout(15000);
    try{
     await page.goto('http://localhost:49191/',{waitUntil:'load'});
     assert.equal(await page.locator('#issuer').inputValue(),'虚构印发处');assert.equal(await page.locator('#issueDate').inputValue(),'2024-08-19');assert.equal(await page.locator('#body').getAttribute('readonly'),'');
     await page.locator('#issuer').fill('虚构印发处修订');await page.evaluate(()=>window.writerBoot.fail());
     const waiting=page.waitForEvent('download');await page.locator('#startup-download').click();const download=await waiting,path=resolve(out,profile.name+'-emergency.gongwen.json');await download.saveAs(path);
     const emergency=validateDraft(JSON.parse(await readFile(path,'utf8')));assert.equal(emergency.version,7);assert.equal(emergency.fields.issuer,'虚构印发处修订');assert.equal(emergency.fields.signer,'签发者甲');assert.deepEqual(emergency.content,content);
     await page.reload();assert.equal(await page.locator('#issuer').inputValue(),'虚构印发处修订');assert.equal(await page.locator('#issueDate').inputValue(),'2024-08-19');
     blockModule=false;await page.reload();await page.waitForFunction(()=>window.writerReady,{},{timeout:90000});
     const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('gongwen-writer-v1')));assert.equal(saved.version,7);assert.equal(saved.fields.issuer,'虚构印发处修订');assert.equal(saved.fields.signer,'签发者甲');assert.deepEqual(saved.content,content);
     assert.equal(await page.evaluate(()=>sessionStorage.getItem('gongwen-writer-pending-v1')),null);
     await page.locator('#issueDate').fill('');await page.locator('[data-next="2"]').click();
     assert.equal(await page.evaluate(()=>document.activeElement.id),'issueDate');assert.equal(await page.locator('#issuance-fields').evaluate(n=>n.open),true);assert.equal(await page.locator('#issueDate-error').isVisible(),true);
     const half=await page.evaluate(()=>JSON.parse(localStorage.getItem('gongwen-writer-v1')));assert.equal(half.fields.issueDate,'');assert.equal(half.fields.issuer,'虚构印发处修订');assert.equal(half.fields.date,'2024-08-15');
     await page.reload();await page.waitForFunction(()=>window.writerReady,{},{timeout:90000});assert.equal(await page.locator('#issuer').inputValue(),'虚构印发处修订');assert.equal(await page.locator('#issueDate').inputValue(),'');
     await page.locator('#issueDate').fill('2024-08-19');await page.locator('[data-back="0"]').click();
     if(!await page.locator('details:has(#signer)').evaluate(n=>n.open))await page.locator('details:has(#signer) summary').click();await page.locator('#signer').fill('签发者甲\n签发者乙');await page.locator('[data-step="2"]').click();
     assert.equal(await page.evaluate(()=>document.activeElement.id),'signer');assert.equal(await page.locator('#signer-error').isVisible(),true);assert.equal(await page.locator('#signer').inputValue(),'签发者甲\n签发者乙');
     await page.screenshot({path:resolve(out,profile.name+'-signer-error.png')});
    }finally{await context.close();}
   });
  }finally{await browser.close();}
 }
}
report.testSHA=await sha('scripts/test-issue-metadata-compat-review.mjs');await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));
if(report.checks.some(c=>!c.passed))process.exitCode=1;
