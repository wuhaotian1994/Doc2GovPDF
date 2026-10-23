import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {startWebServer} from './browser-tests/server.mjs';
const require=createRequire(new URL('./browser-tests/package.json',import.meta.url));
const {chromium,firefox,webkit}=require('playwright');
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'build/qa/ceo-002');await mkdir(out,{recursive:true});
const baseline=process.argv.includes('--baseline');
const server=await startWebServer(resolve(root,process.env.WRITER_WEB_ROOT||'build/qa/ceo-001-web'));
const profiles=[{id:'chrome',engine:chromium,channel:'chrome'},{id:'firefox',engine:firefox},{id:'webkit',engine:webkit}].filter(p=>baseline?p.id==='chrome':!process.env.TABLE_PROFILE||process.env.TABLE_PROFILE.split(',').includes(p.id));
const input={title:'关于资料归档的工作安排',body:'请各部门按下表安排资料归档工作。\n请保留原始记录，并按时提交。',signature:'综合办公室',date:'2026-10-21'};
const table='事项\t责任部门\t时限\n整理资料\t办公室\t10月22日\n核对归档\t档案室\t10月23日';
const results=[];
try{
 for(const profile of profiles){
  const folder=resolve(out,profile.id+(baseline?'-baseline':''));await mkdir(folder,{recursive:true});
  const browser=await profile.engine.launch({headless:true,...(profile.channel?{channel:profile.channel}:{}),env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',http_proxy:'',https_proxy:'',all_proxy:'',NO_PROXY:'127.0.0.1,localhost'},...(profile.engine===firefox?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',timezoneId:'Asia/Shanghai',acceptDownloads:true});
  const page=await context.newPage();page.setDefaultTimeout(30000);let advanced;
  const result={profile:profile.id,version:browser.version(),baseline,checks:[],errors:[],passed:false};
  const check=(name,value)=>{assert.ok(value,name);result.checks.push(name);console.log(profile.id+': '+name);};
  const monitor=p=>p.on('pageerror',error=>result.errors.push(error.message));monitor(page);
  const download=async(p,selector,name)=>{const waiting=p.waitForEvent('download',{timeout:120000});await p.locator(selector).click();const file=await waiting;assert.equal(await file.failure(),null);await file.saveAs(resolve(folder,name));};
  try{
    await page.goto(server.url);await page.waitForFunction(()=>window.writerReady===true);
    await page.locator('#title').fill(input.title);await page.locator('[data-next="1"]').click();
    for(const name of ['body','signature','date'])await page.locator('#'+name).fill(input[name]);
    const original=await page.evaluate(()=>localStorage.getItem('gongwen-writer-v1'));
    result.tableEntryVisible=await page.getByText(/需要.*表格/).count()>0;
    let selected;
    if(baseline){
      await page.locator('[data-next="2"]').click();await page.waitForFunction(()=>document.getElementById('preview-status').textContent.startsWith('已更新'),{},{timeout:120000});
      await page.locator('[name=format][value=docx]').check();await page.locator('#export:not([disabled])').waitFor();
      await download(page,'#export','current.docx');check('current writing exports to an actual Word file',true);selected='current.docx';
      advanced=await context.newPage();await advanced.goto(server.url+'/advanced.html');
    }else{
      check('table continuation is discoverable while writing',result.tableEntryVisible);
      await page.locator('#table-help summary').click();
      check('one-way copy and retained original are explained before proceeding',(await page.locator('#table-help').innerText()).includes('不会自动同步'));
      if(profile.id==='chrome')await page.screenshot({path:resolve(folder,'writing-table-help.png'),fullPage:true});
      await download(page,'#table-copy','current.gongwen.json');selected='current.gongwen.json';
      await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
      await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
      const popup=context.waitForEvent('page');await page.locator('#table-advanced').click();advanced=await popup;
    }
    monitor(advanced);await advanced.waitForFunction(()=>window.appReady===true||!document.getElementById('error')?.hidden,{},{timeout:120000});
    check('advanced destination loads under the actual offline cache',await advanced.evaluate(()=>window.appReady===true));
    if(!baseline)check('destination explains how to add a table',await advanced.locator('#writer-handoff').isVisible()&&(await advanced.locator('#writer-handoff').innerText()).includes('独立副本'));
    if(!baseline&&profile.id==='chrome')await advanced.screenshot({path:resolve(folder,'handoff.png'),fullPage:true});
    const chooser=advanced.waitForEvent('filechooser');await advanced.locator(baseline?'#import-home':'#import-writer-draft').click();await (await chooser).setFiles(resolve(folder,selected));
    await advanced.locator('#workspace:not([hidden])').waitFor({timeout:120000});await advanced.locator('#edit-tab').click();
    const values=await advanced.locator('#blocks-editor textarea').evaluateAll(nodes=>nodes.map(n=>n.value));
    check('import preserves existing title, every body paragraph and signature without retyping',[input.title,...input.body.split('\n'),input.signature].every(value=>values.includes(value)));
    if(baseline){check('imported Word source protection prevents adding a table',!await advanced.locator('#add-table').isVisible());result.pathCompletes=false;result.blocker='DOCX source mode hides Add Table';result.passed=true;continue;}
    const before=await advanced.locator('#blocks-editor textarea').count();
    for(const el of await advanced.locator('#blocks-editor textarea').all())if(await el.inputValue()===input.body.split('\n').at(-1))await el.focus();
    await advanced.locator('#add-table').click();await advanced.locator('#table-input').fill(table);await advanced.locator('#table-cancel').click();
    check('cancel adding a table retains the original document',await advanced.locator('#blocks-editor textarea').count()===before);
    await advanced.locator('#add-table').click();await advanced.locator('#table-caption').fill('资料归档工作安排');await advanced.locator('#table-input').fill(table);await advanced.locator('#table-form button[type=submit],#table-form button.primary').click();
    await advanced.waitForFunction(()=>document.getElementById('blocks-editor').querySelectorAll('textarea').length>6);
    await advanced.waitForFunction(()=>document.getElementById('save-state').textContent==='已保存到此浏览器');
    check('table is added in the same advanced document',await advanced.locator('#blocks-editor textarea').count()===before+10);
    await advanced.locator('#undo').click();
    check('adding the table can be undone without losing authored content',await advanced.locator('#blocks-editor textarea').count()===before);
    await advanced.locator('#add-table').click();await advanced.locator('#table-caption').fill('资料归档工作安排');await advanced.locator('#table-input').fill(table);await advanced.locator('#table-form button.primary').click();
    await advanced.waitForFunction(()=>document.getElementById('save-state').textContent==='已保存到此浏览器');
    result.advancedHeading=await advanced.locator('#check-heading').innerText();result.advancedError=await advanced.locator('#error-text').innerText();
    for(const button of await advanced.getByRole('button',{name:'已核对，保留',exact:true}).all())await button.click();
    await advanced.locator('#output-format').selectOption('docx');await advanced.locator('#export-open:not([disabled])').waitFor({timeout:120000});await download(advanced,'#export-open','with-table.docx');check('Word with added table really downloads',true);
    await advanced.locator('#output-format').selectOption('pdf');if(await advanced.locator('#font-notice').isVisible())await advanced.locator('#font-ack').check();
    await advanced.locator('#export-open:not([disabled])').waitFor({timeout:120000});await download(advanced,'#export-open','with-table.pdf');check('PDF with added table really downloads',true);
    // A malformed or cancelled import must not replace the current table work.
    let choose=advanced.waitForEvent('filechooser');await advanced.locator('#import-work').click();await (await choose).setFiles({name:'invalid.gongwen.json',mimeType:'application/json',buffer:Buffer.from('{broken')});
    await advanced.waitForFunction(()=>!document.getElementById('error').hidden);
    check('invalid draft leaves the existing advanced document unchanged',await advanced.locator('#blocks-editor textarea').count()===before+10);
    await advanced.locator('#dismiss-error').click();
    choose=advanced.waitForEvent('filechooser');await advanced.locator('#import-work').click();await (await choose).setFiles(resolve(folder,'current.gongwen.json'));
    await advanced.locator('#replace-dialog[open]').waitFor();await advanced.locator('#replace-dialog button[value=cancel]').click();
    check('cancelling replacement preserves the existing table and document',await advanced.locator('#blocks-editor textarea').count()===before+10);
    await advanced.reload();await advanced.waitForFunction(()=>window.appReady===true,{},{timeout:120000});
    if(!await advanced.locator('#edit-panel').isVisible())await advanced.locator('#edit-tab').click();
    check('advanced draft and table recover after refresh',await advanced.locator('#blocks-editor textarea').count()===before+10);
    const current=JSON.parse(await page.evaluate(()=>localStorage.getItem('gongwen-writer-v1')));
    check('the original guided draft remains recoverable and unchanged',JSON.stringify(current.fields)===JSON.stringify(JSON.parse(original).fields));
    check('no browser runtime error in the journey',result.errors.length===0);
    if(profile.id==='chrome')await advanced.screenshot({path:resolve(folder,'advanced-table.png'),fullPage:true});
    result.passed=true;
  }catch(error){result.error=error.stack;await (advanced||page).screenshot({path:resolve(folder,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
  finally{results.push(result);await writeFile(resolve(out,baseline?'baseline.json':'result.json'),JSON.stringify(results,null,2));await browser.close();}
 }
}finally{await server.close();}
