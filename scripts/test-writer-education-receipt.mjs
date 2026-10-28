import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {startWebServer} from './browser-tests/server.mjs';
const require=createRequire(new URL('./browser-tests/package.json',import.meta.url));
const {chromium,firefox,webkit}=require('playwright');
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'build/qa/ceo-002-education');
const fixture=JSON.parse(await readFile(resolve(root,'scripts/fixtures/writer-education-notice.json'),'utf8'));
await mkdir(out,{recursive:true});
const server=await startWebServer(resolve(root,'build/qa/ceo-002-education-web')),results=[];
const profiles=[{id:'chrome',engine:chromium,channel:'chrome'},{id:'firefox',engine:firefox},{id:'webkit',engine:webkit}].filter(p=>!process.env.RECEIPT_PROFILE||process.env.RECEIPT_PROFILE.split(',').includes(p.id));
try{for(const profile of profiles){
 const folder=resolve(out,profile.id);await mkdir(folder,{recursive:true});
 const browser=await profile.engine.launch({headless:true,...(profile.channel?{channel:profile.channel}:{}),env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',http_proxy:'',https_proxy:'',all_proxy:'',NO_PROXY:'127.0.0.1,localhost'},...(profile.id==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',timezoneId:'Asia/Shanghai',acceptDownloads:true});
 const page=await context.newPage();page.setDefaultTimeout(30000);let advanced;
 const result={profile:profile.id,version:browser.version(),checks:[],errors:[],passed:false};
 const monitor=p=>p.on('pageerror',e=>result.errors.push(e.message));monitor(page);
 const check=(name,value)=>{assert.ok(value,name);result.checks.push(name);console.log(profile.id+': '+name);};
 const download=async(p,selector,name)=>{const waiting=p.waitForEvent('download',{timeout:120000});await p.locator(selector).click();const file=await waiting;assert.equal(await file.failure(),null);await file.saveAs(resolve(folder,name));};
 const guidedExport=async()=>{
  await page.locator('[data-step="2"]').click();await page.waitForFunction(()=>document.getElementById('preview-status').textContent.startsWith('已更新'),{},{timeout:120000});
  for(const box of await page.locator('.review-issue input[type=checkbox]').all())await box.check();
  for(const format of ['docx','pdf']){await page.locator(`[name=format][value=${format}]`).check();await page.locator('#export:not([disabled])').waitFor();await download(page,'#export','guided.'+format);}
 };
 const advancedExport=async name=>{
  for(const button of await advanced.getByRole('button',{name:'已核对，保留',exact:true}).all())await button.click();
  for(const format of ['docx','pdf']){await advanced.locator('#output-format').selectOption(format);if(format==='pdf'&&await advanced.locator('#font-notice').isVisible())await advanced.locator('#font-ack').check();await advanced.locator('#export-open:not([disabled])').waitFor({timeout:120000});await download(advanced,'#export-open',name+'.'+format);}
 };
 try{
  await page.goto(server.url);await page.waitForFunction(()=>window.writerReady===true);
  await page.locator('#material-entry summary').click();await page.locator('#pendingMaterial').fill(fixture.material);await page.locator('#material-open').click();
  for(const name of ['title','recipient','signature','date','postscript'])await page.locator(`[data-material-field=${name}]`).check();
  await page.locator('#material-apply').click();await page.waitForFunction(()=>!document.getElementById('material-dialog').open);
  await page.locator('[data-step="0"]').click();await page.locator('details:has(#reference) summary').click();await page.locator('#reference').fill(fixture.reference);
  const original=JSON.parse(await page.evaluate(()=>localStorage.getItem('gongwen-writer-v1')));
  check('whole-material path preserves source, historical signing date and postscript',original.fields.sourceMaterial===fixture.material&&original.fields.date===fixture.authoredDate&&original.fields.signature==='苏州市教育局'&&original.fields.postscript.includes('苏州市教育局办公室'));
  await writeFile(resolve(folder,'guided-fields.json'),JSON.stringify(original,null,2));await guidedExport();
  await page.locator('[data-step="1"]').click();await page.locator('#table-help summary').click();await download(page,'#table-copy','current.gongwen.json');
  const copied=JSON.parse(await readFile(resolve(folder,'current.gongwen.json'),'utf8'));
  check('downloaded continuation preserves every field and original material',JSON.stringify(copied.fields)===JSON.stringify(original.fields));
  const popup=context.waitForEvent('page');await page.locator('#table-advanced').click();advanced=await popup;monitor(advanced);advanced.setDefaultTimeout(30000);
  await advanced.waitForFunction(()=>window.appReady===true,{},{timeout:120000});const choose=advanced.waitForEvent('filechooser');await advanced.locator('#import-writer-draft').click();await (await choose).setFiles(resolve(folder,'current.gongwen.json'));
  await advanced.locator('#workspace:not([hidden])').waitFor({timeout:120000});await advanced.locator('#edit-tab').click();
  const findText=async value=>{for(const input of await advanced.locator('#blocks-editor textarea').all())if(await input.inputValue()===value)return input;throw Error('Missing existing paragraph: '+value);};
  check('native editable copy exposes existing table action',await advanced.locator('#add-table').isVisible());await advancedExport('copied');
  // Replace only the flattened header. Existing receipt title and imprint stay
  // in their original positions; empty source rows contain no invented data.
  const flattened=fixture.receiptRows[0].join('\t');await (await findText(flattened)).fill('');await (await findText('参会回执')).focus();
  await advanced.locator('#add-table').click();await advanced.locator('#table-input').fill(fixture.receiptRows.map(row=>row.join('\t')).join('\n'));await advanced.locator('#table-three-line').uncheck();await advanced.locator('#table-alignment').selectOption('center');
  await advanced.locator('#table-form button.primary').click();await advanced.locator('.editor-table').waitFor();
  check('actual receipt has four columns, header and two genuinely empty rows',await advanced.locator('.editor-table tr').count()===3&&await advanced.locator('.editor-table tr').first().locator('td').count()===4&&await advanced.locator('.editor-table tr:not(:first-child) textarea').evaluateAll(nodes=>nodes.every(n=>n.value==='')));
  const order=await advanced.locator('#blocks-editor textarea').evaluateAll(nodes=>nodes.map(n=>n.value));
  check('receipt stays after signing/publication note and before imprint',order.indexOf('参会回执')>order.indexOf('（此件公开发布）')&&order.indexOf(flattened)===-1&&order.indexOf('区域')>order.indexOf('参会回执')&&order.findIndex(t=>t.includes('苏州市教育局办公室'))>order.indexOf('联系电话'));
  await advanced.locator('#undo').click();check('table insertion can be undone without losing source text',await advanced.locator('.editor-table').count()===0);
  await (await findText('参会回执')).focus();await advanced.locator('#add-table').click();await advanced.locator('#table-input').fill(fixture.receiptRows.map(row=>row.join('\t')).join('\n'));await advanced.locator('#table-three-line').uncheck();await advanced.locator('#table-alignment').selectOption('center');await advanced.locator('#table-form button.primary').click();await advanced.locator('.editor-table').waitFor();
  await advancedExport('receipt');await advanced.waitForFunction(()=>document.getElementById('save-state').textContent==='已保存到此浏览器');
  await advanced.reload();await advanced.waitForFunction(()=>window.appReady===true,{},{timeout:120000});if(!await advanced.locator('#edit-panel').isVisible())await advanced.locator('#edit-tab').click();
  check('refreshed advanced copy retains blank receipt and imprint',await advanced.locator('.editor-table tr').count()===3&&(await advanced.locator('#blocks-editor textarea').evaluateAll(nodes=>nodes.map(n=>n.value))).some(t=>t.includes('2024年6月28日印发')));
  check('original guided draft remains untouched',JSON.stringify(JSON.parse(await page.evaluate(()=>localStorage.getItem('gongwen-writer-v1'))).fields)===JSON.stringify(original.fields));
  check('no browser runtime errors',result.errors.length===0);result.passed=true;
 }catch(e){result.error=e.stack;await (advanced||page).screenshot({path:resolve(folder,'failure.png'),fullPage:true}).catch(()=>{});throw e;}
 finally{results.push(result);await writeFile(resolve(out,'result.json'),JSON.stringify(results,null,2));await browser.close();}
}}finally{await server.close();}
