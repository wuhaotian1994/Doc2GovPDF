import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..'), out=resolve(root,'build/qa/guided'), webRoot=resolve(root,'build/qa/guided-web');
await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{
  try{
    const file=resolve(webRoot,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/\/$/,'/index.html'));
    if(!file.startsWith(webRoot+sep)){res.writeHead(403).end();return;}
    const data=await readFile(file);
    res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.wasm':'application/wasm'})[extname(file)]||'application/octet-stream');res.end(data);
  }catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port+'/index.html';
const profile=await mkdtemp(resolve(out,'edge-'));
const downloads=await mkdtemp(resolve(out,'downloads-'));
const child=spawn(process.env.EDGE_BINARY || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],
  {windowsHide:true,stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,label='condition')=>{
  for(let i=0;i<1800;i++){try{const value=await fn();if(value)return value;}catch{}await sleep(100);}
  throw Error('Timeout: '+label);
};
let socket, sequence=0;const pending=new Map(),exceptions=[],requests=[],checks=[];
function call(method,params={}){
  return new Promise((resolve,reject)=>{
    const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('Timeout '+method));},180000);
    pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;}
async function screenshot(name){
  if(process.env.GUIDED_FUNCTIONS_ONLY==='1')return;
  const metrics=await call('Page.getLayoutMetrics');
  const image=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:metrics.cssContentSize.width,height:metrics.cssContentSize.height,scale:1}});
  await writeFile(resolve(out,name+'.png'),Buffer.from(image.data,'base64'));
}
async function check(name,expression){assert.ok(await evaluate(expression),name);checks.push(name);console.log('PASS '+name);}
async function fill(id,value){await evaluate(`(()=>{const el=document.getElementById(${JSON.stringify(id)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('input',{bubbles:true}));})()`);}
async function click(selector){await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);}
async function waitPreview(){await until(()=>evaluate(`document.getElementById('preview-status').textContent.startsWith('已更新')`),'real PDF preview');}
try {
  const port=await until(async()=>(await readFile(resolve(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);
  const targets=await(await fetch(`http://127.0.0.1:${port}/json`)).json();
  socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
  socket.addEventListener('message',event=>{
    const data=JSON.parse(event.data);
    if(data.method==='Runtime.exceptionThrown')exceptions.push(data.params.exceptionDetails);
    if(data.method==='Network.requestWillBeSent')requests.push(data.params.request.url);
    const job=pending.get(data.id);if(job){clearTimeout(job.timer);pending.delete(data.id);data.error?job.reject(Error(data.error.message)):job.resolve(data.result);}
  });
  await call('Page.enable');await call('Runtime.enable');await call('Network.enable');
  await call('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url});await until(()=>evaluate('window.writerReady'),'boot');
  await check('starts directly with title, without document type',`document.querySelector('[name=kind]')===null && !document.querySelector('[data-panel="0"]').hidden`);
  await screenshot('desktop-start');
  await click('[data-panel="0"] [type=submit]');
  await check('empty title gives inline error and focus',`document.activeElement.id==='title' && !document.getElementById('title-error').hidden`);
  await fill('title','关于开展业务培训的通知');
  await fill('recipient','各部门');
  await click('[data-panel="0"] [type=submit]');
  await click('[data-panel="1"] [type=submit]');
  await check('empty body gives inline error',`document.activeElement.id==='body' && !document.getElementById('body-error').hidden`);
  const body='为提升业务能力，现就开展业务培训有关事项通知如下。\n一、培训内容\n学习文档规范，交流工作经验。\n二、工作要求\n请各部门结合实际做好安排。';
  await fill('body',body);await fill('signature','综合办公室');await fill('date','2026-10-20');
  await waitPreview();
  await screenshot('desktop-writing');
  await check('real PDF canvas rendered',`document.querySelector('#pdf-pages canvas').width>500`);
  await click('[data-panel="1"] [type=submit]');
  await check('summary has exact title and explicit signature',`document.getElementById('review-summary').textContent.includes('综合办公室') && document.getElementById('review-summary').textContent.includes('关于开展业务培训的通知')`);
  await screenshot('desktop-export');
  await until(()=>evaluate(`!document.getElementById('export').disabled`),'export ready');
  await click('#export');await until(async()=>(await readdir(downloads)).some(n=>n.endsWith('.docx')),'Word download');
  await click('[name=format][value=pdf]');await click('#export');await until(async()=>(await readdir(downloads)).some(n=>n.endsWith('.pdf')),'PDF download');
  await click('[name=format][value=txt]');await click('#export');await until(async()=>(await readdir(downloads)).some(n=>n.endsWith('.txt')),'TXT download');
  checks.push('real Word, PDF and TXT downloads');
  const text=await readFile(resolve(downloads,(await readdir(downloads)).find(n=>n.endsWith('.txt'))),'utf8');
  assert.ok(text.includes(body)&&text.includes('综合办公室'));checks.push('TXT preserves all body text');
  await click('#draft-menu');await click('#save-draft');
  await until(async()=>(await readdir(downloads)).some(n=>n.endsWith('.gongwen.json')),'draft download');
  const draftPath=resolve(downloads,(await readdir(downloads)).find(n=>n.endsWith('.gongwen.json')));
  const saved=JSON.parse(await readFile(draftPath,'utf8'));assert.equal(saved.fields.body,body);checks.push('editable draft preserves fields');
  await click('[data-close="draft-dialog"]');
  await call('Page.reload');await until(()=>evaluate('window.writerReady'),'reload');await waitPreview();
  await check('reload recovers form and current step',`document.getElementById('body').value===${JSON.stringify(body)} && !document.querySelector('[data-panel="2"]').hidden`);
  await click('[data-back="1"]');
  await fill('body','<img src=x onerror=alert(1)>\n数字：123.45\n'+body);
  await check('editing invalidates old export immediately',`document.getElementById('export').disabled`);
  await waitPreview();
  await check('untrusted draft text is not interpreted as markup',`document.querySelector('img[src=x]')===null`);
  await fill('body',body);await waitPreview();
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await screenshot('mobile-writing');
  await check('mobile has no horizontal overflow and retains preview',`document.documentElement.scrollWidth<=390 && document.querySelector('#pdf-pages canvas').getBoundingClientRect().width>0`);
  await click('[data-panel="1"] [type=submit]');await screenshot('mobile-export');
  await click('#draft-menu');await click('#new-document');await click('#confirm-replace');
  await check('new document clears fields',`document.getElementById('title').value===''`);
  await check('new document clears old PDF and pagination',`document.querySelector('#pdf-pages canvas')===null && document.getElementById('page-count').textContent==='A4 纸张'`);
  await click('#draft-menu');await click('#undo-replace');await click('#confirm-replace');
  await check('replacement can be undone',`document.getElementById('body').value===${JSON.stringify(body)}`);
  await click('#draft-menu');
  await call('DOM.enable');const documentNode=await call('DOM.getDocument');
  const input=await call('DOM.querySelector',{nodeId:documentNode.root.nodeId,selector:'#load-draft'});
  await call('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[draftPath]});
  await until(()=>evaluate(`document.getElementById('replace-dialog').open`),'restore confirmation');
  await click('#confirm-replace');await check('downloaded draft restores through real file input',`document.getElementById('body').value===${JSON.stringify(body)}`);
  await click('[data-back="1"]');
  await fill('date','1899-10-20');
  await check('invalid date has inline error and cannot poison saved draft',`!document.getElementById('date-error').hidden && JSON.parse(localStorage.getItem('gongwen-writer-v1')).fields.date==='2026-10-20'`);
  await click('[data-panel="1"] [type=submit]');
  await check('invalid date blocks progression',`document.activeElement.id==='date' && document.querySelector('[data-panel="2"]').hidden`);
  await click('#draft-menu');await click('#new-document');
  await check('invalid date cannot corrupt replacement backup',`!document.getElementById('replace-dialog').open && document.activeElement.id==='date' && document.getElementById('body').value===${JSON.stringify(body)}`);
  await fill('date','2026-10-20');await waitPreview();
  await click('#settings-open');await click('#font-reset');
  await check('font transaction invalidates export',`document.getElementById('export').disabled`);
  await until(()=>evaluate(`document.getElementById('font-message').textContent.includes('已保存')`),'font reset');
  await click('[data-close="settings-dialog"]');await waitPreview();
  const longBody=Array.from({length:65},(_,i)=>`这是第${i+1}段测试材料，用于核对多页文档的分页及内容完整性。`).join('\n');
  await fill('body',longBody);await waitPreview();
  await check('long document has multiple pages',`!document.getElementById('next-page').disabled`);
  await click('#next-page');
  await until(()=>evaluate(`document.getElementById('page-count').textContent.startsWith('2 /')`),'page navigation');
  checks.push('page navigation renders second real PDF page');
  await fill('body',body);await waitPreview();
  await click('[data-step="0"]');await click('#letterhead');
  await fill('agency','测试发文单位');await fill('reference','测发〔2026〕1号');await waitPreview();
  await click('[data-step="2"]');
  await check('red header keeps authored signature separate',`document.getElementById('signature').value==='综合办公室' && document.getElementById('agency').value==='测试发文单位'`);
  await fill('title','红头排版测试');await waitPreview();
  await until(()=>evaluate(`!document.getElementById('export').disabled`),'red header export');
  await click('[name=format][value=pdf]');await click('#export');
  await until(async()=>(await readdir(downloads)).some(n=>n.startsWith('红头排版测试')&&n.endsWith('.pdf')),'red header PDF');
  await click('[name=format][value=docx]');await click('#export');
  await until(async()=>(await readdir(downloads)).some(n=>n.startsWith('红头排版测试')&&n.endsWith('.docx')),'red header Word');
  checks.push('red header PDF and Word exported');
  await evaluate(`window.writerStorageSet=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError')}`);
  await click('[data-step="0"]');await fill('title','存储故障仍保留编辑内容');
  await check('storage failure gives visible backup guidance',`document.getElementById('save-status').textContent==='自动保存失败' && document.getElementById('global-error').textContent.includes('下载草稿') && document.getElementById('title').value==='存储故障仍保留编辑内容'`);
  await evaluate(`Storage.prototype.setItem=window.writerStorageSet`);
  await fill('title','红头排版测试');await waitPreview();
  await until(()=>evaluate(`navigator.serviceWorker.controller!==null || navigator.serviceWorker.ready.then(()=>true)`),'offline cache');
  await evaluate(`navigator.serviceWorker.ready.then(r=>new Promise(resolve=>{if(r.active?.state==='activated')resolve();else r.active?.addEventListener('statechange',()=>resolve())}))`);
  await call('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  await call('Page.reload');await until(()=>evaluate('window.writerReady'),'offline reload');await waitPreview();
  checks.push('offline reload retains draft and renders PDF');
  await call('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  assert.equal(exceptions.length,0,JSON.stringify(exceptions));
  const external=requests.filter(u=>!u.startsWith('http://127.0.0.1:')&&!u.startsWith('blob:')&&!u.startsWith('data:'));
  assert.equal(external.length,0,JSON.stringify(external));checks.push('no external document or asset requests');
  await evaluate(`localStorage.setItem('gongwen-writer-v1','{broken-json')`);
  await call('Page.reload');await until(()=>evaluate('window.writerReady'),'corrupt draft boot');
  await check('corrupt stored draft is preserved and reported',`localStorage.getItem('gongwen-writer-v1')==='{broken-json' && document.getElementById('global-error').textContent.includes('原始数据已保留')`);
  await writeFile(resolve(out,'result.json'),JSON.stringify({passed:true,checks,downloads,profile},null,2));
  console.log('PASS '+checks.length+' checks; downloads: '+downloads);
}catch(error){
  await writeFile(resolve(out,'failure.json'),JSON.stringify({message:error.message,checks,exceptions,downloads},null,2));
  try{await screenshot('failure');console.error(await evaluate(`({error:document.getElementById('global-error')?.textContent,status:document.getElementById('preview-status')?.textContent,checks:document.getElementById('check-list')?.textContent})`));}catch{}
  throw error;
}finally{server.close();socket?.close();child.kill();for(const job of pending.values())clearTimeout(job.timer);}
