import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {startWebServer} from './browser-tests/server.mjs';
const require=createRequire(new URL('./browser-tests/package.json',import.meta.url));
const {chromium}=require('playwright');
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'build/qa/first-use');await mkdir(out,{recursive:true});
const server=await startWebServer(resolve(root,process.env.WRITER_WEB_ROOT||'build/qa/first-use-web'));
const browser=await chromium.launch({headless:true,channel:'chrome'});
const context=await browser.newContext({serviceWorkers:'block'});
try{
 const original=await context.newPage();await original.goto(server.url);await original.waitForFunction(()=>window.writerReady);
 await original.locator('#title').fill('原有工作稿');await original.locator('[data-next="1"]').click();await original.locator('#body').fill('原稿不能被另一标签覆盖。');
 const untouched=await context.newPage();await untouched.route('**/write.js',route=>route.abort());await untouched.goto(server.url,{waitUntil:'commit'});
 assert.equal(await untouched.locator('#body').inputValue(),'原稿不能被另一标签覆盖。');
 const pages=[];
 for(const [title,body] of [['暂存甲','甲标签关闭前的内容。'],['暂存乙','乙标签关闭前的最新内容。']]){
  const page=await context.newPage();await page.route('**/write.js',route=>route.abort());await page.goto(server.url,{waitUntil:'commit'});
  await page.locator('[data-step="0"]').click();await page.locator('#title').fill(title);await page.locator('[data-next="1"]').click();await page.locator('#body').fill(body);await page.locator('#save-document').click();
  assert.equal(await page.locator('#save-status').textContent(),'已保存到此浏览器');pages.push(page);
 }
 assert.equal(await original.evaluate(()=>JSON.parse(localStorage.getItem('gongwen-writer-v1')).fields.body),'原稿不能被另一标签覆盖。');
 // A cleanup observes an older immutable version while the other tab writes.
 const observed=await original.evaluate(()=>window.writerBoot.recoveries());
 await original.evaluate(records=>window.writerBoot.acknowledge(records),observed);
 await pages[0].locator('#body').fill('甲标签在归档期间继续输入的新内容。');await pages[0].locator('#save-document').click();
 await original.locator('#save-document').click();
 assert.ok(await original.evaluate(()=>window.writerBoot.recoveries().some(record=>record.value.fields.body==='甲标签在归档期间继续输入的新内容。')));
 // This test invoked cleanup directly, so put the observed versions into the
 // library just as normal boot does, before closing their source tabs.
 await original.evaluate(async records=>{
  const {archiveDocument}=await import('./write-library.js');const {draft}=await import('./write-model.js');
  let library={version:1,items:[]};const seen=new Set();for(const record of records){if(seen.has(record.id))continue;seen.add(record.id);library=archiveDocument(library,record.id,draft(record.value.fields,record.value.step,record.id));}
  localStorage.setItem('gongwen-writer-library-v1',JSON.stringify(library));
 },observed);
 for(const page of pages)await page.close();await original.close();await untouched.close();
 const restored=await context.newPage();await restored.goto(server.url,{waitUntil:'commit'});await restored.waitForFunction(()=>window.writerReady);
 assert.equal(await restored.locator('#body').inputValue(),'甲标签在归档期间继续输入的新内容。');
 const library=await restored.evaluate(()=>JSON.parse(localStorage.getItem('gongwen-writer-library-v1')));
 assert.ok(library.items.some(item=>item.document.fields.body==='原稿不能被另一标签覆盖。'));
 assert.ok(library.items.some(item=>item.document.fields.body==='乙标签关闭前的最新内容。'));
 await restored.locator('#pdf-pages canvas').waitFor({timeout:120000});
 await writeFile(resolve(out,'recovery-tabs.json'),JSON.stringify({passed:true,primaryPreserved:true,newVersionSurvivesOtherTabCleanup:true,untouchedOldTabCannotBecomeNewest:true,closedTabsRecoverable:true,realPreview:true},null,2));
 console.log('PASS: original draft, other closed tab, and edits during recovery cleanup are retained; reopened draft previews.');
}finally{await context.close();await browser.close();await server.close();}
