// Layout fixtures only. Functional checks run against the real EXE separately.
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {extname} from 'node:path';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'build/qa');
await mkdir(out,{recursive:true});

const webRoot=resolve(root,'build/qa/web-port');
const server=createServer(async(req,res)=>{try{const path=resolve(webRoot,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!path.startsWith(webRoot)){res.writeHead(403).end();return;}const file=path===webRoot?resolve(path,'index.html'):path;const bytes=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.wasm':'application/wasm'})[extname(file)]||'application/octet-stream');res.end(bytes);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const pageURL='http://127.0.0.1:'+server.address().port+'/index.html';
const profile=await mkdtemp(resolve(out,'web-port-edge-'));
const edge=process.env.EDGE_BINARY || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const child=spawn(edge,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async fn=>{for(let i=0;i<1200;i++){try{const r=await fn();if(r)return r;}catch{}await sleep(100);}throw new Error('Browser timeout');};
let socket,id=0;const jobs=new Map();
function call(method,params={}){return new Promise((resolve,reject)=>{const request=++id;const timer=setTimeout(()=>{jobs.delete(request);reject(new Error(method+' timed out'));},120000);jobs.set(request,{resolve,reject,timer});socket.send(JSON.stringify({id:request,method,params}));});}
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function capture(name){if(process.env.WEB_FUNCTIONS_ONLY==='1')return;const r=await call('Page.captureScreenshot',{format:'png'});await writeFile(resolve(out,name+'.png'),Buffer.from(r.data,'base64'));}
const requests=[],errors=[];
try{
 const port=await until(async()=> (await readFile(resolve(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);
 const targets=await (await fetch(`http://127.0.0.1:${port}/json`)).json();
 socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
 socket.addEventListener('message',event=>{const r=JSON.parse(event.data);if(r.method==='Network.requestWillBeSent')requests.push(r.params.request.url);if(r.method==='Runtime.exceptionThrown')errors.push(r.params.exceptionDetails);const job=jobs.get(r.id);if(job){clearTimeout(job.timer);jobs.delete(r.id);r.error?job.reject(new Error(r.error.message)):job.resolve(r.result)}});
 await call('Page.enable');await call('Runtime.enable');await call('Network.enable');
 const downloadDir=await mkdtemp(resolve(out,'web-downloads-'));await call('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloadDir});
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
 const data={text:{name:'输入样稿.txt',data:Buffer.from('测试通知\n各部门：\n请按计划完成资料整理。').toString('base64')},bad:{name:'损坏文件.docx',data:Buffer.from('bad').toString('base64')},empty:{name:'空文件.txt',data:''},unsupported:{name:'保留公式.docx',data:(await readFile(resolve(out,'web-port-fixtures/formula.docx'))).toString('base64')},pdf:{name:'公文通知.pdf',data:(await readFile(resolve(root,'testdata/upstream/gongwen-kit/pdf/公文通知.pdf'))).toString('base64')}};
 const names=await readdir(resolve(root,'testdata/upstream/gongwen-kit/docx'));for(const name of names.filter(n=>n.endsWith('.docx')))data[name]={name,data:(await readFile(resolve(root,'testdata/upstream/gongwen-kit/docx',name))).toString('base64')};
 const phases=[],code=await readFile(resolve(root,'scripts/web-journey-browser.js'),'utf8');
 for(const phase of ['1','2','3','4','5']){
  await call('Page.navigate',{url:pageURL+'?phase='+phase});await until(()=>evaluate('window.appReady'));
  await evaluate(`(async()=>{
   const api=window.browserAPI=(await import('./browser-api.js')).createBrowserAPI();const queue=[],original={...api},data=${JSON.stringify(data)};
   const file=key=>new File([Uint8Array.from(atob(data[key].data),c=>c.charCodeAt(0))],data[key].name);
   api.QAQueueDialog=async path=>queue.push(path);
   api.OpenWorkspacePath=path=>original.OpenWorkspacePath(typeof path==='string'?file(path):path);
   api.ImportWorkspace=async()=>{const key=queue.shift();return key?api.OpenWorkspacePath(key):null};
   api.ExportDocument=async(...args)=>{queue.shift();return original.ExportDocument(...args)};
   api.ReviewPDFFile=async()=>{const key=queue.shift();if(!key)return {};const {name,data:pdf}=data[key];return {name,pdf,inspection:await original.RecheckPDF(pdf,[])}};
   window.__qa={phase:${JSON.stringify(phase)},files:${JSON.stringify(names.filter(n=>n.endsWith('.docx')))},text:'text',bad:'bad',empty:'empty',unsupported:'unsupported',pdf:'pdf',output:'downloads'};
   window.__finishWebJourney=result=>{window.webPhaseResult=result};
  })()`);
  await evaluate(code);const result=await evaluate('window.webPhaseResult');phases.push(result);await writeFile(resolve(out,'web-port-result.json'),JSON.stringify({passed:phases.every(p=>p.passed),phases,downloadDir,profile},null,2));if(!result.passed)throw Error(JSON.stringify(result));
  console.log('Phase '+phase+': '+result.checks.length+' checks passed');
  await evaluate('document.dispatchEvent(new KeyboardEvent("keydown",{key:"s",ctrlKey:true,bubbles:true}))');
  await until(()=>evaluate('!document.querySelector("#save-state").textContent.includes("正在保存")&&!document.querySelector("#compose-save").textContent.includes("正在保存")'));
  await sleep(500);await evaluate('window.appReady=false');
 }
 await until(async()=>!(await readdir(downloadDir)).some(n=>n.endsWith('.crdownload')));
 if(errors.length)throw Error(JSON.stringify(errors));const external=requests.filter(u=>!u.startsWith('http://127.0.0.1:')&&!u.startsWith('blob:')&&!u.startsWith('data:'));if(external.length)throw Error('Unexpected remote requests');
 console.log('PASS: '+phases.flatMap(p=>p.checks).length+' ported workflow checks across five real page loads.');
}catch(e){await capture('web-port-failure');throw e}finally{server.close();socket?.close();child.kill();for(const j of jobs.values())clearTimeout(j.timer)}
