import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {startWebServer} from './browser-tests/server.mjs';
const require=createRequire(new URL('./browser-tests/package.json',import.meta.url));
const {chromium,firefox,webkit}=require('playwright'),baseline=process.argv.includes('--baseline');
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'build/qa/ceo-review-recovery'),raw='街办发 [2026] 005号';await mkdir(out,{recursive:true});
const server=await startWebServer(resolve(root,baseline?'build/qa/ceo-review-baseline-web':'build/qa/ceo-review-web')),results=[];
for(const profile of [{id:'chrome',engine:chromium,channel:'chrome'},{id:'firefox',engine:firefox},{id:'webkit',engine:webkit}].filter(p=>(!baseline||p.id==='chrome')&&(!process.env.REVIEW_PROFILE||process.env.REVIEW_PROFILE===p.id))){
 const folder=resolve(out,profile.id+(baseline?'-baseline':''));await mkdir(folder,{recursive:true});
 const browser=await profile.engine.launch({headless:true,...(profile.channel?{channel:profile.channel}:{}),env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',http_proxy:'',https_proxy:'',all_proxy:'',NO_PROXY:'127.0.0.1,localhost'},...(profile.id==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',acceptDownloads:true});let page=await context.newPage();page.setDefaultTimeout(30000);
 const result={profile:profile.id,version:browser.version(),baseline,checks:[],errors:[],passed:false};const monitor=p=>p.on('pageerror',e=>result.errors.push(e.message));monitor(page);
 const check=(name,value)=>{assert.ok(value,name);result.checks.push(name);console.log(profile.id+': '+name);};
 const ready=async()=>{await page.waitForFunction(()=>window.writerReady===true);await page.waitForFunction(()=>document.getElementById('preview-status').textContent.startsWith('已更新'),{},{timeout:120000});};
 const finding=()=>page.locator('.review-issue[data-rule="reference.format"] input[type=checkbox]');
 const download=async(selector,name)=>{const waiting=page.waitForEvent('download',{timeout:120000});await page.locator(selector).click();const file=await waiting;assert.equal(await file.failure(),null);await file.saveAs(resolve(folder,name));};
 const returnReference=async()=>{await page.locator('[data-step="0"]').click();if(!await page.locator('#reference').isVisible())await page.locator('details:has(#reference) summary').click();};
 try{
  await page.goto(server.url);await page.waitForFunction(()=>window.writerReady);await page.locator('#title').fill('判断恢复合成测试稿');await page.locator('[data-next="1"]').click();await page.locator('#body').fill('此稿仅用于本地检查保存后的工作连续性。');await returnReference();await page.locator('#reference').fill(raw);await page.locator('#reference-keep').click();await page.locator('[data-step="2"]').click();await ready();check('explicit retention is applied to the current finding',await finding().isChecked());await page.locator('#save-document').click();
  await page.reload();await ready();
  if(baseline){check('baseline reproduces lost retention after save and reload',!await finding().isChecked()&&await page.locator('#export').isDisabled());result.passed=true;}
  else{
   check('save and reload restore the same original decision after current inspection',await finding().isChecked()&&await page.locator('#export').isEnabled());
   await returnReference();check('restored field help reflects the same retained decision',(await page.locator('#reference-keep').innerText()).includes('撤销保留'));await page.locator('#title').fill('判断恢复合成测试稿（无关标题修订）');await page.locator('[data-step="2"]').click();await ready();await page.reload();await ready();check('unrelated title edits retain judgment across another reload',await finding().isChecked());
   await page.close();page=await context.newPage();monitor(page);await page.goto(server.url);await ready();check('closing and reopening the original tab retains its decision',await finding().isChecked());
   for(const format of profile.id==='chrome'?['docx','pdf','txt']:['pdf']){await page.locator(`[name=format][value=${format}]`).check();await download('#export','restored.'+format);}await writeFile(resolve(folder,'restored.json'),JSON.stringify(await page.evaluate(()=>JSON.parse(localStorage.getItem('gongwen-writer-v1'))),null,2));
   await page.locator('#draft-menu').click();await download('#save-draft','retained.gongwen.json');await page.locator('[data-close="draft-dialog"]').first().click();
   await finding().uncheck();await page.reload();await ready();check('explicit uncheck stays revoked after reload',!await finding().isChecked());await finding().check();
   await returnReference();await page.locator('#reference').fill('街办发 [2026] 006号');await page.locator('[data-step="2"]').click();await ready();await page.reload();await ready();check('related sequence change remains unconfirmed after reload',!await finding().isChecked());
   await returnReference();await page.locator('#reference').fill(raw);await page.locator('[data-step="2"]').click();await ready();check('editing then restoring old text does not revive its revoked decision',!await finding().isChecked());await finding().check();
   await page.locator('#draft-menu').click();await page.locator('#copy-current').click();await returnReference();await page.locator('#reference').fill(raw);await page.locator('[data-step="2"]').click();await ready();check('copying a new document does not inherit the original decision',!await finding().isChecked());
   await page.locator('#draft-menu').click();await page.locator('.recent-document').first().getByRole('button',{name:'继续编辑',exact:true}).click();await ready();check('continuing the archived original restores its own judgment',await finding().isChecked());
   await page.locator('#draft-menu').click();await page.locator('#load-draft').setInputFiles(resolve(folder,'retained.gongwen.json'));await page.locator('#confirm-replace').click();await ready();check('imported snapshot is a new local copy and does not inherit approval',!await finding().isChecked()&&(await page.locator('#reuse-status').innerText()).includes('重新核对'));
   await page.locator('[data-step="1"]').click();await page.locator('#body').fill('此稿仅用于本地检查保存后的工作连续性。\n设备重量为10kg，请按原始记录核对型号。');await page.locator('[data-step="2"]').click();await ready();
   const bodyReview=()=>page.locator('.review-issue[data-rule="number.unit-space"] input');await bodyReview().check();await finding().check();await page.locator('#save-document').click();await page.reload();await ready();check('independent body and reference judgments both recover',await bodyReview().isChecked()&&await finding().isChecked());
   await returnReference();await page.locator('#reference').fill('街办发 [2026] 009号');await page.locator('[data-step="2"]').click();await ready();await page.reload();await ready();check('revoking reference does not erase the saved unrelated body judgment',!await finding().isChecked()&&await bodyReview().isChecked());
   check('no browser runtime errors',result.errors.length===0);result.passed=true;
  }
 }catch(e){result.error=e.stack;await page.screenshot({path:resolve(folder,'failure.png'),fullPage:true}).catch(()=>{});throw e;}
 finally{results.push(result);await writeFile(resolve(out,baseline?'baseline.json':'result.json'),JSON.stringify(results,null,2));await browser.close();}
}
await server.close();
