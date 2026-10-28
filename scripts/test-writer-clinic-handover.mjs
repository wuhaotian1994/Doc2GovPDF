import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..'),require=createRequire(new URL('./browser-tests/package.json',import.meta.url)),{chromium}=require('playwright');
const out=resolve(root,'build/qa/clinic-handover');await mkdir(out,{recursive:true});
const material=`关于做好门诊辅助岗位值班交接的通知（虚构模拟）
各科室：
本材料仅用于产品体验，机构、岗位安排和日期均为虚构，不用于实际医疗工作。
一、工作安排
请按附件核对辅助岗位轮值安排，交接时逐项确认未办事项。
二、交接要求
临时调整须经办公室确认；原定人员未到岗前，不得仅凭此表认定交接完成。
模拟镇卫生院办公室
2026年10月22日
附件：门诊辅助岗位值班安排（模拟）
日期\t时段\t值班岗位\t交接事项
2026-10-23\t08:00—12:00\t导诊岗（虚构）\t交接未办事项记录
2026-10-23\t12:00—16:00\t后勤岗（虚构）\t核对物资登记
说明：本表仅为模拟；岗位名称不代表真实人员，临时调整以办公室核对结果为准。`;
await writeFile(resolve(out,'source.txt'),material,'utf8');
const browser=await chromium.launch({channel:'chrome',headless:true,env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',NO_PROXY:'127.0.0.1,localhost'}}),context=await browser.newContext({viewport:{width:1280,height:720},locale:'zh-CN',acceptDownloads:true,serviceWorkers:'block'});let page=await context.newPage();
const report={scenario:'基层卫生院办公室编制辅助岗位值班交接通知（虚构任务）',method:'实施者知情的岗位任务走查，非无历史用户盲测；正常UI填写，无草稿/存储注入',url:'http://127.0.0.1:4173',browser:browser.version(),viewport:{width:1280,height:720},checks:[],screenshots:[],pageErrors:[],passed:false};
const watch=p=>{p.setDefaultTimeout(30000);p.on('pageerror',e=>report.pageErrors.push(e.message));};watch(page);
const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('gongwen-writer-v1'))),ready=()=>page.waitForFunction(()=>document.getElementById('preview-status').textContent.startsWith('已更新'),{},{timeout:120000}),check=(label,value)=>{assert.ok(value,label);report.checks.push(label);console.log(label);};
const shot=async name=>{await page.screenshot({path:resolve(out,name+'.png')});report.screenshots.push(name+'.png');};
const download=async(selector,name)=>{const wait=page.waitForEvent('download',{timeout:120000});await page.locator(selector).click();const file=await wait;assert.equal(await file.failure(),null);await file.saveAs(resolve(out,name));};
const editor=()=>page.locator('#postscript-content-workspace');
try{
 await page.goto(report.url);await page.waitForFunction(()=>window.writerReady);await page.locator('#material-entry summary').click();await page.locator('#pendingMaterial').fill(material);await page.locator('#material-open').click();await shot('01-material-options');
 for(const field of ['title','recipient','signature','date','postscript'])await page.locator(`[data-material-field=${field}]`).check();await page.locator('#material-apply').click();await page.waitForFunction(()=>!document.getElementById('material-dialog').open);await page.locator('[data-step="1"]').click();
 const original=await saved(),id=original.id;check('整篇整理保留虚构原始材料、署名日期及表后例外说明',original.fields.sourceMaterial===material&&original.fields.signature==='模拟镇卫生院办公室'&&original.fields.date==='2026-10-22'&&original.fields.postscript.endsWith(material.split('\n').at(-1)));
 await page.locator('#postscript-content-edit').click();let header;for(const input of await editor().locator('textarea[data-kind=paragraph]').all()){if((await input.inputValue()).startsWith('日期\t')){header=input;break;}}assert.ok(header);await header.focus();await page.locator('#postscript-content-add-table').click();check('原有排班内容明确转为3行4列，未吞掉表后说明',await page.locator('#postscript-content-table-convert').isChecked()&&await page.locator('#postscript-content-table-rows').inputValue()==='3'&&await page.locator('#postscript-content-table-columns').inputValue()==='4'&&!(await page.locator('#postscript-content-table-source').inputValue()).includes('说明：'));await page.locator('#postscript-content-table-confirm').click();await ready();await shot('02-original-table');
 const initial=await saved();await writeFile(resolve(out,'initial-draft.json'),JSON.stringify(initial,null,2));await page.locator('#save-document').click();await page.close();page=await context.newPage();watch(page);await page.goto(report.url);await page.waitForFunction(()=>window.writerReady);await ready();await page.locator('[data-step="1"]').click();check('次日式关页重开保持同一稿和原排班，无草稿文件搬运',(await saved()).id===id&&JSON.stringify((await saved()).content)===JSON.stringify(initial.content));
 const grid=editor().locator('.content-table');await grid.locator('tr').last().locator('textarea').first().focus();await editor().getByRole('button',{name:'下方加一行',exact:true}).click();const added=['2026-10-24','08:00—12:00','导诊岗（虚构）','交接待办登记及临时调整记录'];for(let i=0;i<4;i++)await grid.locator('tr').last().locator('textarea').nth(i).fill(added[i]);await grid.locator('tr').nth(1).locator('textarea').nth(3).fill('交接未办事项记录；现场核对后签认');
 await page.locator('[data-step="0"]').click();await page.locator('#title').fill(initial.fields.title+'（补充轮值）');await page.locator('#save-document').click();await page.reload();await page.waitForFunction(()=>window.writerReady);await ready();const final=await saved(),table=final.content.postscript.blocks.find(b=>b.type==='table');check('补行与既有单元格修改和标题变更同时保存',final.id===id&&table.rows.length===4&&JSON.stringify(table.rows.at(-1).cells.map(c=>c.text))===JSON.stringify(added)&&table.rows[1].cells[3].text==='交接未办事项记录；现场核对后签认');check('补表不改原正文、签名、日期、原材料和尾部例外说明',final.fields.body===initial.fields.body&&final.fields.signature===initial.fields.signature&&final.fields.date===initial.fields.date&&final.fields.sourceMaterial===material&&final.content.postscript.blocks.at(-1).text===material.split('\n').at(-1));
 await page.locator('[data-step="1"]').click();await grid.locator('tr').last().locator('textarea').last().focus();await shot('03-resumed-table');await page.locator('[data-step="2"]').click();await ready();report.suggestions=await page.locator('.review-issue h3').allTextContents();for(const box of await page.locator('.review-issue input[type=checkbox]').all())await box.check();await shot('04-review-and-preview');
 for(const format of ['docx','pdf']){await page.locator(`[name=format][value=${format}]`).check();await page.locator('#export:not([disabled])').waitFor();await download('#export','final.'+format);}await page.locator('#draft-menu').click();await download('#save-draft','final.gongwen.json');check('真实下载草稿与最终同稿完整结构一致',JSON.stringify(JSON.parse(await readFile(resolve(out,'final.gongwen.json'),'utf8')).content)===JSON.stringify(final.content));
 report.engineSHA256=createHash('sha256').update(await readFile(resolve(root,'dist/local-preview/document-engine.wasm'))).digest('hex');report.draftIdentity=id;report.expectedRows=table.rows.map(r=>r.cells.map(c=>c.text));report.finalFields=final.fields;report.previewStatus=await page.locator('#preview-status').textContent();report.passed=report.pageErrors.length===0;
}catch(e){report.failure=String(e.stack||e);await shot('failure');throw e;}finally{await writeFile(resolve(out,'result.json'),JSON.stringify(report,null,2));await browser.close();}
