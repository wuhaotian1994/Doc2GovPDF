const requests=[],errors=[];
// Layout fixtures only. Functional checks run against the real EXE separately.
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {extname} from 'node:path';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'build/qa');
await mkdir(out,{recursive:true});

const webRoot=resolve(root,'dist/web');
const server=createServer(async(req,res)=>{try{const path=resolve(webRoot,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!path.startsWith(webRoot)){res.writeHead(403).end();return;}const file=path===webRoot?resolve(path,'index.html'):path;const bytes=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.wasm':'application/wasm'})[extname(file)]||'application/octet-stream');res.end(bytes);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const pageURL='http://127.0.0.1:'+server.address().port+'/index.html';
const profile=await mkdtemp(resolve(out,'web-edge-'));
const edge=process.env.EDGE_BINARY || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const child=spawn(edge,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async fn=>{for(let i=0;i<1200;i++){try{const r=await fn();if(r)return r;}catch{}await sleep(100);}throw new Error('Browser timeout');};
let socket,id=0;const jobs=new Map();
function call(method,params={}){return new Promise((resolve,reject)=>{const request=++id;const timer=setTimeout(()=>{jobs.delete(request);reject(new Error(method+' timed out'));},120000);jobs.set(request,{resolve,reject,timer});socket.send(JSON.stringify({id:request,method,params}));});}
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function capture(name){if(process.env.WEB_FUNCTIONS_ONLY==='1')return;const r=await call('Page.captureScreenshot',{format:'png'});await writeFile(resolve(out,name+'.png'),Buffer.from(r.data,'base64'));}
try{
 const port=await until(async()=> (await readFile(resolve(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);
 const targets=await (await fetch(`http://127.0.0.1:${port}/json`)).json();
 socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
 socket.addEventListener('message',event=>{const r=JSON.parse(event.data);if(r.method==='Network.requestWillBeSent')requests.push(r.params.request.url);if(r.method==='Runtime.exceptionThrown')errors.push(r.params.exceptionDetails);const job=jobs.get(r.id);if(job){clearTimeout(job.timer);jobs.delete(r.id);r.error?job.reject(new Error(r.error.message)):job.resolve(r.result)}});
 await call('Page.enable');await call('Runtime.enable');await call('Network.enable');

 await call('Page.navigate',{url:pageURL});await until(()=>evaluate('window.appReady'));
 await evaluate('(async()=>{const a=(await import("./browser-api.js")).createBrowserAPI();await a.SaveWorkspace({name:"跨标签保护验收",document:{blocks:[]},form:{kind:"notice",title:"草稿不被覆盖"},screen:"welcome",resumeTarget:"compose"})})()');
 const target=await call('Target.createTarget',{url:pageURL});
 const all=await (await fetch(`http://127.0.0.1:${port}/json`)).json();const second=new WebSocket(all.find(t=>t.id===target.targetId).webSocketDebuggerUrl);await new Promise(r=>second.addEventListener('open',r,{once:true}));
 let secondId=0;const waiting=new Map();second.addEventListener('message',({data})=>{const m=JSON.parse(data);if(waiting.has(m.id)){waiting.get(m.id)(m.result);waiting.delete(m.id)}});
 const onSecond=expression=>new Promise(resolve=>{const id=++secondId;waiting.set(id,resolve);second.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}))});
 await until(async()=>{const r=await onSecond('document.querySelector("#error-text")?.textContent.includes("另一标签页")');return r?.result?.value});
 const blocked=await onSecond('(async()=>{const a=(await import("./browser-api.js")).createBrowserAPI();try{await a.SaveWorkspace({name:"错误覆盖",document:{blocks:[]}});return false}catch{return true}})()');if(!blocked.result.value)throw Error('second tab overwrote draft');
 await call('Target.closeTarget',{targetId:target.targetId});second.close();
 const retained=await evaluate('(async()=>{const a=(await import("./browser-api.js")).createBrowserAPI();return (await a.GetWorkspace()).name})()');if(retained!=='跨标签保护验收')throw Error('draft overwritten');
 await writeFile(resolve(out,'web-storage-result.json'),JSON.stringify({passed:true,checks:['single editable tab','second-tab save rejected','original draft preserved']},null,2));console.log('PASS: multiple tabs cannot overwrite the active draft.');
}finally{server.close();socket?.close();child.kill();for(const j of jobs.values())clearTimeout(j.timer)}
