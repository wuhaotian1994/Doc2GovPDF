import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..');
const require=createRequire(root+'/scripts/browser-tests/package.json');
const {chromium}=require('playwright');
const source=process.env.HEALTH_OFFICE_ORIGINAL;
if(!source)throw new Error('Set HEALTH_OFFICE_ORIGINAL to the supplied original JSON; do not replace it with an invented fixture.');
const original=JSON.parse(await readFile(source,'utf8'));
assert.equal(createHash('sha256').update(await readFile(source)).digest('hex'),'7dbde2fe81d11c526d8fb73ab143f572e3481500575fb9c0b87b126b9e37972c');
const out=process.env.HEALTH_OUT||resolve(root,'build/qa/health-office');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome',env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',NO_PROXY:'127.0.0.1,localhost'}});
const context=await browser.newContext({viewport:{width:1440,height:900},locale:'zh-CN',acceptDownloads:true,serviceWorkers:'block'});
const page=await context.newPage(),report={errors:[],sourceSHA256:createHash('sha256').update(await readFile(source)).digest('hex'),downloads:[]};
await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
page.on('pageerror',e=>report.errors.push(e.message));
try{
 await page.goto(process.env.HEALTH_URL||'http://127.0.0.1:4173');await page.waitForFunction(()=>window.writerReady);
 await page.locator('#draft-menu').click();await page.locator('#load-draft').setInputFiles(source);
 if(await page.locator('#replace-dialog').isVisible())await page.locator('#confirm-replace').click();
 await page.waitForFunction(title=>document.querySelector('#title').value===title,original.fields.title);
 if(await page.locator('#draft-dialog').isVisible())await page.locator('[data-close="draft-dialog"]').click();
 await page.locator('[data-step="1"]').click();await page.waitForFunction(()=>document.querySelector('#preview-status').textContent.startsWith('已更新'),{},{timeout:180000});
 const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('gongwen-writer-v1')));
 const restored=await read();assert.deepEqual(restored.fields,original.fields);assert.deepEqual(restored.content,original.content);
 await page.locator('#save-document').click();await page.reload();await page.waitForFunction(()=>window.writerReady);
 assert.deepEqual((await read()).fields,original.fields);assert.deepEqual((await read()).content,original.content);
 report.restoredExactly=true;report.reopenedExactly=true;report.blockCount=restored.content.blocks.length;
 report.tableShapes=restored.content.blocks.filter(b=>b.type==='table').map(b=>({rows:b.rows.length,columns:b.rows[0].cells.length,blanks:b.rows.flatMap(r=>r.cells).filter(c=>c.text==='').length}));
 await page.screenshot({path:out+'/restored.png'});
 await page.locator('[data-step="2"]').click();await page.waitForFunction(()=>document.querySelector('#preview-status').textContent.startsWith('已更新'),{},{timeout:180000});
 for(const c of await page.locator('.review-issue input[type=checkbox]').all())await c.check();
 report.reviewCount=await page.locator('.review-issue').count();
 for(const format of ['docx','pdf']){
  await page.locator(`[name=format][value=${format}]`).check();await page.locator('#export:not([disabled])').waitFor({timeout:180000});
  const waiting=page.waitForEvent('download',{timeout:180000});await page.locator('#export').click();const download=await waiting;
  await download.saveAs(out+'/original.'+format);const data=await readFile(out+'/original.'+format);
  report.downloads.push({format,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
 }
 assert.deepEqual((await read()).fields,original.fields);assert.deepEqual((await read()).content,original.content);
 report.exportKeptOriginal=true;report.passed=report.errors.length===0;
}catch(e){report.failure=e.stack;await page.screenshot({path:out+'/failure.png'}).catch(()=>{});throw e;}
finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({passed:report.passed,sourceSHA256:report.sourceSHA256,downloads:report.downloads,errors:report.errors}));
