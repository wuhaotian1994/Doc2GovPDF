import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {startWebServer} from './browser-tests/server.mjs';
import {inspectFont} from '../web/write-font-source.js';
import {recommendFace} from '../web/write-local-fonts.js';
const root=resolve(import.meta.dirname,'..'),require=createRequire(new URL('./browser-tests/package.json',import.meta.url)),{chromium}=require('playwright');
const out=resolve(root,process.env.LOCAL_FIRST_OUTPUT||'build/qa/local-first');await mkdir(out,{recursive:true});
const server=process.env.LOCAL_FIRST_URL?{url:process.env.LOCAL_FIRST_URL,close:async()=>{}}:await startWebServer(process.env.WRITER_WEB_ROOT||root+'/build/qa/local-first-web');
const browser=await chromium.launch({channel:'chrome',headless:true,env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',NO_PROXY:'127.0.0.1,localhost,39.107.57.217'}});
const report={browser:browser.version(),url:server.url,method:'Synthetic permission and enumeration; real public OFL font bytes, no customer installed fonts accessed. Timings include automated choices, not human permission-reading time.',checks:[],errors:[],timings:{},passed:false};
const check=(name,value)=>{assert.ok(value,name);report.checks.push(name);console.log(name);};
const folder=process.env.LOCAL_FIRST_FULL?'assets/fonts':'assets/fonts/web';
const regular=await readFile(resolve(root,folder,'NotoSerifSC.ttf')),black=await readFile(resolve(root,folder,'NotoSerifSC-Black.ttf'));
report.fixtureBytes=[regular.length,black.length];
const fixtures=[{data:regular.toString('base64'),face:inspectFont(regular).faces[0]},{data:black.toString('base64'),face:inspectFont(black).faces[0]}];
const ready=page=>page.waitForFunction(()=>document.getElementById('preview-status').textContent.startsWith('已更新'),{},{timeout:120000});
async function fill(page){await page.locator('#title').fill('关于资料整理的通知');await page.locator('[data-next="1"]').click();await page.locator('#content-blocks').click();await page.keyboard.insertText('请各部门核对工作记录。');}
try{
  check('known family matching prefers regular and visibly substitutes missing title face',recommendFace([{family:'SimSun',style:'Bold'},{family:'SimSun',style:'Regular'},{family:'SimHei',style:'Regular'}],'宋体')===1&&recommendFace([{family:'SimHei',style:'Regular'}],'方正小标宋简体')===0&&recommendFace([{family:'Unknown',style:'Regular'}],'仿宋')===-1);
  const context=await browser.newContext({viewport:{width:1366,height:900},locale:'zh-CN',acceptDownloads:true});const network=[];context.on('request',r=>network.push({url:r.url(),method:r.method()}));
  await context.addInitScript(()=>{const Native=Worker;window.fontWorkerTimings=[];window.Worker=class extends Native{constructor(...args){super(...args);this.calls=new Map();this.addEventListener('message',({data})=>{const call=this.calls.get(data.id);if(call){fontWorkerTimings.push({method:call.method,ms:performance.now()-call.start});this.calls.delete(data.id);}});}postMessage(data,...rest){if(data.id)this.calls.set(data.id,{method:data.request?.method,start:performance.now()});super.postMessage(data,...rest);}};});
  await context.addInitScript(fixtures=>{window.localFontCalls={query:0,blob:0};window.queryLocalFonts=async()=>{localFontCalls.query++;return ['仿宋','宋体','楷体','黑体'].map((family,i)=>{const item=fixtures[i===3?1:0];return {family,fullName:item.face.fullName,postscriptName:item.face.postscriptName,style:'Regular',blob:async()=>{localFontCalls.blob++;return new Blob([(()=>{const text=atob(item.data),data=new Uint8Array(text.length);for(let j=0;j<text.length;j++)data[j]=text.charCodeAt(j);return data;})()]);}};});};},fixtures);
  const page=await context.newPage();page.setDefaultTimeout(120000);page.on('pageerror',e=>report.errors.push(e.message));
  const start=Date.now();await page.goto(server.url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.writerReady);report.timings.editableMs=Date.now()-start;
  await fill(page);await page.waitForTimeout(450);check('first preview offers local fonts without silently querying or downloading fallback',await page.locator('#font-start').isVisible()&&await page.evaluate(()=>localFontCalls.query===0)&&!network.some(r=>/\/fonts\/serif/.test(r.url)));
  await page.screenshot({path:out+'/first-choice.png'});
  await page.locator('#font-start-local').click();await page.locator('#font-batch-use:not([disabled])').waitFor();check('one explicit permission lists all five document uses',await page.locator('#font-batch-roles select').count()===5&&await page.evaluate(()=>localFontCalls.query===1));
  await page.screenshot({path:out+'/font-choices.png'});
  const adopted=Date.now();await page.locator('#font-batch-use').click();await page.waitForFunction(()=>!document.getElementById('local-font-dialog').open);await ready(page);report.timings.firstPreviewMs=Date.now()-start;report.timings.adoptToPreviewMs=Date.now()-adopted;
  check('one confirmation prepares all roles with no fallback font request',!network.some(r=>/\/fonts\/serif/.test(r.url))&&await page.evaluate(()=>localFontCalls.blob===2));
  await page.locator('[data-step="2"]').click();for(const box of await page.locator('.review-issue input[type=checkbox]').all())await box.check();await page.locator('[name=format][value=pdf]').check();const waiting=page.waitForEvent('download');await page.locator('#export:not([disabled])').click();await(await waiting).saveAs(out+'/local.pdf');
  await page.waitForFunction(()=>!document.getElementById('export').disabled);await page.screenshot({path:out+'/preview.png'});
  report.firstWorkerTimings=await page.evaluate(()=>fontWorkerTimings);
  const warm=Date.now();await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.writerReady);await ready(page);report.timings.warmPreviewMs=Date.now()-warm;
  check('saved local fonts are reused without another permission request',await page.locator('#font-start').isHidden()&&await page.evaluate(()=>localFontCalls.query===0)&&!network.some(r=>/\/fonts\/serif/.test(r.url)));
  report.workerTimings=await page.evaluate(()=>fontWorkerTimings);
  check('document and font data stay local',network.every(r=>r.method==='GET'));
  if(!process.env.LOCAL_FIRST_MEASURE_ONLY){
    const storedHash=()=>page.evaluate(async()=>{const data=await new Promise((resolve,reject)=>{const open=indexedDB.open('gongwen-writer-fonts',1);open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,request=db.transaction('fonts').objectStore('fonts').get('custom');request.onsuccess=()=>{resolve(request.result);db.close();};request.onerror=()=>reject(request.error);};});const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data)));return Array.from(new Uint8Array(hash)).join(',');});
    const before=await storedHash();
    await page.evaluate(()=>{window.fontPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='fonts')throw Error('font quota simulated');return fontPut.apply(this,args);};});
    await page.locator('#settings-open').click();await page.locator('#font-batch-open').click();await page.locator('#font-batch-use:not([disabled])').waitFor();await page.locator('[data-font-role="仿宋"]').selectOption('0');await page.locator('#font-batch-use').click();await page.waitForFunction(()=>document.getElementById('font-batch-message').textContent.includes('font quota simulated'));
    check('failed batch storage keeps every previously saved face',await storedHash()===before);
    await page.evaluate(()=>IDBObjectStore.prototype.put=fontPut);await page.locator('[data-close="local-font-dialog"]').click();await ready(page);
    await page.evaluate(()=>{const prior=window.queryLocalFonts;window.goodLocalQuery=prior;window.queryLocalFonts=async()=>{const faces=await prior();return [{...faces[0],family:'仿宋',postscriptName:'mismatched-face'}];};});
    await page.locator('#settings-open').click();await page.locator('#font-batch-open').click();await page.locator('#font-batch-use:not([disabled])').waitFor();await page.locator('[data-font-role="仿宋"]').selectOption('0');await page.locator('#font-batch-use').click();await page.waitForFunction(()=>document.getElementById('font-batch-message').textContent.includes('不一致'));
    check('mismatched batch face is rejected before changing saved fonts',await storedHash()===before&&await page.locator('#title').inputValue()==='关于资料整理的通知');
    if(process.env.SOURCE_WORD){
      await page.locator('[data-close="local-font-dialog"]').click();await page.evaluate(()=>window.queryLocalFonts=goodLocalQuery);await page.locator('#load-draft').setInputFiles(process.env.SOURCE_WORD);await page.waitForSelector('body.word-mode');await ready(page);
      const wordFonts=()=>page.evaluate(async()=>{const store=await import('./write-word-store.js');const record=await store.loadWord(store.activeWord());const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(record.fonts)));return Array.from(new Uint8Array(hash)).join(',');});const oldWordFonts=await wordFonts();
      await page.evaluate(()=>{window.wordPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='files')throw Error('word quota simulated');return wordPut.apply(this,args);};});
      await page.locator('#settings-open').click();await page.locator('#font-batch-open').click();await page.locator('#font-batch-use:not([disabled])').waitFor();await page.locator('[data-font-role="仿宋"]').selectOption('0');await page.locator('#font-batch-use').click();await page.waitForFunction(()=>document.getElementById('font-batch-message').textContent.includes('word quota simulated'));
      await page.evaluate(()=>IDBObjectStore.prototype.put=wordPut);await page.locator('[data-close="local-font-dialog"]').click();await page.locator('#settings-open').click();await page.waitForFunction(()=>document.getElementById('font-status').textContent.includes('仿宋：Noto Serif SC Regular'));
      check('original Word batch failure restores both memory and stored fonts',await wordFonts()===oldWordFonts);
      await page.locator('#font-batch-open').click();await page.locator('#font-batch-use:not([disabled])').waitFor();await page.locator('[data-font-role="仿宋"]').selectOption('0');await page.locator('#font-batch-use').click();await page.waitForFunction(()=>!document.getElementById('local-font-dialog').open);await ready(page);check('original Word batch success actually persists the adopted font',await wordFonts()!==oldWordFonts);
    }
  }
  await context.close();
  if(!process.env.LOCAL_FIRST_MEASURE_ONLY){
    const denied=await browser.newContext({viewport:{width:1280,height:720},locale:'zh-CN'});await denied.addInitScript(()=>window.queryLocalFonts=async()=>{throw new DOMException('denied','NotAllowedError');});const p=await denied.newPage();await p.goto(server.url);await p.waitForFunction(()=>window.writerReady);await fill(p);await p.locator('#font-start-local').click();await p.waitForFunction(()=>document.getElementById('font-batch-message').textContent.includes('未获得'));check('denied permission keeps content and offers the existing alternatives',await p.locator('#title').inputValue()==='关于资料整理的通知'&&await p.locator('#font-batch-file').isEnabled());await p.locator('[data-close="local-font-dialog"]').click();await p.locator('#font-start-fallback').click();await ready(p);check('declining local fonts can still produce a real PDF preview',await p.locator('#pdf-pages canvas').count()>0);await denied.close();
    const unsupported=await browser.newContext();await unsupported.addInitScript(()=>window.queryLocalFonts=undefined);const p2=await unsupported.newPage();await p2.goto(server.url);await p2.waitForFunction(()=>window.writerReady);await fill(p2);await ready(p2);check('unsupported browsers keep automatic fallback preview',await p2.locator('#font-start').isHidden());await unsupported.close();
  }
  check('no runtime errors',report.errors.length===0);report.passed=true;
}catch(error){report.failure=error.stack;console.error(error.stack);}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();await server.close();}
if(!report.passed)process.exitCode=1;
