import {EngineClient} from './engine-client.js';
import {BrowserStorage} from './browser-storage.js';
const storeName='gongwen-web-v1';
let ownsDraft=false,acquiring;
async function ensureOwner(){
 if(ownsDraft)return;
 if(!navigator.locks)throw Error('此浏览器不支持安全草稿锁，请使用新版 Edge、Chrome、Firefox 或 Safari。');
 if(!acquiring)acquiring=new Promise((resolve,reject)=>{navigator.locks.request(storeName,{ifAvailable:true},lock=>{if(!lock){resolve(false);return}ownsDraft=true;resolve(true);return new Promise(()=>{})}).catch(reject)});
 const ok=await acquiring;if(!ok){acquiring=null;throw Error('已在另一标签页打开。请关闭另一个公文整理页面，再点击“重试启动”，以免覆盖草稿。')}
}
const notices=[];
const notice=message=>{if(!notices.includes(message))notices.push(message)};
const storage=new BrowserStorage(async w=>{const validated=await engine.call('ValidateWorkspace',w);validated.updatedAt=new Date().toISOString();return validated},notice);
const engine=new EngineClient({fonts:async()=>{const f=await storage.read('fonts');if(f===undefined)return {};if(!f||typeof f!=='object'||Array.isArray(f)){notice('授权字体记录损坏，已临时使用内置字体，可在偏好设置中重新选择。');return {}}return f},fontError:role=>notice('“'+role+'”字体文件无法载入，已临时使用内置字体，请重新选择授权文件。')});
const call=(method,...args)=>engine.call(method,...args);
function base64(bytes){let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s)}
function bytes(value){return Uint8Array.from(atob(value),c=>c.charCodeAt(0))}
function choose(accept){return new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept=accept;input.hidden=true;document.body.append(input);const finish=file=>{input.remove();resolve(file)};input.onchange=()=>finish(input.files[0]);input.addEventListener('cancel',()=>finish(null),{once:true});input.click()});}
const downloads=new Map();
function download(name,blob){const old=downloads.get(name);if(old)URL.revokeObjectURL(old);const url=URL.createObjectURL(blob);downloads.set(name,url);while(downloads.size>3){const key=downloads.keys().next().value;URL.revokeObjectURL(downloads.get(key));downloads.delete(key)}const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();}
let sharedAPI;
export function createBrowserAPI(){
 if(sharedAPI)return sharedAPI;
 const api={browser:true};
 for(const method of ['Templates','Fonts','BuildDocument','InspectDocument','ApplyDocumentFix','NormalizeDocument','PreviewSafeRepairs','SetParagraphRole','UpdateDocumentElements','PreviewDocument'])api[method]=(...args)=>call(method,...args);
 api.Notices=()=>notices.splice(0);
 api.GetWorkspace=async()=>{await ensureOwner();const w=await storage.getWorkspace();if(w.document?.sourceId){const source=await storage.read('source:'+w.document.sourceId);if(source)return call('ValidateWorkspace',w,source);notice('原始 Word 副本缺失，草稿文字仍保留。请从工作备份恢复原件后再导出 Word。')}return w};
 api.SaveWorkspace=async w=>{await ensureOwner();return storage.save(structuredClone(w))};
 const defaults=()=>({agency:'',referencePrefix:'',outputFormat:'both',autoUpdate:false});
 api.GetPreferences=async()=>{const p=await storage.read('preferences');if(p===undefined)return defaults();try{return await call('ValidatePreferences',p)}catch{notice('单位设置损坏，已使用默认设置。原数据仍保留。');return defaults()}};
 api.SavePreferences=async p=>{await ensureOwner();const checked=await call('ValidatePreferences',p);return storage.mutate(async()=>{const prior=await storage.read('preferences');const entries=[['preferences',checked]];if(prior!==undefined)entries.push(['preferences-previous',prior]);await storage.write(entries)})};
 api.ClearLocalDrafts=async()=>{await ensureOwner();await storage.clear()};
 api.OpenWorkspacePath=async file=>{await ensureOwner();if(!(file instanceof File))throw Error('请重新选择文件');if(file.size>50*1024*1024)throw Error('文件超过 50 MB');const data=base64(new Uint8Array(await file.arrayBuffer()));const model=await call('Import',file.name,data);if(model.sourceId)await storage.mutate(()=>storage.write([['source:'+model.sourceId,data]]));return {name:file.name,document:model,ignored:[],actions:[]}};
 api.ImportWorkspace=async()=>{const file=await choose('.docx,.txt');return file?api.OpenWorkspacePath(file):null};
 api.ExportDocument=async(model,format,tracked)=>{const original=model.sourceId?await storage.read('source:'+model.sourceId):null;const file=await call('ExportDocument',model,format,tracked,original);download(file.name,new Blob([bytes(file.data)],{type:format==='both'?'application/zip':format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}));return {paths:[file.name]}};
 api.OpenResult=async name=>{const url=downloads.get(name);if(!url)throw Error('下载已过期，请重新生成');const a=document.createElement('a');a.href=url;a.download=name;a.click()};
 api.ReviewPDFFile=async()=>{const file=await choose('.pdf');if(!file)return {};if(file.size>32*1024*1024)throw Error('PDF 超过 32 MB');const pdf=base64(new Uint8Array(await file.arrayBuffer()));return {name:file.name,pdf,inspection:await call('InspectPDF',pdf,[])}};
 api.RecheckPDF=(pdf,allow)=>call('InspectPDF',pdf,allow);
 api.CancelPreview=async()=>engine.cancelPreview();
 api.MarkHealthy=ensureOwner;
 api.UpdateStatus=async()=>({version:'2.1.0 Web',configured:false,message:'文件在浏览器内处理；新版在所有旧页面关闭后生效。'});
 api.InstallFont=async role=>{await ensureOwner();const file=await choose('.ttf,.ttc');if(!file)return false;if(file.size>32*1024*1024)throw Error('字体超过 32 MB');const data=base64(new Uint8Array(await file.arrayBuffer()));await call('ValidateFont',role,data);await storage.mutate(async()=>{const previous=await storage.read('fonts');const fonts=previous&&typeof previous==='object'&&!Array.isArray(previous)?{...previous}:{};fonts[role]=data;const entries=[['fonts',fonts]];if(previous!==undefined)entries.push(['fonts-previous',previous]);await storage.write(entries)});engine.reset();await call('Fonts');return true};
 api.RemoveFont=async role=>{await ensureOwner();await storage.mutate(async()=>{const previous=await storage.read('fonts');const fonts=previous&&typeof previous==='object'&&!Array.isArray(previous)?{...previous}:{};delete fonts[role];const entries=[['fonts',fonts]];if(previous!==undefined)entries.push(['fonts-previous',previous]);await storage.write(entries)});engine.reset();return call('Fonts')};
 api.BackupWorkspace=async()=>{await ensureOwner();const workspace=await api.GetWorkspace();if(!workspace.document.blocks?.length&&!workspace.form)throw Error('当前没有需要备份的文稿');const source=workspace.document.sourceId?await storage.read('source:'+workspace.document.sourceId):null;const file=await call('CreateBackup',{workspace,source,preferences:await api.GetPreferences()});download(file.name,new Blob([bytes(file.data)],{type:'application/zip'}));return file.name};
 api.ReadBackup=async()=>{const file=await choose('.gongwen,.zip,.json');if(!file)return null;if(file.size>70*1024*1024)throw Error('备份超过 70 MB');return call('ReadBackup',base64(new Uint8Array(await file.arrayBuffer())))};
 api.AttachBackupSource=async bundle=>{const file=await choose('.docx');if(!file)return bundle;if(file.size>50*1024*1024)throw Error('原件超过 50 MB');return call('ValidateBackup',{...bundle,source:base64(new Uint8Array(await file.arrayBuffer()))})};
 api.RestoreBackup=async bundle=>{await ensureOwner();const checked=await call('ValidateBackup',bundle);if(checked.needsSource)throw Error('请先选择此草稿对应的原始 Word');await storage.restore(checked)};
 api.DownloadRecovery=async()=>{const workspace=await storage.read('workspace');const model=workspace?.data?.document||workspace?.document;const source=model?.sourceId?await storage.read('source:'+model.sourceId):null;download('公文整理-保留数据.json',new Blob([JSON.stringify({workspace,source,previous:await storage.read('workspace-previous')})],{type:'application/json'}))};
 sharedAPI=api;return api;
}
