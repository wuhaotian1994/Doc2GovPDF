// Layout fixtures only. Functional checks run against the real EXE separately.
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {extname} from 'node:path';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'build/qa');
await mkdir(out,{recursive:true});
const fixture=JSON.parse(await readFile(resolve(out,'ui-fixture.json'),'utf8'));
const webRoot=resolve(root,'frontend');
const server=createServer(async(req,res)=>{try{const path=resolve(webRoot,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!path.startsWith(webRoot)){res.writeHead(403).end();return;}const file=path===webRoot?resolve(path,'index.html'):path;const bytes=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css'})[extname(file)]||'application/octet-stream');res.end(bytes);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const pageURL='http://127.0.0.1:'+server.address().port+'/index.html';
const profile=await mkdtemp(resolve(out,'edge-'));
const edge=process.env.EDGE_BINARY || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const child=spawn(edge,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async fn=>{for(let i=0;i<120;i++){try{const r=await fn();if(r)return r;}catch{}await sleep(100);}throw new Error('Browser timeout');};
let socket,id=0;const jobs=new Map();
function call(method,params={}){return new Promise((resolve,reject)=>{const request=++id;const timer=setTimeout(()=>{jobs.delete(request);reject(new Error(method+' timed out'));},10000);jobs.set(request,{resolve,reject,timer});socket.send(JSON.stringify({id:request,method,params}));});}
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function capture(name){const r=await call('Page.captureScreenshot',{format:'png'});await writeFile(resolve(out,name+'.png'),Buffer.from(r.data,'base64'));}
try{
 const port=await until(async()=> (await readFile(resolve(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);
 const targets=await (await fetch(`http://127.0.0.1:${port}/json`)).json();
 socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
 socket.addEventListener('message',event=>{const r=JSON.parse(event.data);const job=jobs.get(r.id);if(job){clearTimeout(job.timer);jobs.delete(r.id);r.error?job.reject(new Error(r.error.message)):job.resolve(r.result);}});
 await call('Page.enable');await call('Runtime.enable');
 await call('Emulation.setDeviceMetricsOverride',{width:1120,height:720,deviceScaleFactor:1,mobile:false});
 await call('Page.addScriptToEvaluateOnNewDocument',{source:'const fixture='+JSON.stringify(fixture)+';window.go={main:{App:{Templates:async()=>fixture.templates,GetPreferences:async()=>({agency:"",referencePrefix:"",outputFormat:"both",autoUpdate:true}),GetWorkspace:async()=>({document:{blocks:[]}}),Fonts:async()=>fixture.fonts,BuildDocument:async()=>structuredClone(fixture.model),InspectDocument:async()=>structuredClone(fixture.inspection),PreviewDocument:async()=>structuredClone(fixture.preview),SaveWorkspace:async()=>{},MarkHealthy:async()=>{}}}};'});
 await call('Page.navigate',{url:pageURL});
 await until(()=>evaluate('Boolean(window.appReady)'));
 await capture('01-home');
 await evaluate('document.getElementById("sample-home").click()');
 await until(()=>evaluate('Boolean(document.querySelector("#pdf-pages canvas"))'));
 await capture('02-review');
 await call('Emulation.setDeviceMetricsOverride',{width:560,height:700,deviceScaleFactor:1,mobile:false});
 await capture('03-narrow');
 const overflow=await evaluate('document.documentElement.scrollWidth > innerWidth');
 if(overflow)throw new Error('Narrow layout overflows');
 console.log('Captured home, actual PDF review, and narrow layout fixtures.');
}finally{server.close();socket?.close();child.kill();for(const j of jobs.values())clearTimeout(j.timer);}
