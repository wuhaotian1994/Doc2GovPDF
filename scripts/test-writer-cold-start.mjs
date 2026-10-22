import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {startWebServer} from './browser-tests/server.mjs';
const root=resolve(import.meta.dirname,'..'),require=createRequire(new URL('./browser-tests/package.json',import.meta.url)),{chromium}=require('playwright');
const baseline=process.argv.includes('--baseline'),out=resolve(root,'build/qa/cold-start');await mkdir(out,{recursive:true});
const server=await startWebServer(resolve(root,process.env.WRITER_WEB_ROOT||'build/qa/cold-start-web'));
const browser=await chromium.launch({headless:true,channel:'chrome',env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',NO_PROXY:'127.0.0.1,localhost'}});
const context=await browser.newContext({viewport:{width:1366,height:900},locale:'zh-CN',serviceWorkers:'block',acceptDownloads:true}),page=await context.newPage();page.setDefaultTimeout(30000);
const report={baseline,checks:[],errors:[],passed:false};page.on('pageerror',error=>report.errors.push(error.message));
let release;const downloading=new Promise(resolve=>release=resolve);
await context.route('**/document-engine.wasm',async route=>{await downloading;await route.continue();});
await context.addInitScript(()=>{const Native=Worker;window.coldStartFault={drop:false,dropped:0,terminations:0};window.Worker=class extends Native{postMessage(value,...args){if(coldStartFault.drop&&value?.request?.method==='PreviewDocument'){coldStartFault.drop=false;coldStartFault.dropped++;return;}return super.postMessage(value,...args);}terminate(){coldStartFault.terminations++;return super.terminate();}};});
const check=(name,value)=>{assert.ok(value,name);report.checks.push(name);console.log(name);};
const bodyEditor=async()=>await page.locator('#body').isVisible()?page.locator('#body'):page.locator('#content-blocks');
const fillBody=async value=>{const input=await bodyEditor();if(await page.locator('#body').isVisible())await input.fill(value);else{await input.click();await page.keyboard.press('Control+A');await page.keyboard.insertText(value);}};
const ready=()=>page.waitForFunction(()=>document.getElementById('preview-status').textContent.startsWith('已更新'),{},{timeout:30000});
try{
  await page.clock.install();await page.goto(server.url);await page.waitForFunction(()=>window.writerReady);
  await page.locator('#title').fill('慢速网络合成验证');await page.locator('[data-next="1"]').click();await fillBody('首次下载可继续填写，完成后正常预览。');
  await page.clock.runFor(1000);await page.clock.fastForward(31000);await page.clock.runFor(1000);report.coldState=await page.evaluate(()=>({fault:coldStartFault,status:document.getElementById('preview-status').textContent,error:document.getElementById('global-error').textContent}));
  if(baseline){check('baseline terminates a still-downloading engine at the rendering deadline',report.coldState.fault.terminations>0);}
  else{
    check('download longer than rendering deadline stays editable without a false failure',report.coldState.fault.terminations===0&&await page.locator('#global-error').isHidden()&&await (await bodyEditor()).isEditable()&&/准备/.test(await page.locator('#preview-status').innerText()));
    await page.clock.resume();release();await ready();check('delayed real engine completes and renders the PDF',await page.locator('#pdf-pages canvas').count()>0);
    await page.evaluate(()=>coldStartFault.drop=true);await fillBody('首次下载已完成，现在模拟排版处理不返回。');await page.waitForFunction(()=>coldStartFault.dropped===1);
    await page.clock.fastForward(31000);check('warm processing still has a bounded failure and stale export stays disabled',(await page.locator('#global-error').innerText()).includes('这次预览未完成')&&await (await bodyEditor()).isEditable()&&await page.locator('#export').isDisabled());
    await page.clock.resume();await page.locator('#refresh-preview').click();await ready();check('explicit retry recovers after a stalled processing request',await page.locator('#global-error').isHidden());
    await page.locator('[data-step="2"]').click();for(const box of await page.locator('.review-issue input[type=checkbox]').all())await box.check();await page.locator('[name=format][value=pdf]').check();await page.locator('#export:not([disabled])').waitFor();const waiting=page.waitForEvent('download');await page.locator('#export').click();const download=await waiting;await download.saveAs(resolve(out,'recovered.pdf'));assert.equal(await download.failure(),null);check('recovered preview exports an actual PDF',true);
    check('no runtime errors',report.errors.length===0);
  }
  report.passed=true;
}catch(error){report.error=error.stack;await page.screenshot({path:resolve(out,baseline?'baseline-failure.png':'failure.png')}).catch(()=>{});console.error(error.message);}
finally{release();await writeFile(resolve(out,baseline?'baseline.json':'result.json'),JSON.stringify(report,null,2));await browser.close();await server.close();}
if(!report.passed)process.exitCode=1;
