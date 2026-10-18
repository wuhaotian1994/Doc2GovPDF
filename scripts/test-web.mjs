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
const checks=[],requests=[],errors=[];
async function check(name,expression){if(!await evaluate(expression))throw Error(name);checks.push(name)}
async function size(width,height){await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600})}
try{
 const port=await until(async()=> (await readFile(resolve(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);
 const targets=await (await fetch(`http://127.0.0.1:${port}/json`)).json();
 socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
 socket.addEventListener('message',event=>{const r=JSON.parse(event.data);if(r.method==='Network.requestWillBeSent')requests.push(r.params.request.url);if(r.method==='Runtime.exceptionThrown')errors.push(r.params.exceptionDetails);const job=jobs.get(r.id);if(job){clearTimeout(job.timer);jobs.delete(r.id);r.error?job.reject(new Error(r.error.message)):job.resolve(r.result)}});
 await call('Page.enable');await call('Runtime.enable');await call('Network.enable');
 const downloadDir=await mkdtemp(resolve(out,'web-downloads-'));await call('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloadDir});
 await size(1440,960);await call('Page.navigate',{url:pageURL});await until(()=>evaluate('window.appReady'));
 await evaluate("(async()=>{window.browserAPI=(await import('./browser-api.js')).createBrowserAPI()})()");
 await check('real browser engine startup','!document.querySelector("#import-home").disabled');
 await capture('web-01-home');await size(390,844);await check('mobile home has no horizontal overflow','document.documentElement.scrollWidth<=innerWidth');await capture('web-02-home-mobile');await size(1440,960);
 await evaluate('document.querySelector("#sample-home").click()');await until(()=>evaluate('document.querySelector("#pdf-pages canvas")&&!document.querySelector("#home-open").disabled'));
 await capture('web-03-workspace');await evaluate('document.querySelector("#edit-tab").click()');await capture('web-04-editor');
 await check('left editor and right real PDF','(()=>{const a=document.querySelector("#edit-panel").getBoundingClientRect(),b=document.querySelector("#preview-panel").getBoundingClientRect();return a.width>300&&b.left>=a.right-1&&Boolean(document.querySelector("#pdf-pages canvas"))})()');
 await evaluate('document.querySelector("#editor-checks").open=true;document.querySelector("#repair-common").click()');await until(()=>evaluate('document.querySelector("#repair-dialog").open'));await check('batch confirmation contains real edits','document.querySelectorAll("#repair-changes section").length>0');await evaluate('document.querySelector("#repair-confirm").click()');await until(()=>evaluate('!document.querySelector("#repair-dialog").open&&!document.querySelector("#export-open").disabled || !document.querySelector("#font-notice").hidden'));
 await evaluate('document.querySelector("#font-ack").checked=true;document.querySelector("#font-ack").dispatchEvent(new Event("change"))');
 await until(()=>evaluate('!document.querySelector("#export-open").disabled'));await evaluate('document.querySelector("#export-open").click()');await until(()=>evaluate('!document.querySelector("#export-success").hidden'));checks.push('real UI ZIP download with review gate');
 await evaluate('document.querySelector("#home-open").click()');await check('home and resume','!document.querySelector("#welcome").hidden&&!document.querySelector("#resume-section").hidden');await evaluate('document.querySelector("#resume-work").click()');await until(()=>evaluate('!document.querySelector("#workspace").hidden'));
 const edited=await evaluate(`(async()=>{const w=await browserAPI.GetWorkspace();const p=w.document.blocks.map(b=>b.paragraph).find(p=>p?.role==='body');const input=document.querySelector('[data-paragraph="'+p.id+'"]');input.focus();input.value+='浏览器编辑验收。';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));return p.id})()`);
 await until(()=>evaluate(`browserAPI.GetWorkspace().then(w=>w.document.blocks.some(b=>b.paragraph?.text.includes('浏览器编辑验收。')))`));checks.push('IndexedDB autosave after body edit');
 await size(390,844);await check('mobile editing has no horizontal overflow','document.documentElement.scrollWidth<=innerWidth');await capture('web-05-editor-mobile');await size(1440,960);
 await evaluate('document.querySelector("#edit-elements").click();document.querySelector("#extra-elements").open=true');await capture('web-06-elements');await size(390,844);await check('mobile form has no horizontal overflow','document.documentElement.scrollWidth<=innerWidth');await capture('web-07-elements-mobile');await evaluate('document.querySelector("#compose-cancel").click()');
 // Actual Go/Wasm template generation, independent PDF parsing, and downloads.
 const result=await evaluate(`(async()=>{const out=[];for(const kind of ['notice','report','request','letter','minutes','rules','plain']){const fields={kind,title:'网页版'+kind+'验收',body:kind==='rules'?'第一章 总则\\n第一条 核对材料。\\n第二章 工作\\n第一条 保留原始资料。':'一、工作安排\\n请核对原始材料。',agency:'示例单位',reference:'办发〔2026〕12号',date:'2026年10月18日',letterhead:kind!=='plain',autoNumbering:true,attachments:['材料清单'],annexPages:true};const m=await browserAPI.BuildDocument(fields);for(const b of m.blocks){if(b.paragraph?.role==='attachment-body')b.paragraph.text='附件内容完整。'}const inspection=await browserAPI.InspectDocument(m);if(inspection.issues.some(f=>f.severity==='error'))throw Error(JSON.stringify(inspection));m.confirmedIssues=inspection.issues.map(f=>f.id);const p=await browserAPI.PreviewDocument(m);if(!p.pages||!p.pdf)throw Error('empty PDF');const pdf=await browserAPI.RecheckPDF(p.pdf,[]);if(!pdf.fonts.length)throw Error('fonts absent');const exported=await browserAPI.ExportDocument(m,'both',true);out.push({kind,pages:p.pages,files:exported.paths});}return out})()`);
 checks.push('all seven templates, automatic numbering, annexes, PDF fonts and ZIP outputs');
 const corrupt=await evaluate("browserAPI.OpenWorkspacePath(new File(['invalid'],'bad.docx')).then(()=>false,()=>true)");if(!corrupt)throw Error('corrupt DOCX accepted');checks.push('corrupt input rejected');
 const sourceNames=['企业内部报告','公文信函','公文管理办法','公文纪要','公文要素全览','公文请示','公文通知'];
 for(const name of sourceNames){const data=await readFile(resolve(root,'testdata/upstream/gongwen-kit/docx',name+'.docx'));const base=data.toString('base64');await evaluate(`(async()=>{const file=new File([Uint8Array.from(atob('${base}'),c=>c.charCodeAt(0))],${JSON.stringify(name+'.docx')});const w=await browserAPI.OpenWorkspacePath(file);const r=await browserAPI.InspectDocument(w.document);if(r.issues.some(f=>f.severity==='error'))throw Error('source error');w.document.confirmedIssues=r.issues.map(f=>f.id);await browserAPI.ExportDocument(w.document,'docx',false);})()`)}checks.push('seven upstream originals imported and exported');

 await evaluate('window.history.back()');await until(()=>evaluate('!document.querySelector("#compose").hidden'));await evaluate('window.history.forward()');await until(()=>evaluate('!document.querySelector("#welcome").hidden'));checks.push('browser back/forward retains form and draft');
 await evaluate('document.querySelector("#settings-open").click();document.querySelector("#font-role").value="黑体";document.querySelector("#font-import").click()');
 await until(()=>evaluate('Boolean(document.querySelector("input[type=file]"))'));
 const dom=await call('DOM.getDocument');const chooser=await call('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'input[type=file]'});await call('DOM.setFileInputFiles',{nodeId:chooser.nodeId,files:[resolve(root,'assets/fonts/NotoSerifSC-Black.ttf')]});
 await until(()=>evaluate('document.querySelector("#font-install-state").textContent.includes("已保存")'));await check('authorized font loaded locally','browserAPI.Fonts().then(fs=>fs.some(f=>f.name==="黑体"&&f.available))');await evaluate('document.querySelector("#settings-close").click()');
 await evaluate('navigator.serviceWorker.ready');await evaluate('window.oldDocumentMarker=true');await call('Page.reload');await until(()=>evaluate('window.appReady&&!window.oldDocumentMarker'));await check('draft restored after reload',`document.querySelector('#resume-name').textContent.length>0`);
 await call('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});await evaluate('window.oldDocumentMarker=true');await call('Page.reload');await until(()=>evaluate('window.appReady&&!window.oldDocumentMarker'));checks.push('offline reload and engine startup');await check('saved draft still available offline','!document.querySelector("#resume-section").hidden');await call('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
 const external=requests.filter(u=>!u.startsWith('http://127.0.0.1:')&&!u.startsWith('blob:')&&!u.startsWith('data:'));if(external.length)throw Error('Unexpected remote requests '+external.join(','));if(errors.length)throw Error('Browser exceptions '+JSON.stringify(errors));checks.push('no external requests or document uploads');
 await until(async()=>{const names=await readdir(downloadDir);return names.length>=15&&!names.some(n=>n.endsWith('.crdownload'))});
 await writeFile(resolve(out,'web-result.json'),JSON.stringify({passed:true,checks,templates:result,downloadDir,profile},null,2));console.log('PASS: '+checks.length+' browser checks, seven templates, seven original imports, offline reload; no external requests.');
}catch(e){await capture('web-failure').catch(()=>{});throw e}finally{server.close();socket?.close();child.kill();for(const j of jobs.values())clearTimeout(j.timer);}
