import {createRequire} from 'node:module';
import {startWebServer} from './browser-tests/server.mjs';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import assert from 'node:assert/strict';
import {blank,draft} from '../web/write-model.js';
const require=createRequire(new URL('./browser-tests/package.json',import.meta.url));
const {chromium,firefox,webkit}=require('playwright');
const root=resolve(import.meta.dirname,'..'),webRoot=resolve(root,'build/qa/startup-web'),out=resolve(root,'build/qa/startup');
await mkdir(out,{recursive:true});
const server=await startWebServer(webRoot);
const url=server.url;
const profiles=[{name:'chrome',type:chromium,channel:'chrome'},{name:'firefox',type:firefox},{name:'webkit',type:webkit}].filter(p=>!process.env.STARTUP_BROWSER||p.name===process.env.STARTUP_BROWSER);
const results=[];
const title='启动保护测试稿',recipient='测试部门',reference='示例办〔2026〕0058号',body='这是用于启动保护验证的合成正文。';
try{
 for(const profile of profiles){
  const browser=await profile.type.launch({headless:true,...(profile.channel?{channel:profile.channel}:{}),env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',http_proxy:'',https_proxy:'',all_proxy:'',NO_PROXY:'127.0.0.1,localhost'},...(profile.name==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
  try{
   for(const scenario of ['immediate-input','enter-key','delayed-module','missing-module','missing-preview','delayed-storage','legacy-query','pending-query-reload','different-current-draft','recovery-archive-failure','javascript-disabled']){
    const result={browser:profile.name,version:browser.version(),scenario,passed:false};
    const context=await browser.newContext({serviceWorkers:'block',javaScriptEnabled:scenario!=='javascript-disabled',locale:'zh-CN'});
    const page=await context.newPage();page.setDefaultTimeout(20000);
    const requests=[];page.on('request',r=>{if(r.isNavigationRequest())requests.push(r.url());});
    let release;const gate=new Promise(r=>release=r);
    try{
     if(scenario==='delayed-module')await page.route('**/write.js',async route=>{await gate;await route.continue();});
     if(scenario==='missing-module'||scenario==='pending-query-reload')await page.route('**/write.js',route=>route.abort());
     if(scenario==='missing-preview')await page.route('**/vendor/pdfjs/pdf.js*',route=>route.abort());
     if(scenario==='delayed-storage'||scenario==='legacy-query'){
      await context.addInitScript(seed=>{localStorage.setItem('gongwen-writer-v1',JSON.stringify(seed));},draft({...blank(),title:'先前保存的测试稿',body:'先前正文需要保留'},0,'prior-draft'));
     }
     if(scenario==='delayed-storage')await context.addInitScript(()=>{
      const open=indexedDB.open.bind(indexedDB);
      indexedDB.open=(...args)=>{const request=open(...args);Object.defineProperty(request,'onsuccess',{configurable:true,set(callback){request.addEventListener('success',event=>{window.releaseWriterStorage=()=>callback(event);},{once:true});}});return request;};
     });
     if(['different-current-draft','recovery-archive-failure'].includes(scenario))await context.addInitScript(({current,pending,fail})=>{localStorage.setItem('gongwen-writer-v1',JSON.stringify(current));sessionStorage.setItem('gongwen-writer-pending-v1',JSON.stringify(pending));if(fail){const native=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='gongwen-writer-library-v1')throw new DOMException('quota','QuotaExceededError');return native.call(this,key,value);};}},{current:draft({...blank(),title:'当前另一份测试稿',body:'另一份正文必须保留'},0,'draft-b'),pending:{version:1,fields:{...blank(),title,body},touched:['title'],step:0,baseId:'draft-a',source:''},fail:scenario==='recovery-archive-failure'});
     const query=['legacy-query','pending-query-reload'].includes(scenario)?'?'+new URLSearchParams(Object.entries({...blank(),title,recipient,reference,body,format:'docx'}).filter(([name])=>name!=='letterhead')).toString():'';
     await page.goto(url+query,{waitUntil:'commit'});
     if(scenario==='delayed-storage')await page.waitForFunction(()=>typeof window.releaseWriterStorage==='function');
     if(scenario==='pending-query-reload'){
      await page.locator('#title').fill(title+'继续修改');await page.locator('[data-next="1"]').click();await page.locator('#body').fill(body+'继续修改');
      await page.reload();assert.equal(await page.locator('#title').inputValue(),title+'继续修改');assert.equal(await page.locator('#body').inputValue(),body+'继续修改');
      await page.unroute('**/write.js');await page.reload();await page.waitForFunction(()=>window.writerReady);
      assert.equal(await page.locator('#title').inputValue(),title+'继续修改');assert.equal(await page.locator('#body').inputValue(),body+'继续修改');assert.equal(await page.evaluate(()=>location.search),'');
     }else if(scenario==='recovery-archive-failure'){
      await page.waitForFunction(()=>window.writerReady);assert.equal(await page.locator('#body').inputValue(),body);
      await page.locator('#new-document').click();assert.equal(await page.locator('#body').inputValue(),body);
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('gongwen-writer-v1')).fields.body),'另一份正文必须保留');
      assert.ok((await page.locator('#global-error').textContent()).includes('切换已取消'));
     }else if(scenario==='different-current-draft'){
      await page.waitForFunction(()=>window.writerReady);assert.equal(await page.locator('#body').inputValue(),body);
      const state=await page.evaluate(()=>({current:JSON.parse(localStorage.getItem('gongwen-writer-v1')),library:JSON.parse(localStorage.getItem('gongwen-writer-library-v1')),pending:sessionStorage.getItem('gongwen-writer-pending-v1')}));
      assert.equal(state.current.fields.body,body);assert.notEqual(state.current.id,'draft-b');assert.equal(state.library.items[0].document.fields.body,'另一份正文必须保留');assert.equal(state.pending,null);
     }else if(scenario==='legacy-query'){
      await page.waitForFunction(()=>window.writerReady);
      assert.equal(await page.locator('#title').inputValue(),title);
      assert.equal(await page.locator('#body').inputValue(),body);
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('gongwen-writer-library-v1')).items[0].document.fields.body),'先前正文需要保留');
      assert.equal(await page.evaluate(()=>location.search),'');
     }else{
      await page.locator('#title').fill(title);await page.locator('#recipient').fill(recipient);
      await page.locator('[data-panel="0"] summary').click();await page.locator('#reference').fill(reference);
      const before=requests.length;
      if(scenario==='enter-key')await page.locator('#reference').press('Enter');else await page.locator('[data-next="1"]').click();
      assert.equal(requests.length,before,'Next must not issue a document navigation');
      assert.equal(await page.locator('#title').inputValue(),title);
      assert.equal(await page.locator('#recipient').inputValue(),recipient);
      assert.equal(await page.locator('#reference').inputValue(),reference);
      if(scenario!=='javascript-disabled'){
       assert.equal(await page.locator('[data-panel="1"]').isVisible(),true);
       if(scenario==='delayed-storage'){
        await page.evaluate(()=>history.pushState({},'', '#before-ready'));
        await page.goBack();
        await page.keyboard.press('Control+s');
        await page.evaluate(()=>window.releaseWriterStorage());
        await page.waitForFunction(()=>window.writerReady);
        assert.equal(await page.locator('#body').inputValue(),'先前正文需要保留');
       }else{
        await page.locator('#body').fill(body);
        assert.equal(await page.locator('#body-count').textContent(),body.length+' 字');
        if(profile.name==='chrome'&&scenario==='missing-module')await page.screenshot({path:resolve(out,'protected-startup.png'),fullPage:true});
        await page.locator('[data-next="2"]').click();
       }
       if(scenario==='delayed-module')release();
       if(scenario==='missing-module'){
        await page.locator('#startup-notice').waitFor({state:'visible'});
        const waiting=page.waitForEvent('download');await page.locator('#startup-download').click();const download=await waiting;
        const path=resolve(out,profile.name+'-emergency.gongwen.json');await download.saveAs(path);
        assert.equal(JSON.parse(await readFile(path,'utf8')).fields.body,body);
        await page.unroute('**/write.js');await page.reload();
       }
       await page.waitForFunction(()=>window.writerReady);
       assert.equal(await page.locator('#title').inputValue(),title);
       assert.equal(await page.locator('#reference').inputValue(),reference);
       assert.equal(await page.locator('#body').inputValue(),scenario==='delayed-storage'?'先前正文需要保留':body);
       if(scenario!=='delayed-storage')assert.equal(await page.locator('[data-panel="2"]').isVisible(),true);
       if(scenario==='missing-preview'){
        await page.waitForFunction(()=>document.getElementById('global-error').textContent.includes('暂时无法显示预览'),{},{timeout:120000});
        await page.locator('[name=format][value=txt]').check();const waiting=page.waitForEvent('download');await page.locator('#export').click();const download=await waiting;
        const path=resolve(out,profile.name+'-without-preview.txt');await download.saveAs(path);assert.ok((await readFile(path,'utf8')).includes(body));
        await page.unroute('**/vendor/pdfjs/pdf.js*');await page.locator('[data-back="1"]').click();await page.locator('#body').fill(body+'继续修改。');await page.locator('[data-next="2"]').click();
        await page.locator('#pdf-pages canvas').waitFor({timeout:120000});assert.equal(await page.locator('#global-error').isVisible(),false);
        await page.locator('[name=format][value=pdf]').check();for(const box of await page.locator('#check-list input[type=checkbox]').all())await box.check();
        await page.locator('#export:not([disabled])').waitFor();const recovered=page.waitForEvent('download');await page.locator('#export').click();await (await recovered).saveAs(resolve(out,profile.name+'-recovered.pdf'));
       }
       const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('gongwen-writer-v1')));
       assert.equal(saved.fields.title,title);assert.equal(saved.fields.reference,reference);
      }
     }
     result.passed=true;console.log('PASS '+profile.name+' '+scenario);
    }catch(error){release();result.error=error.stack;try{await page.screenshot({path:resolve(out,profile.name+'-'+scenario+'-failure.png'),fullPage:true});}catch{}console.error('FAIL '+profile.name+' '+scenario+': '+error.message);}
    finally{release();await context.close();}
    results.push(result);await writeFile(resolve(out,'startup-results.json'),JSON.stringify(results,null,2));
   }
  }finally{await browser.close();}
 }
}finally{await server.close();}
console.log(JSON.stringify(results.map(({browser,scenario,passed})=>({browser,scenario,passed}))));
if(results.some(result=>!result.passed))process.exitCode=1;
