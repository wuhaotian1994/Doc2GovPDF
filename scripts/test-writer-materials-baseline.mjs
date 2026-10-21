// Reproduce the current user cost from whole source strings, not prefilled fixtures.
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {materials} from './fixtures/writer-materials.mjs';
import {startWebServer} from './browser-tests/server.mjs';
const require=createRequire(new URL('./browser-tests/package.json',import.meta.url)),{chromium}=require('playwright');
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'build/qa/ceo-004');await mkdir(out,{recursive:true});
const server=await startWebServer(resolve(root,'build/qa/ceo-003-web'));
const browser=await chromium.launch({headless:true,channel:'chrome',env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',NO_PROXY:'127.0.0.1,localhost'}});
const results=[];
try{
 for(const material of materials){
  const folder=resolve(out,material.id+'-baseline');await mkdir(folder,{recursive:true});await writeFile(resolve(folder,'source.txt'),material.raw);
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',timezoneId:'Asia/Shanghai',acceptDownloads:true});const page=await context.newPage();page.setDefaultTimeout(30000);
  const lines=material.raw.split('\n'),record={id:material.id,source:material.raw,logicalPreparation:[],leavesGuidedFlow:false,passed:false};
  const exportBoth=async variant=>{
   await page.locator('[data-step="2"]').click();await page.waitForFunction(()=>document.getElementById('preview-status').textContent.startsWith('已更新'),{},{timeout:120000});
   for(const input of await page.locator('.review-issue input[type=checkbox]').all())await input.check();
   for(const format of ['docx','pdf']){await page.locator(`[name=format][value=${format}]`).check();await page.locator('#export:not([disabled])').waitFor();const waiting=page.waitForEvent('download');await page.locator('#export').click();const file=await waiting;assert.equal(await file.failure(),null);await file.saveAs(resolve(folder,variant+'.'+format));}
  };
  try{
   await page.goto(server.url);await page.waitForFunction(()=>window.writerReady===true);
   await page.locator('#title').fill(lines[0]);record.logicalPreparation.push('manually select and copy source first line to title');
   await page.locator('[data-next="1"]').click();await page.locator('#body').fill(lines.slice(1).join('\n').trim());record.logicalPreparation.push('manually remove title from whole source before pasting body');
   await exportBoth('naive');
   if(material.id==='notice'){
    await page.locator('[data-step="0"]').click();await page.locator('#recipient').fill(lines[1].replace(/：$/,''));
    record.logicalPreparation.push('manually extract recipient and remove its line from body');
    await page.locator('[data-step="1"]').click();await page.locator('#body').fill(lines.slice(2,-2).join('\n').trim());
    await page.locator('#signature').fill(lines.at(-2));record.logicalPreparation.push('manually extract signature and remove its line from body');
    const date=lines.at(-1).match(/(\d+)年(\d+)月(\d+)日/);await page.locator('#date').fill(`${date[1]}-${date[2].padStart(2,'0')}-${date[3].padStart(2,'0')}`);record.logicalPreparation.push('manually identify and convert the authored date into the separate date input');
   }else{
    await page.locator('[data-step="1"]').click();await page.locator('#body').fill(lines.slice(1).join('\n').trim().split(/\n\s*\n/).map(group=>group.split('\n').join('')).join('\n'));
    record.logicalPreparation.push('manually distinguish empty paragraph separators from hard-wrapped lines and join two paragraphs');
   }
   await exportBoth('manual');
   const draft=await page.evaluate(()=>JSON.parse(localStorage.getItem('gongwen-writer-v1')));record.savedFields=draft.fields;
   record.originalMaterialFieldPresent=typeof draft.fields.sourceMaterial==='string';
   record.passed=true;console.log(material.id+': whole-source baseline and manually prepared outputs downloaded');
  }catch(error){record.error=error.stack;await page.screenshot({path:resolve(folder,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
  finally{results.push(record);await writeFile(resolve(out,'baseline.json'),JSON.stringify(results,null,2));await context.close();}
 }
}finally{await browser.close();await server.close();}
