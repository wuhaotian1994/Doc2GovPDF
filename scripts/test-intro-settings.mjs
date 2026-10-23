import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {startWebServer} from './browser-tests/server.mjs';
import {inspectFont} from '../web/write-font-source.js';
import {requiredFonts,matchesRequiredFont,matchFontFiles} from '../web/write-font-setup.js';
const require=createRequire(new URL('./browser-tests/package.json',import.meta.url)),{chromium}=require('playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),out=new URL('../build/qa/intro-settings/',import.meta.url);await mkdir(out,{recursive:true});
const fontBytes=await readFile('C:/Windows/Fonts/simfang.ttf'),actual=inspectFont(new Uint8Array(fontBytes)).faces[0];
assert.equal(matchesRequiredFont({family:'SimHei',style:'Regular'},requiredFonts[0]),false);
assert.equal(matchFontFiles([inspectFont(new Uint8Array(fontBytes))])['方正小标宋简体'],undefined);
assert.ok(matchFontFiles([inspectFont(new Uint8Array(fontBytes))])['仿宋']);
const server=process.env.WRITER_URL?{url:process.env.WRITER_URL,close:async()=>{}}:await startWebServer(root+'build/qa/intro-settings-web');
const browser=await chromium.launch({headless:true,channel:'msedge',env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',NO_PROXY:'127.0.0.1,localhost'}});
try{
 const page=await browser.newPage({viewport:{width:1366,height:900},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.url);await page.locator('#welcome-dialog').waitFor({state:'visible'});await page.locator('#welcome-dialog img').evaluate(el=>el.decode());
 assert.ok((await page.locator('#welcome-dialog').textContent()).includes('msmdm.cn'));
 await page.screenshot({path:fileURLToPath(new URL('welcome.png',out))});
 await page.locator('#welcome-start').click();await page.reload();await page.waitForFunction(()=>window.writerReady&&!document.querySelector('#home-new').disabled);
 assert.ok(await page.locator('#welcome-dialog').isHidden());assert.equal(await page.locator('#settings-open').count(),0);
 await page.locator('#about-open').click();await page.screenshot({path:fileURLToPath(new URL('about.png',out))});await page.locator('[data-close=about-dialog]').click();
 await page.locator('#common-open').click();assert.ok(await page.locator('#layout-font-auto').isVisible());assert.equal(await page.locator('#font-role').count(),0);
 await page.evaluate(()=>window.queryLocalFonts=undefined);await page.locator('#layout-font-auto').click();await page.waitForFunction(()=>document.querySelector('#layout-font-message').textContent.includes('不支持自动读取'));
 await page.evaluate(()=>window.queryLocalFonts=async()=>{throw new DOMException('Denied','NotAllowedError');});await page.locator('#layout-font-auto').click();await page.waitForFunction(()=>document.querySelector('#layout-font-message').textContent.includes('未获得读取权限'));
 await page.route('**/__test-font',route=>route.fulfill({body:fontBytes,contentType:'font/ttf'}));
 await page.evaluate(face=>{window.queryLocalFonts=async()=>[{...face,blob:async()=>await(await fetch('/__test-font')).blob()}];},actual);
 await page.locator('#layout-font-auto').click();await page.waitForFunction(()=>document.querySelector('#layout-font-message').textContent.includes('已保存找到的字体'),{},{timeout:120000});
 assert.ok((await page.locator('#layout-font-details').textContent()).includes('正文：'));
 assert.ok((await page.locator('#layout-font-state').textContent()).includes('还需补齐'));
 await page.locator('#layout-font-files').setInputFiles(['C:/Windows/Fonts/simhei.ttf','C:/Windows/Fonts/simkai.ttf','C:/Windows/Fonts/simsun.ttc']);
 await page.waitForFunction(()=>!document.querySelector('#layout-font-auto').disabled&&document.querySelector('#layout-font-description').textContent.includes('还缺标题用字'),{},{timeout:120000});
 await page.screenshot({path:fileURLToPath(new URL('common-settings.png',out))});
 await page.locator('[data-close=common-dialog]').click();await page.locator('#material-open').click();
 const body=Array.from({length:8},(_,i)=>`第${i+1}段正文：这是虚构的字体与卡片显示测试内容。文章摘要需要清楚显示文字，而不是只有省略号。`).join('\n');
 await page.locator('#line-paste-text').fill('公文排版配置测试\n'+body);await page.locator('#line-paste-confirm').click();
 await page.waitForFunction(()=>document.querySelector('#preview-status').textContent.startsWith('已更新'),{},{timeout:180000});
 await page.screenshot({path:fileURLToPath(new URL('configured-preview.png',out))});
 await page.locator('[data-step="2"]').click();await page.waitForFunction(()=>document.querySelector('#preview-status').textContent.startsWith('已更新'),{},{timeout:120000});
 for(const box of await page.locator('.review-issue input[type=checkbox]').all())await box.check();
 for(const format of ['pdf','docx']){
   await page.locator(`[name=format][value=${format}]`).check();await page.locator('#export:not([disabled])').waitFor({timeout:120000});
   const wait=page.waitForEvent('download',{timeout:120000});await page.locator('#export').click();await(await wait).saveAs(fileURLToPath(new URL('configured.'+format,out)));
 }
 await page.locator('#back-home').click();await page.locator('[data-article-id]').waitFor();
 const card=page.locator('[data-article-id]').first(),normal=await card.evaluate(el=>getComputedStyle(el).backgroundColor);await card.hover();assert.equal(await card.evaluate(el=>getComputedStyle(el).backgroundColor),normal);
 assert.ok(await card.locator('.article-excerpt').evaluate(el=>el.offsetHeight>30&&el.textContent.length>100));
 assert.ok(await card.locator('.article-actions .article-meta').count());
 for(const kind of ['rename','delete']){const button=card.locator(`[data-article-action=${kind}]`),before=await button.evaluate(el=>({color:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor}));await button.hover();assert.deepEqual(await button.evaluate(el=>({color:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor})),before);}
 await page.screenshot({path:fileURLToPath(new URL('article-summary.png',out))});
 await page.setViewportSize({width:1280,height:720});await page.locator('#about-open').click();await page.locator('#welcome-again').click();await page.screenshot({path:fileURLToPath(new URL('welcome-short.png',out))});
 assert.ok(await page.locator('#welcome-start').isVisible());assert.deepEqual(errors,[]);
 await writeFile(new URL('result.json',out),JSON.stringify({passed:true,browser:browser.version(),checks:['first welcome once and repeat from About','image loads','About domain and information','font settings in Common only','unsupported and denied API paths','real FangSong bytes auto-matched via isolated permission mock','real font files auto-matched','missing title font not substituted','real PDF and DOCX exports','three-line article excerpt','date in action row','border-only hover and stable action colors','short welcome buttons visible','no runtime errors']},null,2));
 console.log('PASS intro, cards, automatic font configuration and exports');
}finally{await browser.close();await server.close();}
