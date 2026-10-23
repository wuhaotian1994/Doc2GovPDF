import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {startWebServer} from './browser-tests/server.mjs';
import {blank} from '../web/write-model.js';

// All source manuscript text stays in a caller-supplied local ignored file.
// Neither a missing source nor failed parsing may fall back to invented prose.
const root=resolve(import.meta.dirname,'..'),sourcePath=process.env.ISSUANCE_SOURCE;
if(!sourcePath)throw Error('Set ISSUANCE_SOURCE to the local official source JSON; no substitute fixture is created.');
const sourceBytes=await readFile(sourcePath),source=JSON.parse(sourceBytes.toString('utf8'));
assert.equal(source.type,'local-official-issuance-source');
for(const name of ['title','recipient','reference','body','signature','date','signer','issuer'])assert.ok(typeof source.fields?.[name]==='string'&&source.fields[name],`Source needs explicit ${name}`);
assert.deepEqual(source.simulationIssueDates,['2024-08-19','2024-08-23']);
assert.notEqual(source.fields.signature,source.fields.issuer,'Independent printing office must not borrow the closing office');
const hash=data=>createHash('sha256').update(data).digest('hex');
assert.equal(hash(await readFile(source.pdfPath)),source.pdfSHA256);
const out=resolve(process.env.ISSUANCE_OUT||resolve(root,'build/qa/issuance-writer'));
const webRoot=resolve(process.env.ISSUANCE_WEB_ROOT||resolve(root,'build/qa/issuance-feedback-web'));
await mkdir(out,{recursive:true});
const require=createRequire(new URL('./browser-tests/package.json',import.meta.url)),{chromium,firefox,webkit}=require('playwright');
const report={sourcePDFSHA256:source.pdfSHA256,sourceJSONSHA256:hash(sourceBytes),provenance:source.provenance,sourceBodyCharacters:source.fields.body.length,sourceDateConflict:'Both printing-date branches are explicit historical simulations; neither date is certified.',webRoot,assets:{},profiles:[]};
for(const file of ['write-model.js','write.js','write-boot.js','write-checks.js','write.html','document-engine.wasm'])report.assets[file]=hash(await readFile(resolve(webRoot,file)));
const selectedProfiles=(process.env.ISSUANCE_PROFILES||'chrome,firefox,webkit').split(',');
const reportName=process.env.ISSUANCE_REPORT_NAME||'report.json';
const server=process.env.ISSUANCE_URL?{url:process.env.ISSUANCE_URL,async close(){}}:await startWebServer(webRoot);
try{
 for(const profile of [{id:'chrome',engine:chromium,channel:'chrome'},{id:'firefox',engine:firefox},{id:'webkit',engine:webkit}].filter(profile=>selectedProfiles.includes(profile.id))){
  const browser=await profile.engine.launch({headless:true,...(profile.channel?{channel:profile.channel}:{}),env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',http_proxy:'',https_proxy:'',all_proxy:'',NO_PROXY:'127.0.0.1,localhost'},...(profile.id==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
  const result={profile:profile.id,browserVersion:browser.version(),checks:[],downloads:[],errors:[],fontFallbackChoices:0,feedbackRequests:0,uploadRequests:0,externalRequests:0};report.profiles.push(result);
  const folder=resolve(out,profile.id);await mkdir(folder,{recursive:true});
  const check=(label,value)=>{assert.ok(value,label);result.checks.push(label);};
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',acceptDownloads:true,serviceWorkers:'block'});
  await context.route('**/*',route=>{const request=route.request(),url=new URL(request.url());if(url.pathname.startsWith('/api/feedback/')){result.feedbackRequests++;return route.abort();}if(!['GET','HEAD'].includes(request.method())){result.uploadRequests++;return route.abort();}if(url.hostname!=='127.0.0.1'){result.externalRequests++;return route.abort();}return route.continue();});
  let page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>result.errors.push(e.message));
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('gongwen-writer-v1')));
  async function ready(){await page.waitForFunction(()=>window.writerReady===true);const fallback=page.locator('#font-start-fallback');if(await fallback.isVisible()){await fallback.click();result.fontFallbackChoices++;}}
  async function rendered(){await page.waitForFunction(()=>/^(已更新|更新失败|预览暂未生成)/.test(document.querySelector('#preview-status').textContent),{},{timeout:180000});assert.ok((await page.locator('#preview-status').innerText()).startsWith('已更新'),'Current manuscript preview must finish');}
  async function detailsContaining(id){const details=page.locator('details').filter({has:page.locator('#'+id)}).last();if(await details.getAttribute('open')===null)await details.locator(':scope > summary').click();}
  async function download(selector,name){const waiting=page.waitForEvent('download',{timeout:180000});await page.locator(selector).click();const file=await waiting;assert.equal(await file.failure(),null);const path=resolve(folder,name);await file.saveAs(path);const bytes=await readFile(path);result.downloads.push({name,bytes:bytes.length,sha256:hash(bytes)});return path;}
  async function portable(name){await page.locator('#draft-menu').click();const path=await download('#save-draft',name);if(await page.locator('#draft-dialog').isVisible())await page.locator('[data-close="draft-dialog"]').click();return path;}
  async function exports(stem){
   await page.locator('[data-step="2"]').click();await rendered();
   for(const box of await page.locator('.review-issue input[type=checkbox]').all())await box.check();
   for(const format of ['txt','docx','pdf']){await page.locator(`[name=format][value=${format}]`).check();await page.locator('#export:not([disabled])').waitFor({timeout:180000});await download('#export',stem+'.'+format);}
  }
  try{
   await page.goto(server.url);await ready();
   const expected={...blank(),...source.fields,title:source.fields.title+source.reviewSuffix};
   await page.locator('#title').fill(expected.title);await page.locator('#recipient').fill(expected.recipient);
   await detailsContaining('signer');await page.locator('#reference').fill(expected.reference);await page.locator('#signer').fill(expected.signer);
   await page.locator('[data-step="1"]').click();await page.locator('#content-blocks').click();await page.keyboard.press('Control+A');await page.keyboard.insertText(expected.body);
   await page.locator('#signature').fill(expected.signature);await page.locator('#date').fill(expected.date);
   await detailsContaining('postscript');const post=page.locator('#postscript-content-blocks');
   if(await post.isVisible()){await post.click();await page.keyboard.press('Control+A');await page.keyboard.insertText(expected.postscript);}else await page.locator('#postscript').fill(expected.postscript);
   await detailsContaining('issuer');await page.locator('#issuer').fill(expected.issuer);
   await page.locator('#save-document').click();
   const partial=await read();check('Explicit office-only partial facts save as v7 without borrowing closing date',partial.version===7&&partial.fields.issuer===expected.issuer&&partial.fields.issueDate===''&&partial.fields.date===expected.date);
   const partialFile=await portable('partial.gongwen.json');const partialJSON=JSON.parse(await readFile(partialFile,'utf8'));assert.deepEqual(partialJSON.fields,partial.fields);
   await page.locator('[data-step="2"]').click();check('Missing print date blocks export at the visible missing field',await page.locator('[data-panel="1"]').isVisible()&&await page.locator('#issueDate-error').isVisible());
   await page.locator('#issueDate').fill(source.simulationIssueDates[0]);expected.issueDate=source.simulationIssueDates[0];
   await page.locator('#save-document').click();await page.reload();await ready();
   assert.deepEqual((await read()).fields,expected);check('Saving and reopening retains all explicit facts and unchanged source body',true);
   const portableFile=await portable('day-19.gongwen.json'),portableJSON=JSON.parse(await readFile(portableFile,'utf8'));assert.equal(portableJSON.version,7);assert.deepEqual(portableJSON.fields,expected);
   await exports('day-19');
   const txt=(await readFile(resolve(folder,'day-19.txt'),'utf8')).replace(/^\ufeff/,'');
   check('TXT signer is before title and independent printing day follows body and closing',txt.indexOf('签发人：'+expected.signer)<txt.indexOf(expected.title)&&txt.includes(expected.issuer+'\t2024年8月19日印发')&&txt.includes('2024年8月15日')&&txt.includes(expected.body));
   await page.locator('[data-step="1"]').click();await detailsContaining('issuer');await page.locator('#issueDate').fill(source.simulationIssueDates[1]);
   const changed=await read();expected.issueDate=source.simulationIssueDates[1];assert.deepEqual(changed.fields,expected);check('Second conflict branch changes only the explicitly entered printing date',true);
   await portable('day-23.gongwen.json');await exports('day-23');
   const txt23=await readFile(resolve(folder,'day-23.txt'),'utf8');check('Other-source printing date remains distinct from unchanged document date',txt23.includes(expected.issuer+'\t2024年8月23日印发')&&txt23.includes('2024年8月15日')&&!txt23.includes('2024年8月19日印发'));
   await page.locator('#draft-menu').click();await page.locator('#load-draft').setInputFiles(portableFile);await page.locator('#replace-dialog[open]').waitFor();await page.locator('#confirm-replace').click();
   await page.waitForFunction(()=>document.querySelector('#issueDate').value==='2024-08-19');if(await page.locator('#draft-dialog').isVisible())await page.locator('[data-close="draft-dialog"]').click();expected.issueDate=source.simulationIssueDates[0];
   const restored=await read();assert.deepEqual(restored.fields,expected);assert.deepEqual(restored.content,portableJSON.content);check('Normal portable v7 restore retains exact facts, paragraph IDs, body and suffix',true);
   await page.locator('[data-step="1"]').click();await detailsContaining('issuer');await page.locator('#issueDate').fill('');await page.locator('#save-document').click();
   await page.reload();await ready();check('Partial printing facts also survive refresh without forced completion',(await read()).fields.issueDate===''&&(await read()).fields.issuer===expected.issuer);
   await page.locator('[data-step="1"]').click();await detailsContaining('issuer');await page.locator('#issueDate').fill(source.simulationIssueDates[0]);await page.locator('[data-step="2"]').click();await rendered();check('Completing the pair restores current preview without re-entering source',true);
   await page.screenshot({path:resolve(folder,'final-preview.png')});
   assert.equal(result.feedbackRequests,0);assert.equal(result.uploadRequests,0);assert.equal(result.externalRequests,0);assert.deepEqual(result.errors,[]);result.passed=true;
  }catch(error){result.failure=error.stack;await page.screenshot({path:resolve(folder,'failure.png')}).catch(()=>{});throw error;}
  finally{await writeFile(resolve(out,reportName),JSON.stringify(report,null,2));await context.close();await browser.close();}
 }
 report.passed=report.profiles.length===selectedProfiles.length&&report.profiles.every(p=>p.passed);
}finally{await server.close();await writeFile(resolve(out,reportName),JSON.stringify(report,null,2));}
console.log(JSON.stringify({passed:report.passed,profiles:report.profiles.map(p=>({profile:p.profile,checks:p.checks.length,downloads:p.downloads.length,feedbackRequests:p.feedbackRequests,uploadRequests:p.uploadRequests}))}));
