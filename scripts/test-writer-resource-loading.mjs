import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {startWebServer} from './browser-tests/server.mjs';
const root=resolve(import.meta.dirname,'..'),require=createRequire(new URL('./browser-tests/package.json',import.meta.url)),{chromium}=require('playwright');
const out=resolve(root,process.env.RESOURCE_OUTPUT||'build/qa/resource-loading');await mkdir(out,{recursive:true});
const server=process.env.RESOURCE_URL?{url:process.env.RESOURCE_URL,close:async()=>{}}:await startWebServer(resolve(root,process.env.WRITER_WEB_ROOT||'build/qa/fast-web'));
const browser=await chromium.launch({headless:true,channel:'chrome',env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',NO_PROXY:'127.0.0.1,localhost'}});
const report={url:server.url,browser:browser.version(),checks:[],errors:[],requests:[],networkResponses:[],timings:{},passed:false};
const check=(name,condition)=>{assert.ok(condition,name);report.checks.push(name);console.log(name);};
const context=await browser.newContext({viewport:{width:1366,height:900},locale:'zh-CN',acceptDownloads:true});
context.on('request',request=>report.requests.push({url:request.url(),method:request.method()}));
context.on('response',response=>{if(!response.fromServiceWorker())report.networkResponses.push({url:response.url(),status:response.status()});});
let page=await context.newPage();page.setDefaultTimeout(120000);page.on('pageerror',error=>report.errors.push(error.message));
const fontRequests=()=>report.networkResponses.filter(request=>/\/fonts\/serif(?:-black)?-(?:core|full)\.ttf$/.test(request.url));
const engineRequests=()=>report.networkResponses.filter(request=>/\/document-engine\.wasm$/.test(request.url));
const ready=()=>page.waitForFunction(()=>document.getElementById('preview-status').textContent.startsWith('已更新'),{},{timeout:120000});
async function body(value){await page.locator('[data-step="1"]').click();await page.locator('#content-blocks').click();await page.keyboard.press('Control+A');await page.keyboard.insertText(value);}
async function download(format,name){await page.locator('[data-step="2"]').click();for(const box of await page.locator('.review-issue input[type=checkbox]').all())await box.check();await page.locator(`[name=format][value=${format}]`).check();await page.locator('#export:not([disabled])').waitFor();const waiting=page.waitForEvent('download');await page.locator('#export').click();const file=await waiting;await file.saveAs(resolve(out,name));assert.equal(await file.failure(),null);}
try{
  const started=Date.now();await page.goto(server.url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.writerReady);if(await page.locator('#font-start-fallback').isVisible())await page.locator('#font-start-fallback').click();report.timings.editableMs=Date.now()-started;
  check('empty page does not download fallback font files',fontRequests().length===0);
  await page.locator('#title').fill('关于资料整理的通知');await body('请各部门核对工作记录。\n一、工作要求\n保留原始资料，完成后及时归档。');await ready();report.timings.firstPreviewMs=Date.now()-started;
  check('common document renders with only common fallback faces',fontRequests().length===2&&fontRequests().every(request=>request.url.endsWith('-core.ttf')));
  check('service worker does not start a competing engine download',engineRequests().length===1);
  await download('pdf','common.pdf');await page.screenshot({path:resolve(out,'common.png')});
  const before={engine:engineRequests().length,fonts:fontRequests().length};
  const warmStarted=Date.now();await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.writerReady);if(await page.locator('#font-start-fallback').isVisible())await page.locator('#font-start-fallback').click();await ready();report.timings.warmPreviewMs=Date.now()-warmStarted;
  check('warm reload reuses verified engine and font bytes',engineRequests().length===before.engine&&fontRequests().length===before.fonts);
  await body('请核对龘字，原文字形不能被替换。');await ready();
  check('rare body loads only the needed complete face',fontRequests().filter(request=>request.url.endsWith('serif-full.ttf')).length===1&&!fontRequests().some(request=>request.url.endsWith('serif-black-full.ttf')));
  await download('pdf','rare.pdf');
  await download('docx','editable.docx');
  check('Word downloads complete fallback faces only at export',fontRequests().some(request=>request.url.endsWith('serif-black-full.ttf')));
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>navigator.serviceWorker.controller?.state==='activated');await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.writerReady);if(await page.locator('#font-start-fallback').isVisible())await page.locator('#font-start-fallback').click();await ready();await download('pdf','offline.pdf');check('previously prepared document still previews and exports offline',true);await context.setOffline(false);
  if(process.env.SOURCE_WORD){
    await page.locator('#load-draft').setInputFiles(process.env.SOURCE_WORD);await page.waitForSelector('body.word-mode');await ready();
    check('original Word renders with the split font resources',await page.locator('#pdf-pages canvas').count()>0);
    await download('docx','original.docx');check('original Word export preserves exact original bytes',(await readFile(resolve(out,'original.docx'))).equals(await readFile(process.env.SOURCE_WORD)));
    await page.locator('#word-pdf-ack').check();await download('pdf','original.pdf');
  }
  await context.close();
  const localContext=await browser.newContext({viewport:{width:1366,height:900},locale:'zh-CN',acceptDownloads:true,serviceWorkers:'block'});const localRequests=[];localContext.on('request',request=>localRequests.push(request.url()));page=await localContext.newPage();page.setDefaultTimeout(120000);page.on('pageerror',error=>report.errors.push(error.message));
  await page.goto(server.url);await page.waitForFunction(()=>window.writerReady);if(await page.locator('#font-start-fallback').isVisible())await page.locator('#font-start-fallback').click();await page.locator('#settings-open').click();
  for(const role of ['仿宋','楷体','黑体','宋体','方正小标宋简体']){
    await page.locator('#font-role').selectOption(role);
    await page.locator('#font-file').setInputFiles(resolve(root,'assets/fonts/web',role==='黑体'||role==='方正小标宋简体'?'NotoSerifSC-Black.ttf':'NotoSerifSC.ttf'));
    await page.locator('#font-candidate:not([hidden])').waitFor();await page.locator('#font-use:not([disabled])').click();await page.waitForFunction(()=>document.getElementById('font-message').textContent.includes('字体已保存'));
  }
  await page.locator('[data-close="settings-dialog"]').click();await page.locator('#title').fill('关于资料整理的通知');await body('请各部门核对工作记录。');await ready();await download('pdf','selected-fonts.pdf');
  check('explicitly selected covering faces avoid every fallback download',!localRequests.some(url=>/\/fonts\/serif(?:-black)?-(?:core|full)\.ttf$/.test(url)));
  const metricStable=await page.evaluate(async()=>{
    const worker=new Worker('./engine-worker.js'),pending=new Map();let sequence=0;
    const boot=new Promise((resolve,reject)=>{worker.onmessage=({data})=>{if(data.ready)resolve();if(data.fatal)reject(Error(data.fatal));const task=pending.get(data.id);if(task){pending.delete(data.id);data.error?task.reject(Error(data.error)):task.resolve(data.value);}};worker.onerror=reject;});
    const call=(method,...args)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});worker.postMessage({id,request:{method,args}});});
    try{await boot;const fields={kind:'report',title:'附件位置核对',body:'请按要求办理。',attachments:['资料目录','汇总表'],signers:['甲','乙','丙'],reference:'办〔2026〕1号',date:'2026-10-22'};const first=await call('BuildDocument',fields),second=await call('BuildDocument',fields);return JSON.stringify(first)===JSON.stringify(second);}finally{worker.terminate();}
  });
  check('first model uses the same real font metrics as a warmed engine',metricStable);
  await localContext.close();
  check('no document upload requests',report.requests.every(request=>request.method==='GET'));
  check('no runtime errors',report.errors.length===0);report.passed=true;
}catch(error){report.failure=error.stack;try{report.visibleError=await page.locator('#global-error').innerText();await page.screenshot({path:resolve(out,'failure.png')});}catch{}console.error(error.stack);}
finally{await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));await browser.close();await server.close();}
if(!report.passed)process.exitCode=1;
