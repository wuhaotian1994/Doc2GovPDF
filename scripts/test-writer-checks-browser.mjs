import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {startWebServer} from './browser-tests/server.mjs';
const require=createRequire(new URL('./browser-tests/package.json',import.meta.url));
const {chromium,firefox,webkit}=require('playwright');
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'build/qa/ceo-001');await mkdir(out,{recursive:true});
const server=await startWebServer(resolve(root,process.env.WRITER_WEB_ROOT||'build/qa/ceo-001-web'));
const profiles=[{id:'chrome',engine:chromium,channel:'chrome'},{id:'firefox',engine:firefox},{id:'webkit',engine:webkit}].filter(p=>!process.env.CHECKS_PROFILE||process.env.CHECKS_PROFILE.split(',').includes(p.id));
const repeated='设备重量为10kg，请按原始记录核对型号。';
const lines=Array.from({length:42},(_,i)=>`第${i+1}组资料已完成归档，请保留原始记录并核对附件名称。工作安排由各部门依次落实，形成记录后统一存档，便于后续查询。`);
lines[4]=repeated;lines[32]=repeated;lines[20]='我司将安排专人联系，请结合实际情况核对。';lines[39]='请于2026年2月30日前提交材料。';
const body=lines.join('\n'),results=[];
async function rangeAt(page,start,end){await page.evaluate(({start,end})=>{const host=document.getElementById('content-blocks'),nodes=[...host.querySelectorAll('[data-kind=paragraph]')];host.focus();const point=global=>{let at=0;for(const node of nodes){const text=node.textContent||'';if(global<=at+text.length){const walk=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let t,left=global-at;while(t=walk.nextNode()){if(left<=t.length)return[t,left];left-=t.length;}return[node,0];}at+=text.length+1;}const node=nodes.at(-1);return[node,node.childNodes.length];},r=document.createRange();r.setStart(...point(start));r.setEnd(...point(end));const selection=getSelection();selection.removeAllRanges();selection.addRange(r);},{start,end});}
async function fillBody(page,next){
 if(await page.locator('#body').isVisible()){await page.locator('#body').fill(next);return;}
 let previous=await page.locator('#body').inputValue();if(next===previous)return;
 const contained=previous&&next.indexOf(previous);if(previous&&contained>=0){const prefix=next.slice(0,contained),suffix=next.slice(contained+previous.length);if(prefix){await rangeAt(page,0,0);await page.keyboard.insertText(prefix);}if(suffix){const end=(await page.locator('#body').inputValue()).length;await rangeAt(page,end,end);await page.keyboard.insertText(suffix);}return;}
 let start=0;while(start<previous.length&&start<next.length&&previous[start]===next[start])start++;let suffix=0;while(suffix<previous.length-start&&suffix<next.length-start&&previous.at(-1-suffix)===next.at(-1-suffix))suffix++;
 await rangeAt(page,start,previous.length-suffix);const replacement=next.slice(start,next.length-suffix);if(replacement)await page.keyboard.insertText(replacement);else await page.keyboard.press('Backspace');
}
async function selectedBody(page){return page.evaluate(()=>{const nodes=[...document.querySelectorAll('#content-blocks [data-kind=paragraph]')],range=getSelection()?.rangeCount?getSelection().getRangeAt(0):null,input=range&&nodes.find(n=>n.contains(range.startContainer));if(!input)return{start:0,text:'',scroll:0};let start=0;for(const n of nodes){if(n===input)break;start+=(n.textContent||'').length+1;}return{start:start+input.selectionStart,text:range.toString(),scroll:document.querySelector('.form-scroll').scrollTop};});}

try{
 for(const profile of profiles){
  const folder=resolve(out,profile.id);await mkdir(folder,{recursive:true});
  const browser=await profile.engine.launch({headless:true,...(profile.channel?{channel:profile.channel}:{}),env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',http_proxy:'',https_proxy:'',all_proxy:'',NO_PROXY:'127.0.0.1,localhost'},...(profile.engine===firefox?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
  const page=await browser.newPage({viewport:{width:1440,height:1000},locale:'zh-CN',timezoneId:'Asia/Shanghai',acceptDownloads:true});page.setDefaultTimeout(30000);
  const result={profile:profile.id,version:browser.version(),checks:[],errors:[],passed:false};
  page.on('pageerror',error=>result.errors.push(error.message));
  const check=(name,value)=>{assert.ok(value,name);result.checks.push(name);console.log(profile.id+': '+name);};
  const ready=async()=>{await page.waitForFunction(()=>document.getElementById('preview-status').textContent.startsWith('已更新')||(!document.getElementById('global-error').hidden&&document.getElementById('preview-status').textContent==='预览暂未生成'),{},{timeout:120000});assert.ok((await page.locator('#preview-status').innerText()).startsWith('已更新'),await page.locator('#global-error').innerText());await page.locator('.review-issue').first().waitFor();};
  const unit=()=>page.locator('.review-issue[data-rule="number.unit-space"]');
  const back=async()=>{await page.locator('#return-checks').click();await ready();};
  const confirmAll=async()=>{for(const input of await page.locator('.review-issue input[type=checkbox]').all())await input.check();};
  const download=async(format)=>{
    await page.locator(`[name=format][value="${format}"]`).check();await page.locator('#export:not([disabled])').waitFor();
    const waiting=page.waitForEvent('download',{timeout:120000});await page.locator('#export').click();const file=await waiting;
    assert.equal(await file.failure(),null);await file.saveAs(resolve(folder,'reviewed.'+format));
    check('actual '+format+' export accepts the current confirmation IDs',true);
  };
  try{
    await page.goto(server.url);await page.locator('#title').fill('关于资料核对的安排');
    await page.waitForFunction(()=>window.writerReady===true);
    await page.locator('[data-next="1"]').click();await fillBody(page,body);await page.locator('[data-next="2"]').click();await ready();
    check('long synthetic draft has multiple real PDF pages',Number((await page.locator('#page-count').innerText()).split('/')[1].replace('页','').trim())>1);
    check('identical paragraphs have separate reminders and correct source labels',await unit().count()===2&&(await unit().nth(0).innerText()).includes('正文第 5 段')&&(await unit().nth(1).innerText()).includes('正文第 33 段'));
    check('each reminder exposes its complete paragraph',JSON.stringify(await unit().locator('.issue-original').allTextContents())===JSON.stringify([repeated,repeated]));
    await unit().nth(1).getByText('查看依据与处理方法').click();
    check('reminder explains its basis and how to resolve or retain',/数字与计量单位书写规范/.test(await unit().nth(1).innerText())&&/有意保留/.test(await unit().nth(1).innerText()));
    check('errors cannot be acknowledged and block formatted download',await page.locator('[data-severity=error]').count()>0&&await page.locator('[data-severity=error] input[type=checkbox]').count()===0&&await page.locator('#export').isDisabled());
    check('suggestions explicitly do not block or require confirmation',await page.locator('[data-severity=suggestion]').count()>0&&await page.locator('[data-severity=suggestion] input').count()===0&&(await page.locator('[data-severity=suggestion]').first().innerText()).includes('不影响下载'));
    if(profile.id==='chrome')await page.screenshot({path:resolve(folder,'reminders.png'),fullPage:true});
    await unit().nth(1).getByRole('button').click();
    let selected=await selectedBody(page);
    check('late repeated paragraph selects its own occurrence and scrolls inside the writing pane',selected.start===body.lastIndexOf(repeated)&&selected.text===repeated&&selected.scroll>0);
    if(profile.id==='chrome')await page.screenshot({path:resolve(folder,'located.png'),fullPage:true});
    await fillBody(page,body.replace('2026年2月30日','2026年2月28日'));await back();
    check('fixing an error removes its reminder after real reinspection',await page.locator('[data-severity=error]').count()===0);
    await confirmAll();check('acknowledged reviews and unacknowledged suggestions allow download',await page.locator('#export').isEnabled());
    await page.getByRole('button',{name:'修改标题',exact:true}).click();await page.locator('#title').fill('关于资料核对的安排（修订）');
    await page.locator('[data-step="2"]').click();await ready();
    check('changing only the title preserves both reviewed paragraphs',await unit().locator('input:checked').count()===2);
    await unit().nth(1).getByRole('button').click();
    const inserted='新增说明：请妥善保存资料。\n'+(await page.locator('#body').inputValue())+'\n另行通知归档日期。';
    await fillBody(page,inserted);await back();
    check('inserting unrelated paragraphs preserves confirmations despite new engine IDs and offsets',await unit().locator('input:checked').count()===2);
    await unit().nth(1).getByRole('button').click();
    selected=await selectedBody(page);
    check('location follows inserted paragraphs without jumping to the first duplicate',selected.start===inserted.lastIndexOf(repeated)&&selected.text===repeated);
    await back();await download('docx');await download('pdf');await download('txt');
    await page.locator('[name=format][value="docx"]').check();
    await unit().nth(0).getByRole('button').click();
    const changed=inserted.replace(repeated,repeated.replace('10kg','11kg'));
    await fillBody(page,changed);await back();
    check('changing reviewed content revokes affected and ambiguous duplicate confirmations',await unit().locator('input:checked').count()===0&&await page.locator('#export').isDisabled());
    await confirmAll();
    await unit().nth(0).getByRole('button').click();await fillBody(page,changed.replace('11kg','11 kg'));await back();
    check('manual correction removes the resolved finding and keeps authored numbers',await unit().count()===1&&(await page.locator('#body').inputValue()).includes('11 kg'));
    await unit().first().locator('input').check();
    await page.locator('[data-step="0"]').click();
    // Reference field lives in the existing optional section; use its summary.
    if(!await page.locator('#reference').isVisible())await page.locator('[data-panel="0"] details:has(#reference) summary').click();
    await page.locator('#reference').fill('综办[2026]0008号');await page.locator('[data-step="2"]').click();await ready();
    const reference=page.locator('.review-issue[data-rule="reference.format"]').first();await reference.getByText('查看依据与处理方法').click();
    check('proposed wording is explicit and never applied automatically',(await reference.innerText()).includes('建议写法')&&(await page.locator('#reference').inputValue())==='综办[2026]0008号');
    await reference.getByRole('button').click();
    check('metadata reminder targets its own authored input',await page.locator('#reference').evaluate(input=>document.activeElement===input&&input.selectionStart===0&&input.selectionEnd===input.value.length));
    await back();
    const imported=await page.evaluate(()=>JSON.parse(localStorage.getItem('gongwen-writer-v1')));
    delete imported.content;delete imported.review;imported.version=3;imported.fields.body='第一行说明。\r\n\r\n'+repeated+'\r\n其他说明。\r\n'+repeated;imported.fields.reference='';imported.step=2;
    await page.locator('#draft-menu').click();
    await page.locator('#load-draft').setInputFiles({name:'windows-line-endings.gongwen.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(imported))});
    await page.locator('#replace-dialog[open]').waitFor();await page.locator('#confirm-replace').click();await ready();
    check('importing a separate draft does not inherit old confirmations',await unit().count()===2&&await unit().locator('input:checked').count()===0);
    await unit().nth(1).getByRole('button').click();
    check('imported Windows line endings use displayed text offsets',await selectedBody(page).then(async selected=>selected.start===(await page.locator('#body').inputValue()).lastIndexOf('设备重量')&&selected.text==='设备重量为10kg，请按原始记录核对型号。'));
    check('all context is real text and no browser errors occurred',result.errors.length===0);
    result.passed=true;
  }catch(error){result.error=error.stack;await page.screenshot({path:resolve(folder,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
  finally{results.push(result);await writeFile(resolve(out,'result.json'),JSON.stringify(results,null,2));await browser.close();}
 }
}finally{await server.close();}
