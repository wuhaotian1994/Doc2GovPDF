import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {startWebServer} from './browser-tests/server.mjs';

const root=resolve(import.meta.dirname,'..'),require=createRequire(new URL('./browser-tests/package.json',import.meta.url)),{chromium}=require('playwright');
const source=process.env.HEALTH_OFFICE_ORIGINAL;
if(!source)throw Error('HEALTH_OFFICE_ORIGINAL must name the supplied complete original; do not invent a 415-character fixture.');
const originalBytes=await readFile(source),sourceSHA256=createHash('sha256').update(originalBytes).digest('hex');
assert.equal(sourceSHA256,'7dbde2fe81d11c526d8fb73ab143f572e3481500575fb9c0b87b126b9e37972c');
const original=JSON.parse(originalBytes),out=resolve(root,process.env.FONT_RECOVERY_OUT||'build/qa/font-resource-recovery');
await mkdir(out,{recursive:true});
const webRoot=resolve(root,process.env.FONT_RECOVERY_WEB_ROOT||'build/qa/font-memory-web');
const server=await startWebServer(webRoot),browser=await chromium.launch({headless:true,channel:'chrome',env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',NO_PROXY:'127.0.0.1,localhost'}});
const context=await browser.newContext({viewport:{width:1440,height:900},locale:'zh-CN',acceptDownloads:true,serviceWorkers:'block'});
const page=await context.newPage();page.setDefaultTimeout(180000);
const report={method:'Injected font HTTP 503 with the supplied complete original; not a reproduction or resolution of CEO renderer Error9.',sourceSHA256,webRoot,url:server.url,checks:[],errors:[],crashes:0,font503:[],fontResponses:[],downloads:[],mainNavigations:0,documentRequests:0,passed:false};
let denyFonts=true;
const check=(name,condition)=>{assert.ok(condition,name);report.checks.push(name);console.log(name);};
const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('gongwen-writer-v1')));
const exact=async()=>{const current=await read();assert.deepEqual(current.fields,original.fields);assert.deepEqual(current.content,original.content);};
context.on('response',response=>{if(/\/fonts\/[^/]+\.ttf(?:$|\?)/.test(response.url()))report.fontResponses.push({url:response.url(),status:response.status()});});
await context.route('**/*',route=>{
 const request=route.request(),url=new URL(request.url());
 if(url.hostname!=='127.0.0.1')return route.abort();
 if(denyFonts&&/\/fonts\/[^/]+\.ttf$/.test(url.pathname)){report.font503.push(url.pathname);return route.fulfill({status:503,contentType:'text/plain',body:'Injected unavailable font resource'});}
 return route.continue();
});
page.on('pageerror',error=>report.errors.push(error.message));page.on('crash',()=>report.crashes++);
page.on('framenavigated',frame=>{if(frame===page.mainFrame())report.mainNavigations++;});
page.on('request',request=>{if(request.isNavigationRequest()&&request.resourceType()==='document')report.documentRequests++;});
try{
 await page.goto(server.url);await page.waitForFunction(()=>window.writerReady);
 await page.locator('#draft-menu').click();await page.locator('#load-draft').setInputFiles(source);
 if(await page.locator('#replace-dialog').isVisible())await page.locator('#confirm-replace').click();
 await page.waitForFunction(title=>document.getElementById('title').value===title,original.fields.title);
 if(await page.locator('#draft-dialog').isVisible())await page.locator('[data-close="draft-dialog"]').click();
 await page.locator('[data-step="1"]').click();
 await page.waitForFunction(()=>/预览暂未生成|更新失败/.test(document.getElementById('preview-status').textContent)&&document.getElementById('preview-canvas').getAttribute('aria-busy')==='false'&&document.getElementById('global-error').textContent.trim());
 report.failureStatus=await page.locator('#preview-status').innerText();report.failureMessage=await page.locator('#global-error').innerText();
 check('font resource 503 produces an explicit stopped preview failure',report.font503.length>0&&Boolean(report.failureMessage));
 await page.locator('#save-document').click();await exact();
 check('failed preview keeps exact original fields and all 39 content blocks',original.content.blocks.length===39);
 await page.locator('#draft-menu').click();const downloading=page.waitForEvent('download');await page.locator('#save-draft').click();const portable=await downloading;
 await portable.saveAs(resolve(out,'preserved.gongwen.json'));assert.equal(await portable.failure(),null);
 const saved=JSON.parse(await readFile(resolve(out,'preserved.gongwen.json'),'utf8'));assert.deepEqual(saved.fields,original.fields);assert.deepEqual(saved.content,original.content);
 check('save and portable draft download work while every font request is failing',true);
 await page.locator('[data-close="draft-dialog"]').click();await page.screenshot({path:resolve(out,'font-unavailable.png')});
 denyFonts=false;
 const recoveryStarted=Date.now();await page.locator('#refresh-preview').click();
 await page.waitForFunction(()=>document.getElementById('preview-status').textContent.startsWith('已更新'));
 report.retryPreviewMs=Date.now()-recoveryStarted;await exact();
 check('one visible preview retry recovers without reload or re-entering text',report.documentRequests===1&&await page.locator('#pdf-pages canvas').count()===1);
 report.recoveredStatus=await page.locator('#preview-status').innerText();
 check('recovered preview still has seven complete original pages',/7 页/.test(report.recoveredStatus));
 await page.screenshot({path:resolve(out,'font-recovered.png')});
 await page.locator('[data-step="2"]').click();
 for(const box of await page.locator('.review-issue input[type=checkbox]').all())await box.check();
 for(const format of ['docx','pdf']){
  await page.locator(`[name=format][value=${format}]`).check();await page.locator('#export:not([disabled])').waitFor();
  const waiting=page.waitForEvent('download');await page.locator('#export').click();const file=await waiting;assert.equal(await file.failure(),null);
  const path=resolve(out,'original.'+format);await file.saveAs(path);const bytes=await readFile(path);report.downloads.push({format,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
 }
 await exact();check('recovered original exports actual Word and PDF and keeps current draft exact',report.downloads.length===2);
 check('fault injection causes no page error or renderer crash',report.errors.length===0&&report.crashes===0);
 check('restored resource requests succeed after the explicit retry',report.fontResponses.some(value=>value.status===200));
 report.passed=true;
}catch(error){report.failure=error.stack;try{await page.screenshot({path:resolve(out,'failure.png')});}catch{}console.error(error.stack);}
finally{await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));await browser.close();await server.close();}
if(!report.passed)process.exitCode=1;
