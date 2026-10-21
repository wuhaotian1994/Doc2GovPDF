import test from 'node:test';import assert from 'node:assert/strict';import {WriterEngine} from '../web/write-engine.js';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
class TestWorker{
 static all=[];
 constructor(){this.messages=[];this.terminated=false;TestWorker.all.push(this);}
 postMessage(value){this.messages.push(value);queueMicrotask(()=>this.onmessage?.({data:{id:value.id,value:{method:value.request.method}}}));}
 terminate(){this.terminated=true;}
 ready(){return this.onmessage({data:{ready:true}});}
}
test('late boot font resolution and errors from a replaced worker cannot reset its replacement',async()=>{
 const native=globalThis.Worker;globalThis.Worker=TestWorker;TestWorker.all=[];let release;const gate=new Promise(resolve=>release=resolve);let calls=0;const engine=new WriterEngine(()=>++calls===1?gate:{});
 try{
  const first=engine.call('BuildDocument',{title:'原稿'});const rejected=assert.rejects(first,/bounded reset/);await tick();const old=TestWorker.all[0];const oldReady=old.ready();engine.reset(Error('bounded reset'));await rejected;
  const second=engine.call('BuildDocument',{title:'最新稿'});await tick();const replacement=TestWorker.all[1];await replacement.ready();assert.equal((await second).method,'BuildDocument');
  release({'仿宋':'obsolete-font-bytes'});await oldReady;await tick();old.onerror();assert.equal(engine.worker,replacement);assert.equal(replacement.terminated,false);assert.deepEqual(replacement.messages.map(message=>message.request.method),['BuildDocument']);assert.equal((await engine.call('InspectDocument',{})).method,'InspectDocument');
 }finally{engine.reset(Error('test finished'));globalThis.Worker=native;release?.({});}
});
test('worker processing errors reject the current call and the next call can start cleanly',async()=>{
 const native=globalThis.Worker;globalThis.Worker=TestWorker;TestWorker.all=[];const engine=new WriterEngine();
 try{
  const first=engine.call('PreviewDocument',{}),rejected=assert.rejects(first,/排版暂时中断/);await tick();const old=TestWorker.all[0];old.postMessage=function(value){this.messages.push(value);};await old.ready();await tick();old.onerror();await rejected;
  const next=engine.call('BuildDocument',{});await tick();const replacement=TestWorker.all[1];await replacement.ready();assert.equal((await next).method,'BuildDocument');assert.equal(old.terminated,true);
 }finally{engine.reset(Error('test finished'));globalThis.Worker=native;}
});
