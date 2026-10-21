import {createRequire} from 'node:module';import {mkdir,readFile,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';import assert from 'node:assert/strict';import {startWebServer} from './browser-tests/server.mjs';
const require=createRequire(new URL('./browser-tests/package.json',import.meta.url)),{chromium,firefox,webkit}=require('playwright');
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'build/qa/ceo-hospital'),baseline=process.argv.includes('--baseline'),fixture=JSON.parse(await readFile(resolve(root,'scripts/fixtures/writer-hospital-notice.json'),'utf8'));await mkdir(out,{recursive:true});
const server=await startWebServer(resolve(root,baseline?'build/qa/ceo-hospital-baseline-web':'build/qa/ceo-hospital-web')),results=[];
try{for(const profile of [{id:'chrome',engine:chromium,channel:'chrome'},{id:'firefox',engine:firefox},{id:'webkit',engine:webkit}].filter(p=>!baseline||p.id==='chrome')){
 const browser=await profile.engine.launch({headless:true,...(profile.channel?{channel:profile.channel}:{}),env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',http_proxy:'',https_proxy:'',all_proxy:'',NO_PROXY:'127.0.0.1,localhost'},...(profile.id==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
 try{for(const variant of baseline?['as-copied','tidied']:['tidied']){
 const folder=resolve(out,profile.id+(baseline?'-baseline':''),variant);await mkdir(folder,{recursive:true});const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',acceptDownloads:true,serviceWorkers:'block'}),page=await context.newPage();page.setDefaultTimeout(30000);
 const result={profile:profile.id,version:browser.version(),baseline,variant,checks:[],errors:[],passed:false};page.on('pageerror',e=>result.errors.push(e.message));const check=(name,v)=>{assert.ok(v,name);result.checks.push(name);console.log(profile.id+'/'+variant+': '+name);};
 const download=async(selector,name)=>{const waiting=page.waitForEvent('download',{timeout:120000});await page.locator(selector).click();const file=await waiting;assert.equal(await file.failure(),null);await file.saveAs(resolve(folder,name));};
 try{
  await page.goto(server.url);await page.waitForFunction(()=>window.writerReady);await page.locator('#material-entry summary').click();await page.locator('#pendingMaterial').fill(fixture.raw);await page.locator('#material-open').click();
  check(baseline?'baseline offers explanatory preamble as recipient':'explanatory preamble is not offered as a recipient',await page.locator('[data-material-field=recipient]').count()===(baseline?1:0));
  check('no candidate or whitespace transformation is adopted by default',await page.locator('#material-candidates input:checked').count()===0&&!await page.locator('#material-join').isChecked());await page.locator('[data-material-field=title]').check();
  check('default proposal keeps original paragraph gaps',await page.locator('#material-body-preview').inputValue()===fixture.paragraphs.join('\n\n'));
  if(variant==='tidied'){
   if(!baseline)check('existing option explicitly names removing paragraph gaps',(await page.locator('#material-join').locator('..').innerText()).includes('去除段间空行'));
   await page.locator('#material-join').check();check('existing cleanup preserves all eighteen paragraphs and their indentation',await page.locator('#material-body-preview').inputValue()===fixture.paragraphs.join('\n'));
   await page.locator('#material-join').uncheck();check('unchecking restores all original gaps before adoption',await page.locator('#material-body-preview').inputValue()===fixture.paragraphs.join('\n\n'));await page.locator('#material-join').check();
   if(!baseline&&profile.id==='chrome')await page.locator('#material-dialog').screenshot({path:resolve(folder,'proposal.png')});
  }
  await page.locator('#material-apply').click();await page.waitForFunction(()=>!document.getElementById('material-dialog').open);const saved=JSON.parse(await page.evaluate(()=>localStorage.getItem('gongwen-writer-v1')));await writeFile(resolve(folder,'fields.json'),JSON.stringify(saved,null,2));
  check('source remains exact and no website date or hospital signature is fabricated',saved.fields.sourceMaterial===fixture.raw&&saved.fields.date===''&&saved.fields.signature===''&&saved.fields.recipient===''&&saved.fields.title===fixture.title);
  await page.locator('[data-step="2"]').click();await page.waitForFunction(()=>document.getElementById('preview-status').textContent.startsWith('已更新'),{},{timeout:120000});for(const input of await page.locator('.review-issue input[type=checkbox]').all())await input.check();
  for(const format of ['docx','pdf','txt']){await page.locator(`[name=format][value=${format}]`).check();await page.locator('#export:not([disabled])').waitFor();await download('#export','notice.'+format);}
  check('actual Word PDF and text files download',true);await page.locator('#material-source summary').click();await download('#material-download-original','source.txt');check('downloaded original is the unchanged input including blank lines',await readFile(resolve(folder,'source.txt'),'utf8')===fixture.raw);
  await page.reload();await page.waitForFunction(()=>window.writerReady);check('refresh keeps the chosen paragraph preparation and original',JSON.stringify(await page.evaluate(()=>JSON.parse(localStorage.getItem('gongwen-writer-v1')).fields))===JSON.stringify(saved.fields));
  check('no runtime errors',result.errors.length===0);result.passed=true;
 }catch(e){result.error=e.stack;await page.screenshot({path:resolve(folder,'failure.png'),fullPage:true}).catch(()=>{});throw e;}
 finally{results.push(result);await writeFile(resolve(out,baseline?'baseline.json':'result.json'),JSON.stringify(results,null,2));await context.close();}
 }}finally{await browser.close();}
}}finally{await server.close();}
