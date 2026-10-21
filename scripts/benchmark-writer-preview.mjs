import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';import os from 'node:os';
import {startWebServer} from './browser-tests/server.mjs';import {postscriptParagraphs} from './fixtures/writer-postscript-notice.mjs';
const require=createRequire(new URL('./browser-tests/package.json',import.meta.url)),{chromium,firefox,webkit}=require('playwright');
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'build/qa/ceo-005'),variant=process.env.BENCH_VARIANT||'baseline';await mkdir(out,{recursive:true});
const server=await startWebServer(resolve(root,process.env.BENCH_WEB_ROOT||'build/qa/ceo-005-baseline-web'));
const suffixes=[...'甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉'];
const short='请各部门按照既定计划做好本季度资料整理，核对材料名称、记录和日期。原始记录应当完整保留，未经确认的内容不要补写。遇到不确定的信息请继续核实，并在交付前检查成品文字与输入是否一致，确保后续可以查阅和继续编辑。';
const rows=[];
const profiles=[{id:'chrome',engine:chromium,channel:'chrome'},{id:'firefox',engine:firefox},{id:'webkit',engine:webkit}].filter(p=>(process.env.BENCH_PROFILE||'chrome').split(',').includes(p.id));
try{for(const profile of profiles){
 const browser=await profile.engine.launch({headless:true,...(profile.channel?{channel:profile.channel}:{}),env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',http_proxy:'',https_proxy:'',all_proxy:'',NO_PROXY:'127.0.0.1,localhost'},...(profile.id==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
 try{for(let cold=0;cold<3;cold++){
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'});
  await context.addInitScript(()=>{
   const B=window.previewBench={jobs:[],paints:[],ready:[],lastToken:''};
   const token=text=>text.match(/本地速度核对(.)/u)?.[1]||'';
   const Native=window.Worker;
   window.Worker=class extends Native{
    constructor(...args){super(...args);this.requests=new Map();this.addEventListener('message',({data})=>{const job=this.requests.get(data.id);if(!job)return;this.requests.delete(data.id);B.jobs.push({...job,end:performance.now()});if(job.method==='PreviewDocument'&&!data.error)B.lastToken=job.token;});}
    postMessage(message,...rest){if(message.request){const model=message.request.args?.[0];this.requests.set(message.id,{method:message.request.method,start:performance.now(),token:token(model?.blocks?.map(b=>b.paragraph?.text||'').join('\n')||'')});}return super.postMessage(message,...rest);}
   };
   addEventListener('DOMContentLoaded',()=>{new MutationObserver(records=>{
    for(const record of records)if(record.target.id==='pdf-pages'&&document.querySelector('#pdf-pages canvas')){const captured=B.lastToken;requestAnimationFrame(()=>requestAnimationFrame(()=>B.paints.push({time:performance.now(),token:captured})));}
    if(document.getElementById('preview-status').textContent.startsWith('已更新'))B.ready.push({time:performance.now(),token:B.lastToken,status:document.getElementById('preview-status').textContent});
   }).observe(document.body,{subtree:true,childList:true,characterData:true});});
  });
  const page=await context.newPage();page.setDefaultTimeout(120000);
  async function waitSample(start,token){await page.waitForFunction(({start,token})=>window.previewBench.paints.some(p=>p.time>=start&&p.token===token)&&window.previewBench.ready.some(p=>p.time>=start&&p.token===token),{start,token},{timeout:120000});return page.evaluate(({start,token})=>{const B=window.previewBench,paint=B.paints.find(p=>p.time>=start&&p.token===token),ready=B.ready.find(p=>p.time>=start&&p.token===token);return {paintAt:paint.time,readyAt:ready.time,status:ready.status,jobs:B.jobs.filter(j=>j.start>=start).map(j=>({method:j.method,ms:j.end-j.start}))};},{start,token});}
  try{
   await page.goto(server.url);await page.waitForFunction(()=>window.writerReady===true);const boot=await page.evaluate(()=>performance.now());
   const start=await page.evaluate(()=>performance.now());await page.locator('#title').fill('本地预览响应合成稿');await page.locator('[data-next="1"]').click();await page.locator('#body').fill(short+'本地速度核对甲');const inputEnd=await page.evaluate(()=>performance.now());const first=await waitSample(start,'甲');rows.push({profile:profile.id,version:browser.version(),kind:'fresh-context',sample:cold,navToInteractiveMS:boot,inputSequenceMS:inputEnd-start,visibleAfterInputMS:first.paintAt-inputEnd,readyAfterInputMS:first.readyAt-inputEnd,...first});
   if(cold===0){
    await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>window.writerReady===true);const cachedBoot=await page.evaluate(()=>performance.now());const restored=await waitSample(0,'甲');rows.push({profile:profile.id,kind:'cached-reopen',sample:0,navToInteractiveMS:cachedBoot,visibleFromNavigationMS:restored.paintAt,readyFromNavigationMS:restored.readyAt,...restored});
    await page.locator('[data-step="1"]').click();
    for(const [kind,base,count] of [['warm-short',short,20],['warm-long',postscriptParagraphs.slice(2,-4).join('\n'),8]]){
     for(let index=0;index<count;index++){
      const marker=suffixes[(index+1)%suffixes.length],text=base+'本地速度核对'+marker;
      const timing=await page.evaluate(text=>{const node=document.getElementById('body'),start=performance.now();node.value=text;node.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text.slice(-7)}));return {start,end:performance.now()};},text);
      const measured=await waitSample(timing.start,marker);rows.push({profile:profile.id,kind,sample:index,characters:text.length,inputHandlerMS:timing.end-timing.start,visibleAfterInputMS:measured.paintAt-timing.end,readyAfterInputMS:measured.readyAt-timing.end,...measured});
     }
    }
   }
  }finally{await context.close();}
 }}finally{await browser.close();}
}}finally{await server.close();await writeFile(resolve(out,variant+'.json'),JSON.stringify({variant,environment:{platform:os.platform(),release:os.release(),cpu:os.cpus()[0]?.model,logicalCPUs:os.cpus().length},definition:'Input handler = synchronous synthetic input event. Visible = canvas committed plus two animation frames. Ready = full PDF layout and inspection reported updated, excluding human review time.',rows},null,2));}
for(const kind of ['fresh-context','cached-reopen','warm-short','warm-long']){const samples=rows.filter(r=>r.kind===kind),values=samples.map(r=>r.visibleAfterInputMS??r.visibleFromNavigationMS).sort((a,b)=>a-b);console.log(JSON.stringify({kind,n:values.length,p50:values[Math.floor(values.length*.5)],p95:values[Math.min(values.length-1,Math.ceil(values.length*.95)-1)],max:values.at(-1)}));}
