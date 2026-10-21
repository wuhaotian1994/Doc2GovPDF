import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {jointNotice,jointSignatures} from './fixtures/writer-joint-notice.mjs';
import {startWebServer} from './browser-tests/server.mjs';
const require=createRequire(new URL('./browser-tests/package.json',import.meta.url)),{chromium,firefox,webkit}=require('playwright');
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'build/qa/ceo-004-joint');await mkdir(out,{recursive:true});
const server=await startWebServer(resolve(root,process.env.WRITER_WEB_ROOT||'build/qa/ceo-004-web')),results=[];
try{for(const profile of [{id:'chrome',engine:chromium,channel:'chrome'},{id:'firefox',engine:firefox},{id:'webkit',engine:webkit}]){
 const browser=await profile.engine.launch({headless:true,...(profile.channel?{channel:profile.channel}:{}),env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',http_proxy:'',https_proxy:'',all_proxy:'',NO_PROXY:'127.0.0.1,localhost'},...(profile.id==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',acceptDownloads:true,serviceWorkers:'block'}),page=await context.newPage();page.setDefaultTimeout(30000);
 const folder=resolve(out,profile.id);await mkdir(folder,{recursive:true});const result={profile:profile.id,version:browser.version(),checks:[],errors:[],passed:false};page.on('pageerror',e=>result.errors.push(e.message));
 const check=(name,condition)=>{assert.ok(condition,name);result.checks.push(name);console.log(profile.id+': '+name);};
 const current=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('gongwen-writer-v1')));
 async function exports(variant){
  await page.locator('[data-step="2"]').click();await page.waitForFunction(()=>/^(已更新|更新失败|预览暂未生成)/.test(document.getElementById('preview-status').textContent),{},{timeout:120000});
  assert.ok((await page.locator('#preview-status').innerText()).startsWith('已更新'),await page.locator('#global-error').innerText());
  for(const box of await page.locator('.review-issue input[type=checkbox]').all())await box.check();
  for(const format of ['docx','pdf','txt']){await page.locator(`[name=format][value=${format}]`).check();await page.locator('#export:not([disabled])').waitFor();const waiting=page.waitForEvent('download',{timeout:120000});await page.locator('#export').click();const download=await waiting;assert.equal(await download.failure(),null);await download.saveAs(resolve(folder,variant+'.'+format));}
 }
 try{
  await page.goto(server.url);await page.waitForFunction(()=>window.writerReady===true);
  const lines=jointNotice.split('\n');await page.locator('#title').fill(lines[0]);await page.locator('[data-next="1"]').click();await page.locator('#body').fill(lines.slice(1).join('\n').trim());
  check('visible signature input explains and supports joint names',await page.locator('#signature').evaluate(n=>n.tagName==='TEXTAREA')&&(await page.locator('#signature-hint').innerText()).includes('每行一个'));
  await exports('preserved-in-body');
  const summary=await page.locator('#review-summary').innerText();check('empty fields are described as separately unfilled, not missing document content',summary.includes('未单独填写')&&summary.includes('无需重复添加')&&!summary.includes('未填写'));
  check('keeping signatures and date in prose does not duplicate them in fields',(await current()).fields.signature===''&&(await current()).fields.date==='');
  await page.locator('[data-step="0"]').click();await page.locator('#material-entry summary').click();await page.locator('#pendingMaterial').fill(jointNotice);await page.locator('#material-open').click();
  const choice=await page.locator('[data-material-field=signature]').locator('..').innerText();check('whole-source proposal shows both original names in order',choice.includes('联合落款')&&choice.indexOf(jointSignatures[0])<choice.indexOf(jointSignatures[1]));
  for(const field of ['title','signature','date'])await page.locator(`[data-material-field=${field}]`).check();
  // The website uses blank lines between paragraphs. Author explicitly chooses
  // paragraph grouping rather than exporting those separators as empty blocks.
  await page.locator('#material-join').check();
  const before=await current();check('checking candidates leaves the working source untouched until final adoption',before.fields.signature===''&&jointSignatures.every(name=>before.fields.body.includes(name)));
  const body=await page.locator('#material-body-preview').inputValue();check('both joint names and authored date leave the body exactly on confirmation',jointSignatures.every(name=>!body.includes(name))&&!body.includes('2024年5月15日'));
  await page.locator('#material-apply').click();await page.waitForFunction(()=>!document.getElementById('material-dialog').open);
  const original=await current();await writeFile(resolve(folder,'original-draft.json'),JSON.stringify(original,null,2));
  check('joint field preserves order and authored date differs from website publication date',original.fields.signature===jointSignatures.join('\n')&&original.fields.date==='2024-05-15'&&original.fields.sourceMaterial===jointNotice);
  await exports('arranged');
  check('summary displays both confirmed names and the historical authored date',(await page.locator('#review-summary').innerText()).includes(jointSignatures.join('\n'))&&(await page.locator('#review-summary').innerText()).includes('2024年5月15日'));
  if(profile.id==='chrome')await page.screenshot({path:resolve(folder,'summary.png'),fullPage:true});
  await page.locator('#draft-menu').click();await page.locator('#copy-current').click();await page.locator('#title').fill('【模拟日期更正】'+original.fields.title);await page.locator('[data-step="1"]').click();await page.locator('#date').fill('2024-05-16');
  const simulated=await current();check('copy only changes the explicitly edited title/date and keeps source and names',Object.keys(original.fields).filter(key=>!['title','date'].includes(key)).every(key=>original.fields[key]===simulated.fields[key])&&simulated.id!==original.id);
  await exports('simulated');await writeFile(resolve(folder,'simulated-draft.json'),JSON.stringify(await current(),null,2));
  await page.locator('#draft-menu').click();await page.locator('.recent-document').first().getByRole('button',{name:'继续编辑',exact:true}).click();
  const restored=await current();check('original is recoverable after simulated correction with both names and May 15 intact',restored.id===original.id&&JSON.stringify(restored.fields)===JSON.stringify(original.fields));
  await page.reload();await page.waitForFunction(()=>window.writerReady===true);check('reopening retains the original joint-signature draft',(await current()).fields.signature===jointSignatures.join('\n')&&(await current()).fields.date==='2024-05-15');
  check('ordinary joint notice stays in the guided flow',context.pages().length===1&&!page.url().includes('advanced'));check('no runtime errors',result.errors.length===0);result.passed=true;
 }catch(e){result.error=e.stack;await page.screenshot({path:resolve(folder,'failure.png'),fullPage:true}).catch(()=>{});throw e;}
 finally{results.push(result);await writeFile(resolve(out,'result.json'),JSON.stringify(results,null,2));await context.close();await browser.close();}
}}finally{await server.close();}
