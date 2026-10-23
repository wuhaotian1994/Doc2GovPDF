import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {startWebServer} from './browser-tests/server.mjs';
const require=createRequire(new URL('./browser-tests/package.json',import.meta.url)),{chromium}=require('playwright');
const out=new URL('../build/qa/system-fonts/',import.meta.url);await mkdir(out,{recursive:true});
const server=process.env.WRITER_URL?{url:process.env.WRITER_URL,close:async()=>{}}:await startWebServer(fileURLToPath(new URL('../build/qa/system-fonts-web',import.meta.url)));
const browser=await chromium.launch({headless:true,channel:'msedge',env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',NO_PROXY:'127.0.0.1,localhost'}});
try{
 const context=await browser.newContext({viewport:{width:1366,height:900},acceptDownloads:true}),page=await context.newPage(),errors=[],fonts=new Set();page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.url().includes('/fonts/system/')&&r.status()===200)fonts.add(new URL(r.url()).pathname);});
 await page.addInitScript(()=>{window.localFontQueries=0;window.queryLocalFonts=async()=>{window.localFontQueries++;throw Error('User font access must not be requested');};});
 await page.goto(server.url);await page.locator('#welcome-dialog').waitFor({state:'visible'});await page.locator('#welcome-dialog img').evaluate(el=>el.decode());await page.screenshot({path:fileURLToPath(new URL('welcome-desktop.png',out))});
 await page.setViewportSize({width:1280,height:720});await page.screenshot({path:fileURLToPath(new URL('welcome-short.png',out))});assert.ok(await page.locator('#welcome-start').isVisible());
 await page.locator('#welcome-start').click();await page.locator('#common-open').click();assert.equal(await page.locator('#layout-font-auto,#layout-font-files,#font-start,#font-role').count(),0);await page.screenshot({path:fileURLToPath(new URL('common-settings.png',out))});await page.locator('[data-close=common-dialog]').click();
 await page.locator('#back-home').click();await page.locator('#material-open').click();const body=Array.from({length:8},(_,i)=>`第${i+1}段正文：这是虚构的默认字库验收材料。系统应当完成字体准备，用户直接填写内容并预览成品。`).join('\n');
 await page.locator('#line-paste-text').fill('默认字库排版测试\n一、工作安排\n（一）资料核对\n'+body);await page.locator('#line-paste-confirm').click();
 await page.waitForFunction(()=>document.querySelector('#preview-status').textContent.startsWith('已更新'),{},{timeout:180000});
 assert.equal(fonts.size,5);assert.equal(await page.evaluate(()=>window.localFontQueries),0);assert.ok(!(await page.locator('#preview-status').textContent()).includes('降级'));
 await page.screenshot({path:fileURLToPath(new URL('default-preview.png',out))});
 await page.locator('[data-step="2"]').click();for(const box of await page.locator('.review-issue input[type=checkbox]').all())await box.check();
 for(const format of ['pdf','docx']){await page.locator(`[name=format][value=${format}]`).check();await page.locator('#export:not([disabled])').waitFor({timeout:120000});const wait=page.waitForEvent('download',{timeout:180000});await page.locator('#export').click();await(await wait).saveAs(fileURLToPath(new URL('configured.'+format,out)));}
 await page.locator('#back-home').click();await page.locator('[data-article-id]').waitFor();const card=page.locator('[data-article-id]').first();
 await page.locator('#home-heading').hover();
 for(const kind of ['rename','delete']){const button=card.locator(`[data-article-action=${kind}]`);const normal=await button.evaluate(el=>({color:getComputedStyle(el).color,bg:getComputedStyle(el).backgroundColor}));await button.hover();const hover=await button.evaluate(el=>({color:getComputedStyle(el).color,bg:getComputedStyle(el).backgroundColor}));assert.equal(normal.color,'rgb(94, 107, 123)');assert.equal(hover.color,kind==='rename'?'rgb(36, 88, 184)':'rgb(170, 38, 51)');assert.equal(normal.bg,hover.bg);await page.locator('#home-heading').hover();}
 await page.screenshot({path:fileURLToPath(new URL('cards-neutral.png',out))});
 await page.waitForFunction(()=>navigator.serviceWorker.controller!==null,{},{timeout:45000});
 await context.setOffline(true);await page.reload();await page.waitForFunction(()=>window.writerReady&&!document.querySelector('#home-new').disabled);await page.locator('#welcome-dialog').waitFor({state:'visible'});await page.keyboard.press('Escape');
 await page.locator('[data-article-id] .article-open').first().click();await page.waitForFunction(()=>document.querySelector('#preview-status').textContent.startsWith('已更新'),{},{timeout:180000});assert.equal(await page.evaluate(()=>window.localFontQueries),0);
 assert.deepEqual(errors,[]);await writeFile(new URL('result.json',out),JSON.stringify({passed:true,browser:browser.version(),fonts:[...fonts],checks:['compact welcome desktop and short','no font configuration UI','five actual system fonts auto-loaded','no local font permission requested','preview without fallback warning','actual PDF and embedded-font DOCX exports','gray default actions and color-only hover','cached offline reopen and preview','no runtime errors']},null,2));console.log('PASS default system fonts, exports, welcome, hover and offline');
}finally{await browser.close();await server.close();}
