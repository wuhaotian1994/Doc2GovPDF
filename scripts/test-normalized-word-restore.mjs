// Restore an explicitly normalized caller-owned Word record through the normal UI.
// No manuscript content or font file is included in this script.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {startWebServer} from './browser-tests/server.mjs';
const require=createRequire(new URL('./browser-tests/package.json',import.meta.url)),{chromium}=require('playwright');
const required=['NORMALIZED_SOURCE','NORMALIZED_MODEL','NORMALIZED_EXPECTED_WORD','NORMALIZED_WEB_ROOT','NORMALIZED_OUT'];
for(const key of required)if(!process.env[key])throw Error('Missing explicit caller-owned path: '+key);
const source=resolve(process.env.NORMALIZED_SOURCE),original=await readFile(source),modelBytes=await readFile(resolve(process.env.NORMALIZED_MODEL)),model=JSON.parse(modelBytes),expected=await readFile(resolve(process.env.NORMALIZED_EXPECTED_WORD)),out=resolve(process.env.NORMALIZED_OUT),web=resolve(process.env.NORMALIZED_WEB_ROOT);
assert.equal(model.layoutNormalized,true,'Use an actually normalized source model');
assert.ok(model.sourceId,'Model must retain its exact original Word identity');
const hash=b=>createHash('sha256').update(b).digest('hex');
await mkdir(out,{recursive:true});
const packet={type:'gongwen-word',version:1,id:randomUUID(),name:'原Word规范化工作稿恢复核对',document:model,review:{fingerprints:[]},origin:{name:'original.docx'},source:{name:'original.docx',data:original.toString('base64')}};
const portable=resolve(out,'input.gongwen-word.json');await writeFile(portable,JSON.stringify(packet));
const server=process.env.NORMALIZED_URL?{url:process.env.NORMALIZED_URL,async close(){}}:await startWebServer(web);
const report={method:'Normal portable normalized Word restore, original download, two exports, save/reload and model backup; no new normalization UI or business sample.',inputDOCXSHA256:hash(original),modelSHA256:hash(modelBytes),expectedWordSHA256:hash(expected),wasmSHA256:hash(await readFile(resolve(web,'document-engine.wasm'))),checks:[],files:[],errors:[],externalRequests:0,uploadRequests:0,feedbackRequests:0,passed:false};
let browser;
try{
 browser=await chromium.launch({headless:true,channel:'chrome',env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',NO_PROXY:'127.0.0.1,localhost'}});
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',acceptDownloads:true,serviceWorkers:'block'});
 await context.route('**/*',route=>{const request=route.request(),url=new URL(request.url());if(url.pathname.startsWith('/api/feedback/')){report.feedbackRequests++;return route.abort();}if(!['GET','HEAD'].includes(request.method())){report.uploadRequests++;return route.abort();}if(url.hostname!=='127.0.0.1'){report.externalRequests++;return route.abort();}return route.continue();});
 const page=await context.newPage();page.setDefaultTimeout(180000);page.on('pageerror',e=>report.errors.push(e.message));
 const check=(label,value)=>{assert.ok(value,label);report.checks.push(label);};
 async function ready(){await page.waitForFunction(()=>window.writerReady===true);if(await page.locator('#font-start-fallback').isVisible())await page.locator('#font-start-fallback').click();}
 async function rendered(){await page.waitForFunction(()=>/^(已更新|更新失败|预览暂未生成)/.test(document.getElementById('preview-status').textContent));assert.ok((await page.locator('#preview-status').innerText()).startsWith('已更新'));}
 async function download(button,name){const waiting=page.waitForEvent('download');await button.click();const file=await waiting;assert.equal(await file.failure(),null);const path=resolve(out,name);await file.saveAs(path);const data=await readFile(path);report.files.push({file:name,sha256:hash(data),bytes:data.length});return data;}
 async function pair(stem){await page.locator('[data-step="2"]').click();await rendered();for(const box of await page.locator('.review-issue input[type=checkbox]').all())await box.check();await page.locator('#word-pdf-ack').check();for(const format of ['docx','pdf']){await page.locator(`[name=format][value=${format}]`).check();await page.locator('#export:not([disabled])').waitFor();const data=await download(page.locator('#export'),stem+'.'+format);if(format==='docx')assert.deepEqual(data,expected,'Normalized source export differs from exact expected current engine output');}}
 await page.goto(server.url);await ready();await page.locator('#load-draft').setInputFiles(portable);await page.waitForSelector('body.word-mode');await rendered();check('Portable normalized original restores through the normal open control',true);
 await page.locator('[data-step="0"]').click();const untouched=await download(page.getByRole('button',{name:'下载未修改的原件',exact:true}),'protected-original.docx');check('Original download remains byte-identical',untouched.equals(original));
 await pair('opened');check('Restored normalized Word and actual PDF export match current output',true);
 await page.locator('#save-document').click();await page.waitForFunction(()=>document.getElementById('save-status').textContent==='已保存到此浏览器');await page.reload();await ready();await page.waitForSelector('body.word-mode');await rendered();check('Save and refresh retain the normalized Word task',true);
 await pair('reloaded');check('Refresh keeps exact normalized Word output and PDF availability',true);
 await page.locator('#draft-menu').click();const saved=JSON.parse((await download(page.locator('#save-draft'),'restored.gongwen-word.json')).toString());assert.deepEqual(saved.document,model);assert.equal(saved.source.data,packet.source.data);check('Saved backup preserves all model fields, content, normalized flag and exact source',true);
 check('Source, supplied normalized model and frozen engine remain unchanged',hash(await readFile(source))===report.inputDOCXSHA256&&hash(await readFile(resolve(process.env.NORMALIZED_MODEL)))===report.modelSHA256&&hash(await readFile(resolve(web,'document-engine.wasm')))===report.wasmSHA256);
 check('Document flow sends no upload, feedback or external request',report.externalRequests===0&&report.uploadRequests===0&&report.feedbackRequests===0);assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.failure=error.message;throw error;}finally{await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));if(browser)await browser.close();await server.close();}
console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,files:report.files.length}));
