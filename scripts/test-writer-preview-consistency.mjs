import {createRequire} from 'node:module';import {mkdir,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';import assert from 'node:assert/strict';import {startWebServer} from './browser-tests/server.mjs';
const require=createRequire(new URL('./browser-tests/package.json',import.meta.url)),{chromium,firefox,webkit}=require('playwright');
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'build/qa/ceo-005'),server=await startWebServer(resolve(root,'build/qa/ceo-005-web')),results=[];
try{for(const p of [{id:'chrome',engine:chromium,channel:'chrome'},{id:'firefox',engine:firefox},{id:'webkit',engine:webkit}]){
 const browser=await p.engine.launch({headless:true,...(p.channel?{channel:p.channel}:{}),env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',http_proxy:'',https_proxy:'',all_proxy:'',NO_PROXY:'127.0.0.1,localhost'},...(p.id==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})}),context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',serviceWorkers:'block',acceptDownloads:true}),page=await context.newPage();page.setDefaultTimeout(120000);const folder=resolve(out,p.id);await mkdir(folder,{recursive:true});
 const result={profile:p.id,version:browser.version(),checks:[],errors:[],passed:false};page.on('pageerror',e=>result.errors.push(e.message));const check=(name,condition)=>{assert.ok(condition,name);result.checks.push(name);console.log(p.id+': '+name);};
 await context.addInitScript(()=>{
  const token=text=>text.match(/本地速度核对(.)/u)?.[1]||'';
  const B=window.previewConsistency={paints:[],lastToken:'',requests:[],workers:[],injected:[],replace(next){const node=document.getElementById('body');node.value=node.value.replace(/本地速度核对./u,'本地速度核对'+next);node.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:next}));B.savedDuringUpdate=JSON.parse(localStorage.getItem('gongwen-writer-v1')).fields.body===node.value;B.editableDuringUpdate=!document.getElementById('editable').disabled;}};
  const Native=window.Worker;window.Worker=class extends Native{
   constructor(...args){super(...args);B.workers.push(String(args[0]));this.jobs=new Map();this.addEventListener('message',({data})=>{const job=this.jobs.get(data.id);if(!job)return;this.jobs.delete(data.id);if(job.method==='PreviewDocument'&&!data.error)B.lastToken=job.token;});}
   postMessage(message,...rest){if(message.request){const {method,args}=message.request;const marker=token(args?.[0]?.blocks?.map(b=>b.paragraph?.text||'').join('\n')||'');this.jobs.set(message.id,{method,token:marker});B.requests.push({method,token:marker});if(method==='PreviewDocument'&&B.injectAtRequest?.from===marker){const next=B.injectAtRequest.to;B.injectAtRequest=null;setTimeout(()=>{B.replace(next);B.injected.push('request');},0);}}return super.postMessage(message,...rest);}
  };
  const fill=CanvasRenderingContext2D.prototype.fillRect;CanvasRenderingContext2D.prototype.fillRect=function(...args){if(this.canvas.getAttribute('aria-label')?.startsWith('文档第 ')&&B.injectAtCanvas?.from===B.lastToken){const next=B.injectAtCanvas.to;B.injectAtCanvas=null;queueMicrotask(()=>{B.replace(next);B.injected.push('canvas');});}return fill.apply(this,args);};
  addEventListener('DOMContentLoaded',()=>new MutationObserver(records=>{if(records.some(r=>r.target.id==='pdf-pages')&&document.querySelector('#pdf-pages canvas'))B.paints.push({token:B.lastToken,expectedAtCommit:token(document.getElementById('body').value)});}).observe(document.body,{subtree:true,childList:true}));
 });
 const ready=async token=>{await page.waitForFunction(token=>document.getElementById('preview-status').textContent.startsWith('已更新')&&window.previewConsistency.paints.some(p=>p.token===token),token,{timeout:120000});};
 try{
  await page.goto(server.url);await page.waitForFunction(()=>window.writerReady);await page.locator('#title').fill('连续输入成品一致性合成稿');await page.locator('[data-next="1"]').click();await page.locator('#body').fill('请核对本地合成资料，保留原始记录。本地速度核对甲');await ready('甲');
  await page.evaluate(()=>{window.previewConsistency.injectAtRequest={from:'乙',to:'丙'};window.previewConsistency.replace('乙');});await ready('丙');
  check('input and durable saving remain available while the layout worker is processing',await page.evaluate(()=>previewConsistency.editableDuringUpdate&&previewConsistency.savedDuringUpdate));
  await page.evaluate(()=>{window.previewConsistency.injectAtCanvas={from:'丁',to:'戊'};window.previewConsistency.replace('丁');});await ready('戊');
  check('updates injected during worker processing and canvas rendering are both exercised',await page.evaluate(()=>previewConsistency.injected.includes('request')&&previewConsistency.injected.includes('canvas')));
  check('no out-of-date canvas is committed after a newer input exists',await page.evaluate(()=>previewConsistency.paints.every(p=>p.token===p.expectedAtCommit)));
  await page.evaluate(async()=>{for(const token of ['己','庚','辛','壬','癸']){window.previewConsistency.replace(token);await new Promise(r=>setTimeout(r,25));}});await ready('癸');
  check('rapid successive changes settle on the newest value',await page.locator('#body').inputValue()==='请核对本地合成资料，保留原始记录。本地速度核对癸');
  await page.locator('[data-step="2"]').click();await ready('癸');for(const box of await page.locator('.review-issue input[type=checkbox]').all())await box.check();
  for(const format of ['docx','pdf','txt']){await page.locator(`[name=format][value=${format}]`).check();await page.locator('#export:not([disabled])').waitFor();const waiting=page.waitForEvent('download');await page.locator('#export').click();const file=await waiting;assert.equal(await file.failure(),null);await file.saveAs(resolve(folder,'latest.'+format));}
  const fields=await page.evaluate(()=>JSON.parse(localStorage.getItem('gongwen-writer-v1')).fields);await writeFile(resolve(folder,'latest.json'),JSON.stringify(fields,null,2));result.trace=await page.evaluate(()=>({paints:previewConsistency.paints,workers:previewConsistency.workers,injected:previewConsistency.injected}));
  if(p.id==='chrome'){const pixels=await page.locator('#pdf-pages canvas').evaluate(node=>node.toDataURL('image/png').split(',')[1]);await writeFile(resolve(folder,'latest-preview.png'),Buffer.from(pixels,'base64'));}
  check('actual Word PDF and text are downloaded for exact latest-source verification',true);check('no runtime errors',result.errors.length===0);result.passed=true;
 }catch(e){result.error=e.stack;await page.screenshot({path:resolve(folder,'failure.png'),fullPage:true}).catch(()=>{});throw e;}
 finally{results.push(result);await writeFile(resolve(out,'consistency.json'),JSON.stringify(results,null,2));await context.close();await browser.close();}
}}finally{await server.close();}
