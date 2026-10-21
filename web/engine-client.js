export class CancelledError extends Error { constructor(message='排版已取消'){super(message);this.name='CancelledError'} }

// One engine per page. Cancellation ends the worker, not the draft or queued checks.
export class EngineClient {
 constructor({workerFactory=()=>new Worker('./engine-worker.js'),fonts=async()=>({}),fontError=()=>{},timeout=45000,bootTimeout=120000}={}){
  Object.assign(this,{workerFactory,fonts,fontError,timeout,bootTimeout});this.queue=[];this.pending=new Map();this.next=0;this.worker=null;this.boot=null;this.active=null;
 }
 call(method,...args){
  if(method==='PreviewDocument')this.queue=this.queue.filter(job=>{if(job.method!=='PreviewDocument')return true;job.reject(new CancelledError('已由新的预览请求替代'));return false});
  const promise=new Promise((resolve,reject)=>this.queue.push({method,args,resolve,reject}));this.pump();return promise;
 }
 async pump(){
  if(this.active||!this.queue.length)return;
  const job=this.active=this.queue.shift();
  try{await this.start();job.resolve(await this.send(job.method,job.args))}catch(e){job.reject(e)}finally{if(this.active===job)this.active=null;this.pump()}
 }
 start(){
  if(this.boot)return this.boot;
  this.boot=new Promise((resolve,reject)=>{
   let local;try{local=this.worker=this.workerFactory()}catch(e){queueMicrotask(()=>this.reset(e));reject(e);return}this.rejectBoot=reject;
   this.bootTimer=setTimeout(()=>this.reset(Error('引擎加载超时，请检查网络后重试。')),this.bootTimeout);
   local.onmessage=async({data})=>{
    if(this.worker!==local)return;
    if(data.fatal){this.reset(Error(data.fatal));return}
    if(data.ready){
     try{for(const [role,data] of Object.entries(await this.fonts())){if(this.worker!==local)return;try{await this.send('RegisterFont',[role,data])}catch(e){if(this.worker!==local)return;this.fontError(role,e)}}
      if(this.worker!==local)return;clearTimeout(this.bootTimer);this.rejectBoot=null;resolve();
     }catch(e){if(this.worker===local)this.reset(e)}
     return;
    }
    const job=this.pending.get(data.id);if(job){this.pending.delete(data.id);clearTimeout(job.timer);data.error?job.reject(Error(data.error)):job.resolve(data.value)}
   };
   local.onerror=()=>{if(this.worker===local)this.reset(Error('文档引擎已停止，草稿保留，请重试。'))};
  });return this.boot;
 }
 send(method,args){return new Promise((resolve,reject)=>{
  if(!this.worker){reject(new CancelledError());return}
  const id=++this.next,timer=setTimeout(()=>this.reset(Error('处理超时，文件和草稿仍保留，请缩小文档或重试。')),this.timeout);
  this.pending.set(id,{resolve,reject,timer});try{this.worker.postMessage({id,request:{method,args}})}catch(e){this.reset(e)}
 })}
 cancelPreview(){
  const error=new CancelledError();this.queue=this.queue.filter(job=>{if(job.method!=='PreviewDocument')return true;job.reject(error);return false});
  if(this.active?.method==='PreviewDocument')this.reset(error,false);
 }
 reset(error=new CancelledError('引擎已重新载入'),clearQueue=true){
  this.worker?.terminate();this.worker=null;clearTimeout(this.bootTimer);this.rejectBoot?.(error);this.rejectBoot=null;this.boot=null;
  for(const job of this.pending.values()){clearTimeout(job.timer);job.reject(error)}this.pending.clear();
  if(clearQueue){for(const job of this.queue)job.reject(error);this.queue=[]}
 }
}
