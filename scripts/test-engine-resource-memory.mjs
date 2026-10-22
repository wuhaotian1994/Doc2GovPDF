import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,webcrypto} from 'node:crypto';
import {runInNewContext} from 'node:vm';
const source=await readFile(new URL('../web/engine-resources.js',import.meta.url),'utf8'),baseline=process.env.RESOURCE_MEMORY_BASELINE==='1';
// Protocol/resource probes use opaque bytes. They are not manuscript-repro tests.
const payload=new Uint8Array(1024*1024).fill(37),hash=createHash('sha256').update(payload),sha256=hash.digest('hex');
const asset=url=>({url,sha256,type:'font/ttf',integrity:'sha256-'+createHash('sha256').update(payload).digest('base64')});
function setup({failOnce=false,registerFailOnce=false}={}){
 const names=['Noto Serif SC','Noto Serif SC Black'],fonts=names.map((name,i)=>({name,core:asset(`./f${i}-core.ttf`),full:asset(`./f${i}-full.ttf`)})),stored=new Map(),installed=new Map();
 let fetches=0,active=0,maxActive=0,registrations=0,registrationFailures=0;
 const self={location:{href:'https://example.test/engine-worker.js'},documentEngine(raw){
  const {method,args}=JSON.parse(raw);
  if(method==='RequiredFallbackFonts')return JSON.stringify({value:names.filter(name=>!installed.has(name)||args[1]&&!installed.get(name)).map(name=>({name,text:'A',complete:Boolean(args[1])}))});
  assert.equal(method,'RegisterFallbackFont');registrations++;
  if(registerFailOnce&&registrationFailures++===0)return JSON.stringify({error:'registration rejected'});
  assert.equal(Buffer.from(args[1],'base64').length,payload.length);installed.set(args[0],Boolean(args[2])||Boolean(installed.get(args[0])));return '{}';
 }};
 const cache={async match(url){return stored.get(url)?.clone();},async delete(url){return stored.delete(url);},async put(url,response){stored.set(url,response.clone());}};
 runInNewContext(source,{self,crypto:webcrypto,URL,Uint8Array,Response,Map,Error,btoa:value=>Buffer.from(value,'binary').toString('base64'),postMessage(){},caches:{async open(){return cache;}},fetch:async()=>{
  fetches++;active++;maxActive=Math.max(maxActive,active);try{await new Promise(resolve=>setTimeout(resolve,10));if(failOnce&&fetches===1)throw Error('offline');return new Response(payload);}finally{active--;}
 }});
 return {loader:new self.EngineResources({version:'memory-test',fonts,coreCoverage:[[32,126]]}),fonts,state:()=>({fetches,maxActive,registrations,installed:installed.size,retainedPending:0})};
}
test('font preparation bounds simultaneous downloads and releases settled resource promises',async t=>{
 const {loader,state}=setup();await loader.prepare({},false);const measured={...state(),retainedPending:loader.pending.size};t.diagnostic(JSON.stringify(measured));
 assert.equal(measured.installed,2);
 if(!baseline){assert.equal(measured.maxActive,1);assert.equal(measured.retainedPending,0);}
 const stable=state();await loader.prepare({},false);assert.equal(state().fetches,stable.fetches);assert.equal(state().registrations,stable.registrations);
 await loader.prepare({},true);assert.equal(state().registrations,4);await loader.prepare({},false);assert.equal(state().registrations,4);
 if(!baseline)assert.equal(loader.pending.size,0);
});
test('in-flight callers share one download and verified cache remains usable after release',async()=>{
 const {loader,fonts,state}=setup();const [a,b]=await Promise.all([loader.bytes(fonts[0].core),loader.bytes(fonts[0].core)]);assert.equal(a.byteLength,payload.length);assert.equal(b.byteLength,payload.length);assert.equal(state().fetches,1);
 if(!baseline)assert.equal(loader.pending.size,0);
 await loader.bytes(fonts[0].core);assert.equal(state().fetches,1);
});
test('failed registration can retry without falsely marking a face installed',async()=>{
 const {loader,state}=setup({registerFailOnce:true});await assert.rejects(loader.prepare({},false),/registration rejected/);await loader.prepare({},false);assert.equal(state().installed,2);if(!baseline)assert.equal(loader.pending.size,0);
});
