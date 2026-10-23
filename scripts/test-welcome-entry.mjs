import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {startWebServer} from './browser-tests/server.mjs';
const require=createRequire(new URL('./browser-tests/package.json',import.meta.url)),{chromium}=require('playwright');
const out=new URL('../build/qa/welcome-entry/',import.meta.url);await mkdir(out,{recursive:true});
const server=process.env.WRITER_URL?{url:process.env.WRITER_URL,close:async()=>{}}:await startWebServer(fileURLToPath(new URL('../build/qa/system-fonts-web',import.meta.url)));
const browser=await chromium.launch({headless:true,channel:'msedge',env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',NO_PROXY:'127.0.0.1,localhost'}});
try{
 const context=await browser.newContext({viewport:{width:1366,height:900}});let page=await context.newPage();const errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.url);await page.locator('#welcome-dialog').waitFor({state:'visible'});
 assert.equal(await page.locator('#welcome-copy,#welcome-again,.welcome-note').count(),0);
 for(const selector of ['#welcome-heading','.welcome-art img','.welcome-description']){await page.locator(selector).click();assert.ok(await page.locator('#welcome-dialog').isHidden());await page.reload();await page.locator('#welcome-dialog').waitFor({state:'visible'});}
 await page.mouse.click(5,5);assert.ok(await page.locator('#welcome-dialog').isHidden());await page.reload();await page.locator('#welcome-dialog').waitFor({state:'visible'});
 assert.equal(await page.title(),'码什么冬梅');assert.equal(await page.locator('#open-document,#draft-menu').count(),0);assert.ok((await page.locator('.brand').textContent()).includes('码什么冬梅'));
 await page.locator('#welcome-start').click();await page.locator('#title').waitFor({state:'visible'});assert.equal(await page.locator('#title').inputValue(),'');assert.equal(await page.evaluate(()=>document.activeElement.id),'title');assert.equal(await page.locator('[data-step="0"]').getAttribute('aria-current'),'step');
 await page.locator('#title').fill('欢迎页旧稿保留测试');await page.reload();await page.locator('#welcome-dialog').waitFor({state:'visible'});
 await page.locator('#welcome-start').click();await page.locator('#title').waitFor({state:'visible'});assert.equal(await page.locator('#title').inputValue(),'');
 await page.locator('#title').fill('第二篇文章');await page.locator('#back-home').click();await page.getByRole('button',{name:/欢迎页旧稿保留测试/}).waitFor();
 await page.reload();await page.locator('#welcome-dialog').waitFor({state:'visible'});
 await page.evaluate(()=>{window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('Test quota','QuotaExceededError');};});
 await page.locator('#welcome-start').click();await page.waitForFunction(()=>document.querySelector('#welcome-copy-status').textContent.length>0);
 assert.ok(await page.locator('#welcome-dialog').isVisible());assert.equal(await page.locator('#title').inputValue(),'第二篇文章');
 await page.evaluate(()=>Storage.prototype.setItem=window.originalSet);await page.locator('#welcome-recovery').click();await page.locator('#draft-dialog').waitFor({state:'visible'});
 const download=page.waitForEvent('download');await page.locator('#save-draft').click();const file=await download;const backup=JSON.parse(await readFile(await file.path(),'utf8'));assert.equal(backup.fields.title,'第二篇文章');
 await page.locator('[data-close=draft-dialog]').click();await page.reload();await page.locator('#welcome-dialog').waitFor({state:'visible'});await page.locator('#welcome-start').click();await page.locator('#title').waitFor({state:'visible'});assert.equal(await page.locator('#title').inputValue(),'');
 await page.screenshot({path:fileURLToPath(new URL('basic-info.png',out))});
 await page.close();page=await context.newPage();await page.goto(server.url);await page.locator('#welcome-dialog').waitFor({state:'visible'});await page.locator('#welcome-dialog img').evaluate(el=>el.decode());await page.screenshot({path:fileURLToPath(new URL('welcome.png',out))});
 await page.setViewportSize({width:1280,height:720});await page.screenshot({path:fileURLToPath(new URL('welcome-short.png',out))});await page.locator('#welcome-start').click();await page.locator('#title').waitFor({state:'visible'});assert.equal(await page.title(),'码什么冬梅');assert.deepEqual(errors,[]);
 await writeFile(new URL('result.json',out),JSON.stringify({passed:true,browser:browser.version(),checks:['brand and exact tab title','removed top actions','welcome start creates new article at basics and focuses title','reload shows welcome','new opening shows welcome','old article retained','storage failure keeps dialog and old article','error-only backup download reachable','short desktop works','text image and backdrop close welcome','removed copy note and rewatch','no page errors']},null,2));console.log('PASS welcome direct new article and site name');
}finally{await browser.close();await server.close();}
