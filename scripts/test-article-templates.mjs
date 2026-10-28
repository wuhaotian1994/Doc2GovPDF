import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {articleTemplates,templateFields,hasTemplatePrompts} from '../web/write-templates.js';
import {blank,draft,validateDraft} from '../web/write-model.js';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname,resolve,sep} from 'node:path';
const defaults={...blank(),agency:'测试单位',recipient:'测试接收单位',signature:'测试署名',reference:'old',date:'2024-01-01'};
for(const template of articleTemplates){const fields=templateFields(defaults,template.id,'测试事项');assert.equal(fields.title,`关于测试事项的${template.name}`);assert.equal(fields.date,'');assert.equal(fields.reference,'');assert.equal(fields.agency,'测试单位');assert.ok(hasTemplatePrompts(fields.body));assert.equal(validateDraft(draft(fields,0)).fields.body,fields.body);}
assert.equal(defaults.reference,'old');assert.throws(()=>templateFields(defaults,'unknown','事项'));assert.throws(()=>templateFields(defaults,'request','  '));assert.equal(hasTemplatePrompts('这是已填写的内容。'),false);
const require=createRequire(new URL('./browser-tests/package.json',import.meta.url)),{chromium}=require('playwright');
const root=fileURLToPath(new URL('../dist/local-preview',import.meta.url));
const http=createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname,path=resolve(root,'.'+(pathname==='/'?'/index.html':decodeURIComponent(pathname)));if(!path.startsWith(root+sep)){res.writeHead(403);res.end();return;}const bytes=await readFile(path);res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf'})[extname(path)]||'application/octet-stream');res.end(bytes);}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
const server={url:`http://127.0.0.1:${http.address().port}`,close:()=>new Promise(resolve=>{http.closeAllConnections();http.close(resolve);})};
const browser=await chromium.launch({headless:true,channel:'msedge',env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',NO_PROXY:'127.0.0.1,localhost'}});
try{
 const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.url);await page.waitForFunction(()=>window.writerReady&&!document.querySelector('#template-open').disabled);
 await page.locator('#welcome-dialog').waitFor({state:'visible'});await page.keyboard.press('Escape');
 await page.locator('#template-open').click();await page.locator('#template-cancel').click();assert.equal(await page.locator('.article-card[data-article-id]').count(),0);
 for(const template of articleTemplates){
  await page.locator('#template-open').click();await page.locator(`[data-template="${template.id}"]`).click();
  await page.locator('#template-form [type=submit]').click();assert.ok((await page.locator('#template-message').textContent()).includes('事项'));
  await page.locator('#template-subject').fill('测试事项');await page.locator('#template-form [type=submit]').click();
  await page.locator('#template-dialog').waitFor({state:'hidden'});assert.equal(await page.locator('#title').inputValue(),`关于测试事项的${template.name}`);assert.equal(new URL(page.url()).hash,'#step-1');
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('gongwen-writer-v1')));assert.equal(saved.fields.body,template.body);assert.equal(saved.fields.signer,'');assert.equal(saved.fields.date,'');
  await page.locator('[data-step="2"]').click();assert.ok((await page.locator('#body-error').textContent()).includes('请填写'));assert.equal(await page.locator('[data-step="1"]').getAttribute('aria-current'),'step');
  await page.locator('#back-home').click();await page.locator('#template-open:not([disabled])').waitFor();
 }
 await page.reload();await page.waitForFunction(()=>window.writerReady&&!document.querySelector('#template-open').disabled);await page.locator('#welcome-dialog').waitFor({state:'visible'});await page.keyboard.press('Escape');
 assert.equal(await page.locator('.article-card[data-article-id]').count(),3);
 await page.getByRole('button',{name:/关于测试事项的请示/}).click();assert.equal(await page.locator('#title').inputValue(),'关于测试事项的请示');
 assert.deepEqual(errors,[]);console.log('PASS: three templates, validation, cancellation, old-draft preservation and reload');
}finally{await browser.close();await server.close();}
