import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const root=process.cwd(),require=createRequire(resolve(root,'scripts/browser-tests/package.json')),{chromium}=require('playwright');
const browser=await chromium.launch({headless:true,channel:'chrome',env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',NO_PROXY:'127.0.0.1,localhost'}});
try{
 const context=await browser.newContext({viewport:{width:1280,height:720},locale:'zh-CN',serviceWorkers:'block'}),page=await context.newPage();
 await page.goto('http://127.0.0.1:4173');await page.waitForFunction(()=>window.writerReady);
 await page.locator('#load-draft').setInputFiles(root+'/build/qa/continuous/service/clinic.draft.json');await page.waitForFunction(()=>document.querySelector('#replace-dialog[open]')||document.getElementById('title').value.includes('虚构'));if(await page.locator('#replace-dialog').isVisible())await page.locator('#confirm-replace').click();await page.waitForFunction(()=>document.getElementById('preview-status').textContent.startsWith('已更新'),{},{timeout:120000});
 await page.locator('[data-step="1"]').click();await page.locator('#content-blocks [data-kind=paragraph]').first().click();await page.locator('.form-scroll').evaluate(n=>n.scrollTop=0);await page.screenshot({path:root+'/docs/evidence/continuous-writing/03-continuous-notice.png'});
 await page.locator('#load-draft').setInputFiles(root+'/build/qa/continuous/service/native.gongwen-word.json');await page.waitForSelector('body.word-mode');await page.waitForFunction(()=>!document.getElementById('editable').disabled);await page.waitForFunction(()=>document.getElementById('preview-status').textContent.startsWith('已更新'),{},{timeout:120000});await page.locator('[data-step="1"]').click();await page.locator('#word-paragraph-p43').click();await page.screenshot({path:root+'/docs/evidence/continuous-writing/04-native-ready.png'});
 console.log('Captured steady actual service notice and native Word in isolated context');
}finally{await browser.close();}
