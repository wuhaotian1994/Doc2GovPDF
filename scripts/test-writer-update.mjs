import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,mkdtemp,cp} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {startWebServer} from './browser-tests/server.mjs';
const require=createRequire(new URL('./browser-tests/package.json',import.meta.url));const {chromium}=require('playwright');
const root=resolve(import.meta.dirname,'..'),build=resolve(root,process.env.WRITER_WEB_ROOT||'build/qa/first-use-web'),out=resolve(root,'build/qa/first-use');await mkdir(out,{recursive:true});
const served=await mkdtemp(resolve(root,'build/qa/upgrade-assets-'));await cp(build,served,{recursive:true});
const files=['write.js','write-model.js','write-engine.js','write-library.js','write-boot.js','write.css'];
for(const file of files)await writeFile(resolve(served,file),execFileSync('git',['show','9a8bb66:web/'+file],{cwd:root,windowsHide:true}));
let oldHTML=execFileSync('git',['show','9a8bb66:web/write.html'],{cwd:root,windowsHide:true}).toString();oldHTML=oldHTML.replace('<script src="write-boot.js"></script>','<script>'+await readFile(resolve(served,'write-boot.js'),'utf8')+'</script>');await writeFile(resolve(served,'index.html'),oldHTML);
const cached=['./index.html',...files.map(name=>'./'+name),'./vendor/pdfjs/pdf.mjs','./vendor/pdfjs/pdf.worker.mjs','./engine-worker.js','./wasm_exec.js','./document-engine.wasm'];
await writeFile(resolve(served,'sw.js'),`const CACHE='gongwen-web-legacy-test',FILES=${JSON.stringify(cached)};self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));self.addEventListener('fetch',e=>e.respondWith(caches.open(CACHE).then(async c=>(await c.match(e.request))||(e.request.mode==='navigate'?await c.match('./index.html'):null)||fetch(e.request))));`);
const server=await startWebServer(served);const browser=await chromium.launch({headless:true,channel:'chrome'});const context=await browser.newContext();const page=await context.newPage();
async function until(predicate){const deadline=Date.now()+120000;while(!await page.evaluate(predicate)){if(Date.now()>deadline)throw Error('Cache migration did not finish');await new Promise(resolve=>setTimeout(resolve,100));}}
try{
 await page.goto(server.url);await page.waitForFunction(()=>window.writerReady);await page.locator('#title').fill('旧缓存升级保护测试');await page.locator('[data-next="1"]').click();await page.locator('#body').fill('升级期间仍在编辑的合成正文。');
 await page.evaluate(()=>navigator.serviceWorker.ready);
 const oldCache=await page.evaluate(async()=>{
  const cache=await caches.open('gongwen-web-legacy-test');
  for(const name of ['pdf.mjs','pdf.worker.mjs']){const url=new URL('./vendor/pdfjs/'+name,location.href);const response=await cache.match(url);await cache.put(url,new Response(await response.text(),{headers:{'Content-Type':'text/plain; charset=utf-8'}}));}
  const entry=await cache.match(new URL('./index.html',location.href));return {redirected:entry.redirected};
 });assert.equal(oldCache.redirected,true);
 let navigations=0;page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
 await cp(build,served,{recursive:true});
 await page.evaluate(async()=>{await (await navigator.serviceWorker.getRegistration()).update();});
 await until(async()=>!(await caches.keys()).includes('gongwen-web-legacy-test'));
 await until(async()=>{const registration=await navigator.serviceWorker.getRegistration();return registration.active?.state==='activated'&&!registration.installing&&!registration.waiting&&navigator.serviceWorker.controller?.state==='activated';});
 assert.equal(navigations,0);assert.equal(await page.locator('#body').inputValue(),'升级期间仍在编辑的合成正文。');
 await writeFile(resolve(out,'upgrade-cache-diagnostic.json'),JSON.stringify(await page.evaluate(async()=>{
  const records=[];for(const key of await caches.keys()){const cache=await caches.open(key);const response=await cache.match(new URL('./',location.href));records.push({key,root:response?{url:response.url,redirected:response.redirected,status:response.status,body:(await response.text()).slice(0,80)}:null,entries:(await cache.keys()).map(r=>r.url).filter(u=>/index|sw.js/.test(u))});}
  const reg=await navigator.serviceWorker.getRegistration();return {records,active:reg.active?.scriptURL,controller:navigator.serviceWorker.controller?.scriptURL};
 }),null,2));
 await page.reload({waitUntil:'commit'});await page.locator('#save-document').waitFor();await page.waitForFunction(()=>document.getElementById('body').value==='升级期间仍在编辑的合成正文。');
 await page.locator('#pdf-pages canvas').waitFor({timeout:120000});assert.equal(await page.locator('#title').inputValue(),'旧缓存升级保护测试');
 await writeFile(resolve(out,'cached-upgrade.json'),JSON.stringify({passed:true,legacyCommit:'9a8bb66',oldEntryRedirected:true,oldScriptType:'text/plain',automaticLegacyCacheMigration:true,forcedPageReload:false,draftPreserved:true,ordinaryReloadAndPreviewWork:true},null,2));
 console.log('PASS: legacy redirected/MIME cache migrated without reloading the editing page; ordinary reload preserves draft and previews.');
}finally{await context.close();await browser.close();await server.close();}
