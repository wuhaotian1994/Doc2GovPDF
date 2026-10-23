// Actual normal writer reopen/save/reload/export against a caller-owned DOCX.
// No manuscript text or font files are built into this test or uploaded.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {startWebServer} from './browser-tests/server.mjs';
const root=resolve(import.meta.dirname,'..'),require=createRequire(new URL('./browser-tests/package.json',import.meta.url)),{chromium}=require('playwright');
if(!process.env.RECEIVER_WORD_INPUT||!process.env.RECEIVER_WEB_ROOT||!process.env.RECEIVER_ROUNDTRIP_OUT)throw Error('Set exact input DOCX, frozen web root and output directory; no substitute sample is created.');
const input=resolve(process.env.RECEIVER_WORD_INPUT),original=await readFile(input),hash=b=>createHash('sha256').update(b).digest('hex'),out=resolve(process.env.RECEIVER_ROUNDTRIP_OUT);await mkdir(out,{recursive:true});
const server=process.env.RECEIVER_URL?{url:process.env.RECEIVER_URL,async close(){}}:await startWebServer(resolve(process.env.RECEIVER_WEB_ROOT));
const report={method:'Normal writer actual DOCX open, explicit PDF reflow acknowledgement, save, refresh and two real export pairs. No native renderer is implied.',inputDOCXSHA256:hash(original),wasmSHA256:hash(await readFile(resolve(process.env.RECEIVER_WEB_ROOT,'document-engine.wasm'))),checks:[],files:[],errors:[],feedbackRequests:0,uploadRequests:0,externalRequests:0,passed:false};
let browser;
try{
 browser=await chromium.launch({headless:true,channel:'chrome',env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',NO_PROXY:'127.0.0.1,localhost'}});
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',acceptDownloads:true,serviceWorkers:'block'});
 await context.route('**/*',route=>{const request=route.request(),url=new URL(request.url());if(url.pathname.startsWith('/api/feedback/')){report.feedbackRequests++;return route.abort();}if(!['GET','HEAD'].includes(request.method())){report.uploadRequests++;return route.abort();}if(url.hostname!=='127.0.0.1'){report.externalRequests++;return route.abort();}return route.continue();});
 const page=await context.newPage();page.setDefaultTimeout(180000);page.on('pageerror',error=>report.errors.push(error.message));
 const check=(label,value)=>{assert.ok(value,label);report.checks.push(label);};
 async function ready(){await page.waitForFunction(()=>window.writerReady===true);if(await page.locator('#font-start-fallback').isVisible())await page.locator('#font-start-fallback').click();}
 async function rendered(){await page.waitForFunction(()=>/^(已更新|更新失败|预览暂未生成)/.test(document.getElementById('preview-status').textContent));assert.ok((await page.locator('#preview-status').innerText()).startsWith('已更新'));}
 async function pair(stem){
  await page.locator('[data-step="2"]').click();await rendered();for(const box of await page.locator('.review-issue input[type=checkbox]').all())await box.check();await page.locator('#word-pdf-ack').check();
  for(const format of ['docx','pdf']){await page.locator(`[name=format][value=${format}]`).check();await page.locator('#export:not([disabled])').waitFor();const waiting=page.waitForEvent('download');await page.locator('#export').click();const file=await waiting;assert.equal(await file.failure(),null);const path=resolve(out,stem+'.'+format);await file.saveAs(path);const bytes=await readFile(path);if(format==='docx')assert.deepEqual(bytes,original,'Actual original Word save must be byte-identical');report.files.push({file:stem+'.'+format,sha256:hash(bytes),bytes:bytes.length});}
 }
 await page.goto(server.url);await ready();await page.locator('#load-draft').setInputFiles(input);await page.waitForSelector('body.word-mode');await rendered();check('Actual supplied Word enters the normal protected Word workspace and renders',true);
 await pair('opened');check('First actual Word export is byte-identical and PDF download succeeds',true);
 await page.locator('#save-document').click();await page.waitForFunction(()=>document.getElementById('save-status').textContent==='已保存到此浏览器');await page.reload();await ready();await page.waitForSelector('body.word-mode');await rendered();check('Normal save and refresh restore the same Word workspace',true);
 await pair('reloaded');check('Actual Word bytes remain exact and PDF still exports after refresh',true);
 check('Input file bytes and final frozen Wasm are unchanged',hash(await readFile(input))===report.inputDOCXSHA256&&hash(await readFile(resolve(process.env.RECEIVER_WEB_ROOT,'document-engine.wasm')))===report.wasmSHA256);
 check('Document flow sends no feedback, upload or external request',report.feedbackRequests===0&&report.uploadRequests===0&&report.externalRequests===0);assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.failure=error.message;throw error;}finally{await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));if(browser)await browser.close();await server.close();}
console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,files:report.files.length,feedbackRequests:report.feedbackRequests,uploadRequests:report.uploadRequests}));
