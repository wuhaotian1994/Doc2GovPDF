export const WORD_ACTIVE_KEY='gongwen-writer-active-v1';
const prefix='writer-word:',storeName='gongwen-web-v1';
let database;
function open(){if(database)return database;return database=new Promise((resolve,reject)=>{const request=indexedDB.open(storeName,1);request.onupgradeneeded=()=>request.result.createObjectStore('files');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('浏览器未允许保存Word工作稿。请先下载恢复包。'));});}
async function get(key){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('files');const request=tx.objectStore('files').get(key);tx.oncomplete=()=>resolve(request.result);tx.onerror=tx.onabort=()=>reject(Error('Word工作稿读取失败，原数据仍保留。'));});}
async function put(key,value){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').put(value,key);tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(Error('Word工作稿未保存，请下载恢复包后再关闭页面。'));});}
export function validateWordRecord(value){if(value?.type!=='gongwen-word'||value.version!==1||typeof value.id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(value.id)||typeof value.name!=='string'||value.name.length>220||!value.document||!Array.isArray(value.document.blocks)||JSON.stringify(value.document).length>12*1024*1024)throw Error('这份Word工作稿无法安全读取，原记录未改变。');return structuredClone(value);}
export async function wordRecords(){const db=await open();return new Promise((resolve,reject)=>{const records=[],tx=db.transaction('files'),request=tx.objectStore('files').openCursor();request.onsuccess=()=>{const cursor=request.result;if(cursor){try{if(String(cursor.key).startsWith(prefix))records.push(validateWordRecord(cursor.value));cursor.continue();}catch(e){reject(e);tx.abort();}}};tx.oncomplete=()=>resolve(records.sort((a,b)=>(b.savedAt||'').localeCompare(a.savedAt||'')));tx.onerror=tx.onabort=()=>reject(Error('Word文档列表未能读取，原数据未改变。'));});}
export async function saveWord(record){const checked=validateWordRecord(record);const existing=await get(prefix+record.id);if(!existing&&(await wordRecords()).length>=20)throw Error('已保存20份Word工作稿，请先下载并删除不再需要的工作稿；当前内容仍保留。');await put(prefix+record.id,{...checked,savedAt:new Date().toISOString()});}
export async function loadWord(id){return validateWordRecord(await get(prefix+id));}
export async function removeWord(id){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').delete(prefix+id);tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(Error('删除未完成，原记录仍保留。'));});}
export async function sourceData(sourceId){return sourceId?(await get('writer-source:'+sourceId)||await get('source:'+sourceId)):null;}
export async function saveSource(sourceId,data){if(sourceId&&!await get('writer-source:'+sourceId))await put('writer-source:'+sourceId,data);}
export async function legacyFonts(){return await get('fonts')||{};}
export async function legacyWorkspace(){return navigator.locks.request(storeName,{ifAvailable:true},async lock=>{if(!lock)throw Error('旧Word页面仍在另一标签编辑，请关闭它后在这里重试承接；旧记录未改变。');return await get('workspace');});}
export async function migrationId(signature,id){const key='writer-word-migration:'+signature;if(id)await put(key,id);return get(key);}
export function activeWord(){try{const value=JSON.parse(localStorage.getItem(WORD_ACTIVE_KEY));return value?.kind==='word'&&typeof value.id==='string'?value.id:null;}catch{return null;}}
export function setActiveWord(id){localStorage.setItem(WORD_ACTIVE_KEY,JSON.stringify(id?{kind:'word',id}:{kind:'form'}));}
