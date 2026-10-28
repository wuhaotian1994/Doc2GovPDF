import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {startWebServer} from './browser-tests/server.mjs';
const require=createRequire(new URL('./browser-tests/package.json',import.meta.url)),{chromium}=require('playwright');
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'build/qa/ceo-004');
const server=await startWebServer(resolve(root,process.env.WRITER_WEB_ROOT||'build/qa/ceo-004-web'));
const browser=await chromium.launch({headless:true,channel:'chrome'}),results=[];
try{for(const id of ['notice','wrapped']){
 const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
 try{
  const path=resolve(out,'chrome-'+id,'draft.gongwen.json'),expected=JSON.parse(await readFile(path,'utf8'));
  await page.goto(server.url);await page.waitForFunction(()=>window.writerReady===true);
  await page.locator('#load-draft').setInputFiles(path);
  await page.waitForFunction(source=>JSON.parse(localStorage.getItem('gongwen-writer-v1')).fields.sourceMaterial===source,expected.fields.sourceMaterial);
  const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('gongwen-writer-v1')));
  assert.deepEqual(restored.fields,expected.fields);assert.notEqual(restored.id,expected.id);
  await page.reload();await page.waitForFunction(()=>window.writerReady===true);
  assert.equal(await page.locator('#sourceMaterial').inputValue(),expected.fields.sourceMaterial);
  assert.equal(await page.locator('#pendingMaterial').inputValue(),expected.fields.pendingMaterial);
  results.push({id,restoredInFreshBrowser:true,allFieldsEqual:true,newCopyId:true,reloadRetainsSources:true});
  console.log(id+': portable v2 draft restores all fields and both sources in a fresh browser context');
 }finally{await context.close();}
}}finally{await browser.close();await server.close();await writeFile(resolve(out,'restore-result.json'),JSON.stringify(results,null,2));}
