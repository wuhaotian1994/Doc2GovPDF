import {createRequire} from 'node:module';import {readFile,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';import assert from 'node:assert/strict';import {startWebServer} from './browser-tests/server.mjs';
const require=createRequire(new URL('./browser-tests/package.json',import.meta.url)),{chromium,firefox,webkit}=require('playwright');
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'build/qa/ceo-004-postscript'),server=await startWebServer(resolve(root,'build/qa/ceo-004-postscript-web')),results=[];
try{for(const p of [{id:'chrome',engine:chromium,channel:'chrome'},{id:'firefox',engine:firefox},{id:'webkit',engine:webkit}]){
 const browser=await p.engine.launch({headless:true,...(p.channel?{channel:p.channel}:{}),env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',http_proxy:'',https_proxy:'',all_proxy:'',NO_PROXY:'127.0.0.1,localhost'},...(p.id==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),checks=[];
 const check=(name,condition)=>{assert.ok(condition,name);checks.push(name);console.log(p.id+': '+name);};
 try{
  const original=JSON.parse(await readFile(resolve(out,p.id,'portable.gongwen.json'),'utf8'));await context.addInitScript(seed=>{if(!localStorage.getItem('gongwen-writer-v1'))localStorage.setItem('gongwen-writer-v1',JSON.stringify(seed));},original);
  let release;const gate=new Promise(r=>release=r);await page.route('**/write.js',async route=>{await gate;await route.continue();});await page.goto(server.url,{waitUntil:'commit'});
  check('v3 notes hydrate before application modules load',await page.locator('#postscript').inputValue()===original.fields.postscript);
  const overflow=()=>page.evaluate(()=>{const event=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{getData:()=>'x'.repeat(4001)}});return !document.getElementById('postscript').dispatchEvent(event);});
  check('oversized note paste is rejected before startup',await overflow()&&await page.locator('#postscript').inputValue()===original.fields.postscript);
  const pending=original.fields.postscript+'\n（启动前核对保留）';await page.locator('[data-step="1"]').click();await page.locator('#postscript').fill(pending);await page.reload({waitUntil:'commit'});check('new note edits persist through reload before startup',await page.locator('#postscript').inputValue()===pending);release();await page.waitForFunction(()=>window.writerReady);await page.unroute('**/write.js');
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('gongwen-writer-v1')));check('startup recovery retains current v3 notes and original material',saved.version===3&&saved.fields.postscript===pending&&saved.fields.sourceMaterial===original.fields.sourceMaterial);
  check('oversized note paste is rejected after startup without truncation',await overflow()&&await page.locator('#postscript').inputValue()===pending);
  await page.locator('[data-step="0"]').click();if(!await page.locator('#material-entry').evaluate(n=>n.open))await page.locator('#material-entry summary').click();await page.locator('#pendingMaterial').fill('多日期材料\n第一处说明。\n2024年4月26日\n正文。\n某办公室\n2024年4月3日\n（保留说明）');await page.locator('#material-open').click();
  check('multiple dates require an explicit position instead of guessing',await page.locator('#material-date-choice').isVisible()&&await page.locator('[data-material-field=date]').count()===0);
  await page.locator('[data-material-field=title]').check();await page.locator('#material-date-source').selectOption('1');await page.locator('[data-material-field=date]').check();await page.locator('#material-date-source').selectOption('0');
  check('switching source positions retains title selection and resets closing consent',await page.locator('[data-material-field=title]').isChecked()&&!await page.locator('[data-material-field=date]').isChecked());results.push({profile:p.id,checks,passed:true});
 }finally{await context.close();await browser.close();}
}}finally{await server.close();await writeFile(resolve(out,'recovery-new-field.json'),JSON.stringify(results,null,2));}
