import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {postscriptNotice,postscriptParagraphs,postscriptSource} from './fixtures/writer-postscript-notice.mjs';
import {startWebServer} from './browser-tests/server.mjs';
const require=createRequire(new URL('./browser-tests/package.json',import.meta.url)),{chromium,firefox,webkit}=require('playwright');
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'build/qa/ceo-004-postscript'),baseline=process.argv.includes('--baseline');await mkdir(out,{recursive:true});
const server=await startWebServer(resolve(root,baseline?'build/qa/ceo-004-postscript-baseline-web':'build/qa/ceo-004-postscript-web')),results=[];
try{for(const profile of [{id:'chrome',engine:chromium,channel:'chrome'},{id:'firefox',engine:firefox},{id:'webkit',engine:webkit}].filter(p=>!baseline||p.id==='chrome')){
 const browser=await profile.engine.launch({headless:true,...(profile.channel?{channel:profile.channel}:{}),env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',http_proxy:'',https_proxy:'',all_proxy:'',NO_PROXY:'127.0.0.1,localhost'},...(profile.id==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',acceptDownloads:true,serviceWorkers:'block'}),page=await context.newPage();page.setDefaultTimeout(30000);
 const folder=resolve(out,profile.id+(baseline?'-baseline':''));await mkdir(folder,{recursive:true});const result={profile:profile.id,baseline,version:browser.version(),source:postscriptSource,checks:[],errors:[],passed:false};page.on('pageerror',e=>result.errors.push(e.message));
 const check=(name,value)=>{assert.ok(value,name);result.checks.push(name);console.log(profile.id+': '+name);};
 const current=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('gongwen-writer-v1')));
 async function download(selector,name){const waiting=page.waitForEvent('download',{timeout:120000});await page.locator(selector).click();const file=await waiting;assert.equal(await file.failure(),null);await file.saveAs(resolve(folder,name));}
 async function exports(name){await page.locator('[data-step="2"]').click();await page.waitForFunction(()=>/^(已更新|更新失败|预览暂未生成)/.test(document.getElementById('preview-status').textContent),{},{timeout:120000});assert.ok((await page.locator('#preview-status').innerText()).startsWith('已更新'),await page.locator('#global-error').innerText());for(const box of await page.locator('.review-issue input[type=checkbox]').all())await box.check();for(const format of ['docx','pdf','txt']){await page.locator(`[name=format][value=${format}]`).check();await page.locator('#export:not([disabled])').waitFor();await download('#export',name+'.'+format);}}
 try{
  await page.goto(server.url);await page.waitForFunction(()=>window.writerReady===true);await page.locator('#material-entry summary').click();await page.locator('#pendingMaterial').fill(postscriptNotice);await page.locator('#material-open').click();
  if(baseline){check('current shipped flow has no signing/date candidate before contact and publication notes',await page.locator('[data-material-field=signature],[data-material-field=date]').count()===0);}
  else{check('spaced authored date before notes is offered explicitly, with no default adoption',await page.locator('[data-material-field=date]').count()===1&&await page.locator('#material-candidates input:checked').count()===0);}
  for(const field of ['title','recipient'])await page.locator(`[data-material-field=${field}]`).check();
  if(!baseline){
   for(const field of ['signature','date'])await page.locator(`[data-material-field=${field}]`).check();
   check('adopting a nonterminal date requires explicit consent to retain following notes after it',await page.locator('#material-apply').isDisabled());await page.locator('[data-material-field=postscript]').check();
   check('proposal keeps notes out of both the body and signature',(await page.locator('#material-postscript-preview').inputValue())===postscriptParagraphs.slice(-2).join('\n')&&!(await page.locator('#material-body-preview').inputValue()).includes(postscriptParagraphs.at(-2)));
   await page.locator('#material-dialog [data-close]').first().click();check('cancel leaves complete source untouched',(await current()).fields.pendingMaterial===postscriptNotice&&(await current()).fields.body==='');await page.locator('#material-open').click();for(const field of ['title','recipient','signature','date','postscript'])await page.locator(`[data-material-field=${field}]`).check();
   if(profile.id==='chrome')await page.screenshot({path:resolve(folder,'proposal.png'),fullPage:true});
  }
  await page.locator('#material-apply').click();await page.waitForFunction(()=>!document.getElementById('material-dialog').open);const original=await current();await writeFile(resolve(folder,'original.json'),JSON.stringify(original,null,2));
  if(!baseline){check('signing/date and later notes stay separately editable without moving the source',original.fields.signature==='万盛街道办事处'&&original.fields.date==='2024-04-03'&&original.fields.postscript===postscriptParagraphs.slice(-2).join('\n')&&original.fields.sourceMaterial===postscriptNotice);check('annotation field is visible and opens automatically',await page.locator('#postscript').isVisible());}
  await exports('original');
  if(!baseline){
   check('summary identifies the notes and the authored date',(await page.locator('#review-summary').innerText()).includes('2024年4月3日')&&(await page.locator('#review-summary').innerText()).includes('附注'));
   if(profile.id==='chrome')await page.screenshot({path:resolve(folder,'summary.png'),fullPage:true});
   await page.locator('#material-source summary').click();await download('#material-download-original','source.txt');check('downloaded original is exact and includes notes in their original position',await readFile(resolve(folder,'source.txt'),'utf8')===postscriptNotice);
   await page.locator('#draft-menu').click();await download('#save-draft','portable.gongwen.json');await page.locator('#copy-current').click();await page.locator('#title').fill('【模拟附注更正】'+original.fields.title);await page.locator('[data-step="1"]').click();await page.locator('#date').fill(original.fields.date);await page.locator('#postscript').fill(postscriptParagraphs.at(-2)+'\n（模拟附注更正，仅供本地验证）');
   const changed=await current();check('copy correction only changes explicitly edited title and postscript',Object.keys(original.fields).filter(key=>!['title','postscript'].includes(key)).every(key=>original.fields[key]===changed.fields[key]));await exports('simulated');await writeFile(resolve(folder,'simulated.json'),JSON.stringify(await current(),null,2));
   await page.locator('#draft-menu').click();await page.locator('.recent-document').first().getByRole('button',{name:'继续编辑',exact:true}).click();check('original notes and historical date recover after editing a copy',JSON.stringify((await current()).fields)===JSON.stringify(original.fields));await page.reload();await page.waitForFunction(()=>window.writerReady===true);check('refresh retains the v3 draft and original source',(await current()).version===3&&(await current()).fields.sourceMaterial===postscriptNotice&&(await current()).fields.postscript===original.fields.postscript);
   const fresh=await browser.newContext({serviceWorkers:'block'}),restored=await fresh.newPage();try{await restored.goto(server.url);await restored.waitForFunction(()=>window.writerReady);await restored.locator('#load-draft').setInputFiles(resolve(folder,'portable.gongwen.json'));await restored.waitForFunction(()=>JSON.parse(localStorage.getItem('gongwen-writer-v1')).version===3);check('portable v3 restores every field into fresh browser storage',JSON.stringify(await restored.evaluate(()=>JSON.parse(localStorage.getItem('gongwen-writer-v1')).fields))===JSON.stringify(original.fields));}finally{await fresh.close();}
   check('ordinary closing correction stays inside the guided flow',context.pages().length===1&&!page.url().includes('advanced'));
  }
  check('no runtime errors',result.errors.length===0);result.passed=true;
 }catch(e){result.error=e.stack;await page.screenshot({path:resolve(folder,'failure.png'),fullPage:true}).catch(()=>{});throw e;}
 finally{results.push(result);await writeFile(resolve(out,baseline?'baseline.json':'result.json'),JSON.stringify(results,null,2));await context.close();await browser.close();}
}}finally{await server.close();}
