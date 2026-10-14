// Layout fixtures only. Functional checks run against the real EXE separately.
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'build/qa');
await mkdir(out,{recursive:true});
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
 await call('Page.navigate',{url:pathToFileURL(resolve(root,'frontend/index.html')).href});
 await until(()=>evaluate('Boolean(document.getElementById("sample-home"))'));
 await capture('01-home');
 await evaluate('document.getElementById("sample-home").click()');
 await until(()=>evaluate('!document.getElementById("workspace").hidden'));
 // Explicit sample data for visual coverage of the issue panel; never shipped.
 await evaluate(`report={issues:[{id:'fixture-reference',rule:'reference.format',paragraph:1,original:'办发【2026】第012号',replacement:'办发〔2026〕12号',message:'如果这是发文字号，年份使用六角括号，序号去掉“第”和前导零；请确认后应用。'},{id:'fixture-date',rule:'date.padding',paragraph:draft.text.split('\\n').length-1,original:'2026年10月08日',replacement:'2026年10月8日',message:'如果这是成文日期，月、日不补零；请确认后应用。'}]};renderPaper();renderReport();document.getElementById('save-state').textContent='界面截图 · 示例内容'`);
 await capture('02-review');
 await call('Emulation.setDeviceMetricsOverride',{width:560,height:700,deviceScaleFactor:1,mobile:false});
 await capture('03-narrow');
 const overflow=await evaluate('document.documentElement.scrollWidth > innerWidth');
 if(overflow)throw new Error('Narrow layout overflows');
 console.log('Captured home, review, narrow layout fixtures.');
}finally{socket?.close();child.kill();for(const j of jobs.values())clearTimeout(j.timer);}
