import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,webcrypto} from 'node:crypto';
import {runInNewContext} from 'node:vm';
const source=await readFile(new URL('../web/engine-resources.js',import.meta.url),'utf8');
const bytes=new Uint8Array([17,32,64,128]),sha256=createHash('sha256').update(bytes).digest('hex');
const asset={url:'./test.wasm',sha256,type:'application/wasm',integrity:'sha256-'+createHash('sha256').update(bytes).digest('base64')};
function setup(options={}){
  let stored=options.corrupt?new Response(new Uint8Array([0])):null,fetches=0,deletions=0;
  const cache={async match(){return stored?.clone();},async delete(){stored=null;deletions++;},async put(url,response){if(options.quota)throw Error('quota');stored=response.clone();}};
  const self={location:{href:'https://example.test/engine-worker.js'}};
  runInNewContext(source,{self,crypto:webcrypto,URL,Uint8Array,Response,Map,Error,postMessage(){},caches:{async open(){return cache;}},fetch:async(url,init)=>{fetches++;assert.equal(url,'https://example.test/test.wasm');assert.equal(init.integrity,asset.integrity);if(options.failOnce&&fetches===1)throw Error('offline');return new Response(bytes);}});
  return {loader:new self.EngineResources({version:'test',coreCoverage:[[32,126],[0x4e00,0x4e05]]}),state:()=>({fetches,deletions,stored})};
}
test('concurrent resource users share one verified download and can reuse stored bytes',async()=>{
  const {loader,state}=setup();const [a,b]=await Promise.all([loader.bytes(asset),loader.bytes(asset)]);assert.deepEqual(new Uint8Array(a),bytes);assert.deepEqual(new Uint8Array(b),bytes);assert.equal(state().fetches,1);
  loader.pending.clear();assert.deepEqual(new Uint8Array(await loader.bytes(asset)),bytes);assert.equal(state().fetches,1);
});
test('a corrupt cached resource is discarded before a validated network replacement',async()=>{
  const {loader,state}=setup({corrupt:true});assert.deepEqual(new Uint8Array(await loader.bytes(asset)),bytes);assert.equal(state().deletions,1);assert.equal(state().fetches,1);
});
test('cache quota does not discard a valid resource and a failed download remains retryable',async()=>{
  const {loader,state}=setup({quota:true,failOnce:true});await assert.rejects(loader.bytes(asset),/offline/);assert.deepEqual(new Uint8Array(await loader.bytes(asset)),bytes);assert.equal(state().fetches,2);
});
test('coverage decisions do not mistake a rare character for a common one',()=>{
  const {loader}=setup();assert.equal(loader.hasCoreCharacters('ABC一\n\u200b'),true);assert.equal(loader.hasCoreCharacters('龘'),false);
});
