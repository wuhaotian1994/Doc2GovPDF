import {DRAFT_MAX_BYTES,validateDraft, fieldsForEngine, applySignature, safeName} from './write-model.js';
const storeName='gongwen-web-v1';
let ownsDraft=false,acquiring;
async function ensureOwner(){
 if(ownsDraft)return;
 if(!navigator.locks)throw Error('此浏览器不支持安全草稿锁，请使用新版 Edge、Chrome、Firefox 或 Safari。');
 if(!acquiring)acquiring=new Promise((resolve,reject)=>{navigator.locks.request(storeName,{ifAvailable:true},lock=>{if(!lock){resolve(false);return}ownsDraft=true;resolve(true);return new Promise(()=>{})}).catch(reject)});
 const ok=await acquiring;if(!ok){acquiring=null;throw Error('已在另一标签页打开。请关闭另一个公文整理页面，再点击“重试启动”，以免覆盖草稿。')}
}
const dbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open(storeName,1);req.onupgradeneeded=()=>req.result.createObjectStore('files');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(Error('浏览器未允许保存草稿，请关闭隐私模式或允许本站存储。'));});
async function stored(key,value){const db=await dbPromise;return new Promise((resolve,reject)=>{const tx=db.transaction('files',arguments.length===1?'readonly':'readwrite');const request=arguments.length===1?tx.objectStore('files').get(key):tx.objectStore('files').put(value,key);tx.oncomplete=()=>resolve(request.result);tx.onerror=tx.onabort=()=>reject(Error('浏览器存储失败，请先下载文件，释放空间后重试。'));});}
function base64(bytes){let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s)}
function bytes(value){return Uint8Array.from(atob(value),c=>c.charCodeAt(0))}
let worker,ready,serial=Promise.resolve(),sequence=0,pending=new Map();
function stop(message){worker?.terminate();worker=null;ready=null;for(const job of pending.values()){clearTimeout(job.timer);job.reject(Error(message))}pending.clear();}
function raw(method,args){return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>stop('处理超时，文件和草稿保留。请缩小文档或重试。'),45000);pending.set(id,{resolve,reject,timer});worker.postMessage({id,request:{method,args}})});}
async function start(){if(ready)return ready;ready=new Promise((resolve,reject)=>{worker=new Worker('./engine-worker.js');const timer=setTimeout(()=>{stop('引擎加载超时，请检查网络后重试。');reject(Error('引擎加载超时'))},120000);worker.onmessage=async({data})=>{if(data.ready){clearTimeout(timer);try{const fonts=await stored('fonts')||{};for(const [name,data] of Object.entries(fonts))await raw('RegisterFont',[name,data]);resolve()}catch(e){reject(e)}return;}if(data.fatal){clearTimeout(timer);reject(Error(data.fatal));stop(data.fatal);return;}const job=pending.get(data.id);if(job){pending.delete(data.id);clearTimeout(job.timer);data.error?job.reject(Error(data.error)):job.resolve(data.value)}};worker.onerror=e=>{clearTimeout(timer);reject(Error('文档引擎启动失败，可刷新后重试。'));stop(e.message)};});return ready;}
function call(method,...args){const next=serial.catch(()=>{}).then(async()=>{await start();return raw(method,args)});serial=next;return next;}
function choose(accept){return new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept=accept;input.hidden=true;document.body.append(input);const finish=file=>{input.remove();resolve(file)};input.onchange=()=>finish(input.files[0]);input.addEventListener('cancel',()=>finish(null),{once:true});input.click()});}
const downloads=new Map();
function download(name,blob){const old=downloads.get(name);if(old)URL.revokeObjectURL(old);const url=URL.createObjectURL(blob);downloads.set(name,url);const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();}
export function createBrowserAPI(){
 const api={browser:true};
 for(const method of ['Templates','Fonts','BuildDocument','InspectDocument','ApplyDocumentFix','NormalizeDocument','PreviewSafeRepairs','SetParagraphRole','UpdateDocumentElements','PreviewDocument'])api[method]=(...args)=>call(method,...args);
 api.GetWorkspace=async()=>{await ensureOwner();return await stored('workspace')||{document:{blocks:[]}}};
 api.SaveWorkspace=async w=>{await ensureOwner();if(JSON.stringify(w).length>12*1024*1024)throw Error('草稿过大，请拆分文件后保存。');await stored('workspace',w)};
 api.GetPreferences=async()=>await stored('preferences')||{agency:'',referencePrefix:'',outputFormat:'both',autoUpdate:false};
 api.SavePreferences=async p=>{await ensureOwner();return stored('preferences',p)};
 api.ClearLocalDrafts=async()=>{await ensureOwner();const db=await dbPromise;await new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');const cursor=tx.objectStore('files').openCursor();cursor.onsuccess=()=>{const c=cursor.result;if(c){if(c.key==='workspace'||String(c.key).startsWith('source:'))c.delete();c.continue()}};tx.oncomplete=resolve;tx.onerror=()=>reject(Error('清除未完成，请重试'))});};
 api.OpenWorkspacePath=async file=>{
  if(!(file instanceof File))throw Error('请重新选择文件');
  if(file.name.toLowerCase().endsWith('.json')){
   if(file.size>DRAFT_MAX_BYTES)throw Error('填写草稿超过 2 MB，请选择本工具下载的草稿。');
   let draft;try{draft=validateDraft(JSON.parse(await file.text()));}catch{throw Error('这不是支持的填写草稿，当前文稿未改变。');}
   if(!draft.fields.title.trim()||!draft.fields.body.trim())throw Error('请先在填写页面补上标题与正文，再下载草稿继续编辑。当前文稿未改变。');
   const model=applySignature(await call('BuildDocument',fieldsForEngine(draft.fields)),draft.fields);
   // A native editable copy has no imported DOCX source to preserve. Keep the
   // original writer draft untouched and do not imply a reverse conversion.
   return {name:safeName(draft.fields.title)+' · 编辑副本',document:model,ignored:[],actions:[]};
  }
  if(file.size>50*1024*1024)throw Error('文件超过 50 MB');const data=base64(new Uint8Array(await file.arrayBuffer()));const model=await call('Import',file.name,data);if(model.sourceId)await stored('source:'+model.sourceId,data);return {name:file.name,document:model,ignored:[],actions:[]};
 };
 api.ImportWorkspace=async()=>{const file=await choose('.docx,.txt,.gongwen.json');return file?api.OpenWorkspacePath(file):null};
 api.ExportDocument=async(model,format,tracked)=>{const original=model.sourceId?await stored('source:'+model.sourceId):null;const file=await call('ExportDocument',model,format,tracked,original);download(file.name,new Blob([bytes(file.data)],{type:format==='both'?'application/zip':format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}));return {paths:[file.name]}};
 api.OpenResult=async name=>{const url=downloads.get(name);if(!url)throw Error('下载已过期，请重新生成');const a=document.createElement('a');a.href=url;a.download=name;a.click()};
 api.ReviewPDFFile=async()=>{const file=await choose('.pdf');if(!file)return {};if(file.size>32*1024*1024)throw Error('PDF 超过 32 MB');const pdf=base64(new Uint8Array(await file.arrayBuffer()));return {name:file.name,pdf,inspection:await call('InspectPDF',pdf,[])}};
 api.RecheckPDF=(pdf,allow)=>call('InspectPDF',pdf,allow);
 api.CancelPreview=async()=>stop('排版已取消，可刷新预览。');
 api.MarkHealthy=ensureOwner;
 api.UpdateStatus=async()=>({version:'2.0.0 Web',configured:false,message:'文件在浏览器内处理；新版在重新打开网页后生效。'});
 api.InstallFont=async role=>{await ensureOwner();const file=await choose('.ttf,.ttc');if(!file)return false;if(file.size>32*1024*1024)throw Error('字体超过 32 MB');const data=base64(new Uint8Array(await file.arrayBuffer()));await call('RegisterFont',role,data);const fonts=await stored('fonts')||{};fonts[role]=data;await stored('fonts',fonts);return true};
 return api;
}
