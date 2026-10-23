import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {startWebServer} from './browser-tests/server.mjs';
import {samples,structureFields as input} from './fixtures/writer-structure.mjs';
const require=createRequire(new URL('./browser-tests/package.json',import.meta.url));
const {chromium,firefox,webkit}=require('playwright');
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'build/qa/ceo-003'),baseline=process.argv.includes('--baseline');await mkdir(out,{recursive:true});
const server=await startWebServer(resolve(root,process.env.WRITER_WEB_ROOT||'build/qa/ceo-003-web'));
const profiles=[{id:'chrome',engine:chromium,channel:'chrome'},{id:'firefox',engine:firefox},{id:'webkit',engine:webkit}].filter(p=>baseline?p.id==='chrome':!process.env.STRUCTURE_PROFILE||process.env.STRUCTURE_PROFILE.split(',').includes(p.id));
const results=[];
try{
 for(const profile of profiles){
  const folder=resolve(out,profile.id+(baseline?'-baseline':''));await mkdir(folder,{recursive:true});
  const browser=await profile.engine.launch({headless:true,...(profile.channel?{channel:profile.channel}:{}),env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',http_proxy:'',https_proxy:'',all_proxy:'',NO_PROXY:'127.0.0.1,localhost'},...(profile.engine===firefox?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',timezoneId:'Asia/Shanghai',acceptDownloads:true});
  const page=await context.newPage();page.setDefaultTimeout(30000);let advanced;
  const result={profile:profile.id,version:browser.version(),baseline,checks:[],errors:[],passed:false};
  const check=(name,value)=>{assert.ok(value,name);result.checks.push(name);console.log(profile.id+': '+name);};
  const monitor=p=>p.on('pageerror',e=>result.errors.push(e.message));monitor(page);
  const download=async(p,selector,name)=>{const waiting=p.waitForEvent('download',{timeout:120000});await p.locator(selector).click();const file=await waiting;assert.equal(await file.failure(),null);await file.saveAs(resolve(folder,name));};
  try{
    await page.goto(server.url);await page.waitForFunction(()=>window.writerReady===true);
    await page.locator('#title').fill(input.title);await page.locator('[data-next="1"]').click();for(const name of ['body','signature','date'])await page.locator('#'+name).fill(input[name]);
    const model=await page.evaluate(async()=>{
      const {WriterEngine}=await import('./write-engine.js'),{blank,fieldsForEngine,applySignature}=await import('./write-model.js');
      const fields={...blank(),...Object.fromEntries(['title','body','signature','date'].map(name=>[name,document.getElementById(name).value]))};
      const engine=new WriterEngine();try{return applySignature(await engine.call('BuildDocument',fieldsForEngine(fields)),fields);}finally{engine.reset();}
    });
    const modelSample=name=>model.blocks.find(block=>block.paragraph?.text===samples[name])?.paragraph;
    result.recognition=Object.fromEntries(Object.keys(samples).map(name=>[name,modelSample(name)]));
    await writeFile(resolve(folder,'model.json'),JSON.stringify({fields:input,model},null,2));
    check('all source paragraphs including copied whitespace and clause numbering are unchanged',Object.keys(samples).every(name=>modelSample(name)?.text===samples[name]));
    if(baseline){check('baseline reproduces long clause as heading',modelSample('article').role==='heading');check('baseline reproduces leading-space title as body',modelSample('leading').role==='body');}
    else{
      check('short independent title remains a title',modelSample('short').role==='heading'&&modelSample('short').font==='黑体');
      check('long article is body typography without heading keep-with-next',modelSample('article').role==='article'&&modelSample('article').font==='仿宋'&&!modelSample('article').keepNext);
      check('copied leading spaces do not hide a numbered title',modelSample('leading').role==='heading'&&modelSample('leading').font==='黑体');
    }
    await page.locator('[data-next="2"]').click();await page.waitForFunction(()=>document.getElementById('preview-status').textContent.startsWith('已更新'),{},{timeout:120000});
    for(const box of await page.locator('.review-issue input[type=checkbox]').all())await box.check();
    for(const format of ['docx','pdf']){await page.locator(`[name=format][value=${format}]`).check();await page.locator('#export:not([disabled])').waitFor();await download(page,'#export',(baseline?'baseline.':'auto.')+format);}
    check('actual Word and PDF are downloaded for source and style inspection',true);
    if(!baseline){
      await page.locator('[data-step="1"]').click();await page.locator('#table-help summary').click();
      check('correction path explains paragraph type without font or line settings',(await page.locator('#table-help').innerText()).includes('段落'));
      await download(page,'#table-copy','original.gongwen.json');await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
      const popup=context.waitForEvent('page');await page.locator('#table-advanced').click();advanced=await popup;monitor(advanced);await advanced.waitForFunction(()=>window.appReady===true,{},{timeout:120000});
      const choosing=advanced.waitForEvent('filechooser');await advanced.locator('#import-writer-draft').click();await (await choosing).setFiles(resolve(folder,'original.gongwen.json'));
      await advanced.locator('#workspace:not([hidden])').waitFor({timeout:120000});await advanced.locator('#edit-tab').click();
      let target;for(const node of await advanced.locator('#blocks-editor textarea').all())if(await node.inputValue()===samples.ambiguous)target=node;
      assert.ok(target);await target.focus();await advanced.locator('#paragraph-role').selectOption('body');
      await advanced.waitForFunction(text=>[...document.querySelectorAll('#blocks-editor textarea')].some(node=>node.value===text&&node.closest('label')?.querySelector('span')?.dataset.baseLabel.startsWith('正文')),samples.ambiguous);
      await advanced.waitForFunction(()=>document.getElementById('save-state').textContent==='已保存到此浏览器');
      const work=await advanced.evaluate(async()=>{const {createBrowserAPI}=await import('./browser-api.js');return createBrowserAPI().GetWorkspace();});
      const corrected=work.document.blocks.find(block=>block.paragraph?.text===samples.ambiguous)?.paragraph;
      check('author changes a numbered paragraph to body while preserving exact text and number',corrected?.role==='body'&&corrected.font==='仿宋'&&corrected.text===samples.ambiguous&&!corrected.keepNext);
      await writeFile(resolve(folder,'corrected-model.json'),JSON.stringify(work.document,null,2));
      for(const button of await advanced.getByRole('button',{name:'已核对，保留',exact:true}).all())await button.click();
      for(const format of ['docx','pdf']){await advanced.locator('#output-format').selectOption(format);if(format==='pdf'&&await advanced.locator('#font-notice').isVisible())await advanced.locator('#font-ack').check();await advanced.locator('#export-open:not([disabled])').waitFor({timeout:120000});await download(advanced,'#export-open','corrected.'+format);}
      check('corrected Word and PDF really export without retyping or changing prose',true);
      await advanced.reload();await advanced.waitForFunction(()=>window.appReady===true,{},{timeout:120000});
      const restored=await advanced.evaluate(async()=>{const {createBrowserAPI}=await import('./browser-api.js');return createBrowserAPI().GetWorkspace();});
      check('manual paragraph intent survives reopening the advanced copy',restored.document.blocks.some(block=>block.paragraph?.text===samples.ambiguous&&block.paragraph.role==='body'));
      const original=await page.evaluate(()=>JSON.parse(localStorage.getItem('gongwen-writer-v1')));
      check('original guided source including whitespace and clause numbers remains recoverable',original.fields.body===input.body);
      if(profile.id==='chrome')await advanced.screenshot({path:resolve(folder,'correction.png'),fullPage:true});
    }
    check('no browser runtime errors',result.errors.length===0);result.passed=true;
  }catch(error){result.error=error.stack;await (advanced||page).screenshot({path:resolve(folder,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
  finally{results.push(result);await writeFile(resolve(out,baseline?'baseline.json':'result.json'),JSON.stringify(results,null,2));await browser.close();}
 }
}finally{await server.close();}
