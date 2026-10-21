import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {materials} from './fixtures/writer-materials.mjs';
import {startWebServer} from './browser-tests/server.mjs';
const require=createRequire(new URL('./browser-tests/package.json',import.meta.url));
const {chromium,firefox,webkit}=require('playwright');
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'build/qa/ceo-004');
await mkdir(out,{recursive:true});
const server=await startWebServer(resolve(root,process.env.WRITER_WEB_ROOT||'build/qa/ceo-004-web'));
const profiles=[{id:'chrome',engine:chromium,channel:'chrome'},{id:'firefox',engine:firefox},{id:'webkit',engine:webkit}].filter(p=>!process.env.MATERIAL_PROFILE||process.env.MATERIAL_PROFILE.split(',').includes(p.id));
const results=[];
try{
 for(const profile of profiles){
  const browser=await profile.engine.launch({headless:true,...(profile.channel?{channel:profile.channel}:{}),env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',http_proxy:'',https_proxy:'',all_proxy:'',NO_PROXY:'127.0.0.1,localhost'},...(profile.id==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
  try{for(const material of materials){
   const folder=resolve(out,profile.id+'-'+material.id);await mkdir(folder,{recursive:true});
   const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',timezoneId:'Asia/Shanghai',acceptDownloads:true,serviceWorkers:'block'});
   const page=await context.newPage();page.setDefaultTimeout(30000);
   const result={profile:profile.id,version:browser.version(),material:material.id,checks:[],errors:[],passed:false};
   const check=(name,value)=>{assert.ok(value,name);result.checks.push(name);console.log(profile.id+'/'+material.id+': '+name);};
   page.on('pageerror',e=>result.errors.push(e.message));
   const download=async(selector,name)=>{const waiting=page.waitForEvent('download',{timeout:120000});await page.locator(selector).click();const file=await waiting;assert.equal(await file.failure(),null);await file.saveAs(resolve(folder,name));};
   const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('gongwen-writer-v1')));
   // Synthetic event payload: no operating-system clipboard or foreground input.
   const overflow=()=>page.evaluate(()=>{const node=document.getElementById('pendingMaterial'),event=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{getData:()=>'x'.repeat(100001)}});return !node.dispatchEvent(event);});
   try{
    let release;const gate=new Promise(r=>release=r);
    await page.route('**/write.js',async route=>{await gate;await route.continue();});
    await page.goto(server.url,{waitUntil:'commit'});
    await page.locator('#material-entry summary').click();await page.locator('#pendingMaterial').fill(material.raw);
    check('whole source is entered before startup without presplitting fields',!(await page.evaluate(()=>window.writerReady))&&await page.locator('#title').inputValue()==='');
    check('oversized paste is rejected before startup without truncating source',await overflow()&&await page.locator('#pendingMaterial').inputValue()===material.raw);
    await page.reload({waitUntil:'commit'});
    check('whole pending source survives reload before module startup',await page.locator('#pendingMaterial').inputValue()===material.raw);
    release();await page.waitForFunction(()=>window.writerReady===true);await page.unroute('**/write.js');
    check('oversized paste is rejected after startup without replacing source',await overflow()&&await page.locator('#pendingMaterial').inputValue()===material.raw);
    await page.locator('#material-open').click();
    check('review starts with no implicit extraction or wrap merging',await page.locator('#material-candidates input:checked').count()===0&&!await page.locator('#material-join').isChecked()&&await page.locator('#material-apply').isDisabled());
    check('preview keeps all original lines until confirmed',await page.locator('#material-body-preview').inputValue()===material.raw);
    await page.locator('#material-dialog [data-close]').first().click();
    check('cancel preserves pending source and does not change the document',(await state()).fields.pendingMaterial===material.raw&&(await state()).fields.body==='');
    await page.locator('#material-open').click();
    for(const field of material.id==='notice'?['title','recipient','signature','date']:['title'])await page.locator(`[data-material-field=${field}]`).check();
    if(material.id==='wrapped'){
     check('no signature or date is guessed from ordinary trailing prose',await page.locator('[data-material-field=signature],[data-material-field=date]').count()===0);
     check('hard wraps remain separate until author opts in',(await page.locator('#material-body-preview').inputValue()).split('\n').filter(Boolean).length===4);
     await page.locator('#material-join').check();
     check('author-confirmed blank-line groups produce two body paragraphs',(await page.locator('#material-body-preview').inputValue()).split('\n').length===2);
    }
    check('candidate selection changes only the proposal, not saved working fields',(await state()).fields.title===''&&(await state()).fields.body==='');
    if(profile.id==='chrome')await page.screenshot({path:resolve(folder,'proposal.png'),fullPage:true});
    const proposed=await page.locator('#material-body-preview').inputValue();await page.locator('#material-apply').click();
    await page.waitForFunction(()=>!document.getElementById('material-dialog').open);
    const applied=await state();
    check('confirmed material fills title/body and preserves full source in a v2 draft',applied.version===2&&applied.fields.sourceMaterial===material.raw&&applied.fields.pendingMaterial===''&&applied.fields.title===material.raw.split('\n')[0]&&applied.fields.body===proposed);
    check('ordinary source preparation stays in the guided flow',context.pages().length===1&&!page.url().includes('advanced'));
    if(material.id==='notice')check('authored date and signature are extracted independently of the deadline',applied.fields.date==='2026-10-21'&&applied.fields.signature==='综合办公室'&&applied.fields.recipient==='各部门'&&!applied.fields.body.includes('综合办公室'));
    await page.locator('#material-source summary').click();
    check('original is visible and read-only',await page.locator('#sourceMaterial').inputValue()===material.raw&&await page.locator('#sourceMaterial').getAttribute('readonly')!==null);
    await download('#material-download-original','original.txt');check('downloaded original text retains every line',await readFile(resolve(folder,'original.txt'),'utf8')===material.raw);
    await page.locator('[data-step="0"]').click();
    if(!await page.locator('#material-entry').evaluate(n=>n.open))await page.locator('#material-entry summary').click();
    await page.locator('#pendingMaterial').fill('尚未采用的新材料\n这个数字 9071 不能进入成品。');
    await page.locator('[data-step="2"]').click();await page.waitForFunction(()=>document.getElementById('preview-status').textContent.startsWith('已更新'),{},{timeout:120000});
    for(const box of await page.locator('.review-issue input[type=checkbox]').all())await box.check();
    for(const format of ['docx','pdf','txt']){await page.locator(`[name=format][value=${format}]`).check();await page.locator('#export:not([disabled])').waitFor();await download('#export','final.'+format);}
    check('actual Word/PDF/TXT export while a different pending source remains unapplied',(await state()).fields.body===proposed&&(await state()).fields.pendingMaterial.includes('9071'));
    await page.locator('#draft-menu').click();await download('#save-draft','draft.gongwen.json');await page.locator('#draft-dialog [data-close]').first().click();
    const saved=JSON.parse(await readFile(resolve(folder,'draft.gongwen.json'),'utf8'));
    check('portable draft retains source and unadopted pending source',saved.version===2&&saved.fields.sourceMaterial===material.raw&&saved.fields.pendingMaterial.includes('9071'));
    await page.reload();await page.waitForFunction(()=>window.writerReady===true);
    check('reopening retains confirmed content and both source states',(await state()).fields.body===proposed&&(await state()).fields.sourceMaterial===material.raw&&(await state()).fields.pendingMaterial.includes('9071'));
    await page.locator('[data-step="0"]').click();if(profile.id==='chrome')await page.screenshot({path:resolve(folder,'restored.png'),fullPage:true});
    // A full archive must fail safely rather than losing either the current draft or the source.
    if(profile.id==='chrome'&&material.id==='notice'){
     await page.evaluate(async()=>{const {blank,draft}=await import('./write-model.js');localStorage.setItem('gongwen-writer-library-v1',JSON.stringify({version:1,items:Array.from({length:20},(_,i)=>({id:'old-'+i,savedAt:new Date().toISOString(),document:draft({...blank(),title:'旧稿'+i,body:'保留'},0,'old-'+i)}))}));});
     await page.reload();await page.waitForFunction(()=>window.writerReady===true);await page.locator('[data-step="0"]').click();
     if(!await page.locator('#material-entry').evaluate(n=>n.open))await page.locator('#material-entry summary').click();await page.locator('#pendingMaterial').fill(material.raw);await page.locator('#material-open').click();
     for(const field of ['title','recipient','signature','date'])await page.locator(`[data-material-field=${field}]`).check();await page.locator('#material-apply').click();
     check('full archive cancels replacement visibly without losing current content or source',await page.locator('#material-dialog').evaluate(n=>n.open)&&(await page.locator('#material-message').innerText()).includes('20')&&(await state()).fields.body===proposed&&(await state()).fields.sourceMaterial===material.raw&&(await state()).fields.pendingMaterial===material.raw);
    }
    check('no browser runtime errors',result.errors.length===0);result.passed=true;
   }catch(error){result.error=error.stack;await page.screenshot({path:resolve(folder,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
   finally{results.push(result);await writeFile(resolve(out,'browser-result.json'),JSON.stringify(results,null,2));await context.close();}
  }}finally{await browser.close();}
 }
}finally{await server.close();}
