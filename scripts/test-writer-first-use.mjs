import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {startWebServer} from './browser-tests/server.mjs';
const require=createRequire(new URL('./browser-tests/package.json',import.meta.url));
const {chromium,firefox,webkit,devices}=require('playwright');
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'build/qa/first-use');await mkdir(out,{recursive:true});
const baseline=process.argv.includes('--baseline');
const server=process.env.WRITER_URL?{url:process.env.WRITER_URL,close:async()=>{}}:await startWebServer(resolve(root,process.env.WRITER_WEB_ROOT||'build/qa/first-use-web'));
const profiles=[{id:'chrome',engine:chromium,channel:'chrome'},{id:'edge',engine:chromium,channel:'msedge'},{id:'firefox',engine:firefox},{id:'webkit',engine:webkit},{id:'android',engine:chromium,channel:'chrome',device:devices['Pixel 7']},{id:'iphone',engine:webkit,device:devices['iPhone 13']}].filter(p=>baseline?p.id==='chrome':!process.env.FIRST_USE_PROFILE||process.env.FIRST_USE_PROFILE.split(',').includes(p.id));
const title='关于资料归档的安排',recipient='各部门',reference='示例办〔2026〕0058号',body='请各部门做好资料归档工作。\n一、整理内容\n分类整理工作记录、会议材料和有关附件。\n二、工作要求\n请核对后及时归档，保留原始记录。';
const results=[];
try{
 for(const profile of profiles){
  const folder=resolve(out,profile.id);await mkdir(folder,{recursive:true});
  const browser=await profile.engine.launch({headless:true,...(profile.channel?{channel:profile.channel}:{}),env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',http_proxy:'',https_proxy:'',all_proxy:'',NO_PROXY:'127.0.0.1,localhost'},...(profile.engine===firefox?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
  const context=await browser.newContext({...profile.device,...(!profile.device?{viewport:{width:1366,height:900}}:{}),locale:'zh-CN',timezoneId:'Asia/Shanghai',acceptDownloads:true});
  let page=await context.newPage();page.setDefaultTimeout(20000);
  const result={profile:profile.id,version:browser.version(),checks:[],passed:false,server:'actual Go webserve',resources:[],consoleErrors:[],httpErrors:[]};
  context.on('response',r=>{if(r.status()>=400)result.httpErrors.push({path:new URL(r.url()).pathname,status:r.status()});if(/vendor\/pdfjs\/.*\.m?js(?:\?|$)/.test(r.url()))result.resources.push({path:new URL(r.url()).pathname,status:r.status(),type:r.headers()['content-type']});});
  context.on('console',m=>{if(m.type()==='error')result.consoleErrors.push(m.text());});
  const check=(name,value)=>{assert.ok(value,name);result.checks.push(name);console.log(profile.id+': '+name);};
  const click=async selector=>profile.device?await page.locator(selector).tap():await page.locator(selector).click();
  const expectFields=async expected=>{
   for(const [id,value] of Object.entries(expected))await page.waitForFunction(({id,value})=>document.getElementById(id)?.value===value,{id,value});
  };
  let release;const gate=new Promise(r=>release=r);
  if(!baseline)await context.route('**/write.js',async route=>{await gate;try{await route.continue();}catch{}});
  const download=async(format,name)=>{
   await page.locator(`[name=format][value="${format}"]`).check();
   for(const checkbox of await page.locator('#check-list input[type=checkbox]').all())await checkbox.check();
   await page.locator('#export:not([disabled])').waitFor({timeout:120000});
   const waiting=page.waitForEvent('download',{timeout:120000});await click('#export');const file=await waiting;await file.saveAs(resolve(folder,name));assert.equal(await file.failure(),null);
  };
  try{
   await page.goto(server.url,{waitUntil:'commit'});
   await page.locator('#title').fill(title);result.readyAtFirstInput=await page.evaluate(()=>!!window.writerReady);
   await page.locator('#recipient').fill(recipient);await page.locator('[data-panel="0"] summary').click();await page.locator('#reference').fill(reference);
   await click('[data-next="1"]');await page.locator('#body').fill(body);await page.locator('#signature').fill('综合办公室');
   await click('[data-back="0"]');await expectFields({title,recipient,reference,body});check('next and back preserve all entered content',true);
   await click('[data-next="1"]');
   if(await page.locator('#save-document').count())await click('#save-document');else await page.keyboard.press('Control+s');
   if(baseline){
    await click('[data-next="2"]');await page.waitForFunction(()=>document.getElementById('global-error').textContent.includes('预览组件加载失败'),{},{timeout:120000});
    result.visibleError=await page.locator('#global-error').textContent();result.previewVisible=await page.locator('#pdf-pages canvas').count()>0;result.passed=false;
    check('baseline reproduces real delivery MIME rejection',result.resources.some(r=>r.type?.startsWith('text/plain'))&&!result.previewVisible);
   }else{
    check('typed and saved before application startup',result.readyAtFirstInput===false);
    await page.reload({waitUntil:'commit'});await expectFields({title,recipient,reference,body,signature:'综合办公室'});check('refresh before startup restores the complete draft',true);
    await page.goBack({waitUntil:'commit'});await expectFields({title,recipient,reference,body});
    await page.goForward({waitUntil:'commit'});await expectFields({body});check('browser back and forward preserve the document',true);
    await click('#save-document');
    check('save before startup is durable',await page.locator('#save-status').textContent()==='已保存到此浏览器');
    await page.close();page=await context.newPage();page.setDefaultTimeout(20000);
    await page.goto(server.url,{waitUntil:'commit'});await expectFields({title,recipient,reference,body,signature:'综合办公室'});
    check('close tab and reopen before startup retains the complete draft',await page.evaluate(()=>!window.writerReady));
    await click('[data-next="2"]');release();
    await page.locator('#pdf-pages canvas').waitFor({timeout:120000});
    await context.unroute('**/write.js');
    check('real PDF preview is visible',await page.locator('#pdf-pages canvas').evaluate(el=>el.width>500));
    check('production module responses are JavaScript',result.resources.length>0&&result.resources.every(r=>r.status===200&&/javascript/.test(r.type||'')));
    await page.screenshot({path:resolve(folder,'preview.png'),fullPage:true});
    await click('#draft-menu');const saved=page.waitForEvent('download');await click('#save-draft');const draftFile=await saved;await draftFile.saveAs(resolve(folder,'saved.gongwen.json'));await click('[data-close="draft-dialog"]');
    const draft=JSON.parse(await readFile(resolve(folder,'saved.gongwen.json'),'utf8'));check('saved draft contains exact input',draft.fields.body===body&&draft.fields.reference===reference);
    await download('docx','document.docx');await download('pdf','document.pdf');await download('txt','document.txt');check('Word PDF and text actually downloaded',true);
    await click('[data-back="1"]');const latest=body+'\n刷新前新增的一段，必须保存到最终文件。';await page.locator('#body').fill(latest);await click('#save-document');
    result.cacheBeforeRefresh=await page.evaluate(async()=>{const response=await caches.match(new URL('./',location.href));return {redirected:response?.redirected,url:response?.url,save:document.getElementById('save-status').textContent};});
    check('cached entry is a real page, not a redirected response',result.cacheBeforeRefresh.redirected===false);
    await page.reload({waitUntil:'commit'});await expectFields({title,reference,body:latest});check('refresh during a preview update keeps the newest text',true);
    await click('[data-next="2"]');await page.locator('#pdf-pages canvas').waitFor({timeout:120000});await download('pdf','latest.pdf');await download('txt','latest.txt');
    check('export after refresh includes newest text',(await readFile(resolve(folder,'latest.txt'),'utf8')).includes(latest));
    await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>navigator.serviceWorker.controller?.state==='activated');await context.setOffline(true);await page.reload({waitUntil:'commit'});await expectFields({body:latest});
    await page.locator('#pdf-pages canvas').waitFor({timeout:120000});await download('pdf','offline.pdf');check('offline refresh still previews and exports',true);await context.setOffline(false);
    check('no generic preview-load failure in the journey',!result.consoleErrors.some(s=>/MIME|Failed to load module/.test(s)));
    check('no missing delivered resources',result.httpErrors.length===0);
    result.passed=true;
   }
  }catch(error){result.error=error.stack;try{result.visibleError=await page.evaluate(()=>document.getElementById('global-error')?.textContent||'');await page.screenshot({path:resolve(folder,'failure.png'),fullPage:true});}catch{}console.error(profile.id+': '+error.message);}
  finally{release();await context.close();await browser.close();}
  results.push(result);await writeFile(resolve(out,baseline?'baseline-live.json':process.env.FIRST_USE_RESULT||'journey.json'),JSON.stringify(results,null,2));
 }
}finally{await server.close();}
console.log(JSON.stringify(results.map(r=>({profile:r.profile,passed:r.passed,checks:r.checks.length,resources:r.resources})),null,2));
if(!baseline&&results.some(r=>!r.passed))process.exitCode=1;
