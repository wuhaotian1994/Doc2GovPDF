import {createRequire} from 'node:module';
import {startWebServer} from './browser-tests/server.mjs';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(new URL('./browser-tests/package.json',import.meta.url));
const {chromium,firefox,webkit,devices}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root=resolve(import.meta.dirname,'..'), webRoot=resolve(root,process.env.WRITER_WEB_ROOT||'build/qa/returning-web'), out=resolve(root,'build/qa/returning');
await mkdir(out,{recursive:true});
const server=await startWebServer(webRoot);
const url=server.url;
const profiles=[
  {id:'chrome-desktop',engine:chromium,channel:'chrome',viewport:{width:1366,height:900}},
  {id:'edge-desktop',engine:chromium,channel:'msedge',viewport:{width:1440,height:960}},
  {id:'firefox-desktop',engine:firefox,viewport:{width:1366,height:900}},
  {id:'webkit-desktop',engine:webkit,viewport:{width:1366,height:900}},
  {id:'android-emulated',engine:chromium,channel:'chrome',device:devices['Pixel 7']},
  {id:'iphone-emulated',engine:webkit,device:devices['iPhone 13']},
  {id:'ipad-emulated',engine:webkit,device:devices['iPad (gen 7)']}
].filter(p=>!process.env.WRITER_PROFILE || process.env.WRITER_PROFILE.split(',').includes(p.id));
const results=[];
const boundedClose=async(target)=>{if(!target)return;await Promise.race([target.close().catch(()=>{}),new Promise(r=>{const timer=setTimeout(r,10000);timer.unref();})]);};
const body='为做好资料整理工作，现将有关事项说明如下。\n一、整理范围\n本次整理包括工作记录和会议材料。\n二、工作要求\n请各部门核对内容后及时归档。';
try {
  for(const profile of profiles) {
    const folder=resolve(out,profile.id);await mkdir(folder,{recursive:true});
    const result={profile:profile.id,checks:[],passed:false,physicalDevice:false};
    let browser,context,page;
    const check=(name,condition)=>{assert.ok(condition,name);result.checks.push(name);console.log(profile.id+': '+name);};
    const errors=[],requests=[];
    try {
      browser=await profile.engine.launch({headless:true,timeout:45000,...(profile.channel?{channel:profile.channel}:{}),
        env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',http_proxy:'',https_proxy:'',all_proxy:'',NO_PROXY:'127.0.0.1,localhost'},
        ...(profile.engine===firefox?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
      result.engineVersion=browser.version();
      context=await browser.newContext({...profile.device,...(profile.viewport?{viewport:profile.viewport}:{}),locale:'zh-CN',timezoneId:'Asia/Shanghai',acceptDownloads:true,reducedMotion:'reduce'});
      page=await context.newPage();page.setDefaultTimeout(20000);
      page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
      await page.goto(url);await page.waitForFunction(()=>window.writerReady,{},{timeout:120000});
      result.userAgent=await page.evaluate(()=>navigator.userAgent);
      const preview=async()=>page.waitForFunction(()=>document.getElementById('preview-status').textContent.startsWith('已更新'),{},{timeout:120000});
      const screenshot=async(name)=>{
        if(process.env.WRITER_FUNCTIONS_ONLY==='1'||process.env.WRITER_CAPTURE&&!process.env.WRITER_CAPTURE.split(',').includes(profile.id))return;
        await page.evaluate(()=>{window.scrollTo(0,0);return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
        await page.screenshot({path:resolve(folder,name+'.png'),fullPage:name!=='library'});
      };
      const click=async(selector)=>{if(profile.device?.hasTouch)await page.locator(selector).tap();else await page.locator(selector).click();};
      const exportFile=async(format)=>{
        await page.locator(`[name=format][value="${format}"]`).check();
        await page.locator('#export:not([disabled])').waitFor({timeout:120000});
        const downloadPromise=page.waitForEvent('download',{timeout:120000});
        await click('#export');const download=await downloadPromise;
        const path=resolve(folder,download.suggestedFilename());await download.saveAs(path);
        assert.equal(await download.failure(),null);return path;
      };
      check('opens directly into blank title form',await page.locator('#title').inputValue()==='' && await page.locator('[name=kind]').count()===0);
      await click('[data-next="1"]');
      check('first-use validation explains missing title',await page.locator('#title-error').isVisible());
      await page.getByLabel('文档标题',{exact:true}).fill('关于资料整理的通知');
      await page.locator('#recipient').fill('各部门');
      await click('[data-next="1"]');
      await page.locator('#body').fill(body);
      await page.locator('#signature').fill('综合办公室');
      await click('#use-today');
      check('today is explicit and uses local date',/^\d{4}-\d{2}-\d{2}$/.test(await page.locator('#date').inputValue()));
      await click('#remember-common');
      check('saves reusable details in one action',(await page.locator('#common-hint').textContent()).includes('已记住'));
      await preview();await screenshot('writing');
      if(profile.device?.hasTouch && profile.device.viewport.width<=760){
        await click('#jump-preview');
        check('touch shortcut reaches preview',await page.locator('#preview-heading').evaluate(el=>el.getBoundingClientRect().top>=0 && el.getBoundingClientRect().top<window.innerHeight));
        await click('#zoom-preview');
        check('mobile paper can be enlarged',await page.locator('#preview-canvas').evaluate(el=>el.scrollWidth>el.clientWidth));
        await click('#zoom-preview');await click('#back-writing');
      }
      await click('[data-next="2"]');await preview();
      const docx=await exportFile('docx'),pdf=await exportFile('pdf'),txt=await exportFile('txt');
      check('Word PDF TXT download real files',(await readFile(docx)).subarray(0,2).toString()==='PK'&&(await readFile(pdf)).subarray(0,4).toString()==='%PDF'&&(await readFile(txt,'utf8')).includes(body));
      await screenshot('export');
      await click('#new-document');
      check('new document reuses stable details without carrying facts',await page.locator('#recipient').inputValue()==='各部门'&&await page.locator('#signature').inputValue()==='综合办公室'&&await page.locator('#title').inputValue()===''&&await page.locator('#body').inputValue()===''&&await page.locator('#date').inputValue()===''&&await page.locator('#reference').inputValue()==='');
      check('new document has no destructive confirmation',!await page.locator('#replace-dialog').isVisible());
      await page.locator('#title').fill('第二份文档');await click('[data-next="1"]');
      await page.locator('#body').fill('这是第二份文档的正文。');await preview();
      await click('#draft-menu');
      const first=page.locator('.recent-document').filter({has:page.getByRole('heading',{name:'关于资料整理的通知',exact:true})});
      check('first document remains in library',await first.count()===1);
      await first.getByRole('button',{name:'继续编辑',exact:true}).click();
      check('switching restores original exact body',await page.locator('#body').inputValue()===body);
      await preview();await click('#draft-menu');await screenshot('library');
      await click('#copy-current');
      check('copying retains body and clears per-document date and number',await page.locator('#body').inputValue()===body && await page.locator('#date').inputValue()==='' && await page.locator('#reference').inputValue()==='');
      await page.locator('#title').fill('复用后新稿');
      await page.reload();await page.waitForFunction(()=>window.writerReady);
      check('current document and preferences survive reload',await page.locator('#title').inputValue()==='复用后新稿'&&await page.locator('#signature').inputValue()==='综合办公室');
      await click('#common-open');
      check('common settings are editable',await page.locator('#common-signature').inputValue()==='综合办公室');
      await page.locator('#common-signature').fill('项目办公室');
      await page.locator('#common-form button[type=submit]').click();await click('[data-close="common-dialog"]');
      check('changing defaults does not alter current signature',await page.locator('#signature').inputValue()==='综合办公室');
      await click('#draft-menu');const dp=page.waitForEvent('download');await click('#save-draft');
      const saved=await dp,path=resolve(folder,'restorable.gongwen.json');await saved.saveAs(path);
      await click('[data-close="draft-dialog"]');
      const newerBody='这是下载旧快照之后新增的内容。\n'+body;
      await page.locator('[data-step="1"]').click();await page.locator('#body').fill(newerBody);
      await click('#new-document');
      check('updated defaults apply to the next new draft',await page.locator('#signature').inputValue()==='项目办公室');
      await click('#draft-menu');await page.locator('#load-draft').setInputFiles(path);
      await page.locator('#confirm-replace').click();
      check('downloaded file restores through file picker',await page.locator('#title').inputValue()==='复用后新稿');
      await click('#new-document');await click('#draft-menu');
      const preserved=page.locator('.recent-document').filter({hasText:`${newerBody.length} 字`});
      await preserved.getByRole('button',{name:'继续编辑',exact:true}).click();
      check('importing old snapshot and switching again preserves newer text',await page.locator('#body').inputValue()===newerBody);
      // A second independent page must not overwrite the locked current document.
      const second=await context.newPage();await second.goto(url);await second.waitForFunction(()=>window.writerReady);
      result.secondTab=await second.evaluate(()=>({disabled:document.getElementById('editable').disabled,message:document.getElementById('global-error').textContent}));
      check('second tab cannot overwrite draft',result.secondTab.disabled && result.secondTab.message.includes('另一标签页'));
      await second.close();
      await page.locator('[data-step="1"]').click();await page.locator('#date').fill('1899-01-01');
      await click('#new-document');
      check('invalid date cannot poison replacement history',await page.locator('#date-error').isVisible()&&await page.locator('#title').inputValue()==='复用后新稿');
      await page.locator('#date').fill('');await preview();
      await page.locator('[data-step="2"]').click();
      const width=page.viewportSize().width;
      check('no horizontal page overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
      if(profile.id==='chrome-desktop'){
        const beforeBody=await page.locator('#body').inputValue();
        await click('#draft-menu');
        await page.evaluate(()=>{window.originalWriterSet=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError');};});
        await page.locator('.recent-document').first().getByRole('button',{name:'继续编辑',exact:true}).click();
        check('failed archive cancels switching and explains error in dialog',(await page.locator('#draft-status').textContent()).includes('切换已取消') && await page.locator('#body').inputValue()===beforeBody);
        await page.evaluate(()=>{Storage.prototype.setItem=window.originalWriterSet;});
        const countBefore=await page.locator('.recent-document').count();
        await page.locator('.recent-document').first().getByRole('button',{name:'删除',exact:true}).click();
        await click('[data-close="delete-document-dialog"]');
        check('deletion can be cancelled',await page.locator('.recent-document').count()===countBefore);
        await page.locator('.recent-document').first().getByRole('button',{name:'删除',exact:true}).click();
        await click('#delete-document-confirm');
        check('deletion leaves current document intact',await page.locator('.recent-document').count()===countBefore-1 && await page.locator('#body').inputValue()===beforeBody);
        await click('[data-close="draft-dialog"]');
        await page.setViewportSize({width:683,height:450});
        check('200-percent equivalent layout stays usable',await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
        await page.setViewportSize({width,height:900});
        await page.locator('#draft-menu').focus();await page.keyboard.press('Enter');
        await page.locator('#draft-dialog').waitFor({state:'visible'});
        await page.locator('#load-draft-open').waitFor({state:'visible'});
        const chooser=page.waitForEvent('filechooser');await page.locator('#load-draft-open').press('Enter');await chooser;
        check('keyboard can open native file chooser',true);await page.keyboard.press('Escape');
        if(await page.locator('#draft-dialog').isVisible())await page.locator('[data-close="draft-dialog"]').click();
      }
      if(profile.device){
        await page.setViewportSize({width:740,height:360});
        check('phone landscape stays within screen',await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
        await screenshot('landscape');
        await page.setViewportSize({width:320,height:640});
        check('320px narrow layout has no overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
        await page.setViewportSize(profile.device.viewport);
      }
      // User texts never become HTML.
      await page.locator('[data-step="0"]').click();await page.locator('#title').fill('<img src=x onerror=alert(1)>');
      await click('#new-document');await click('#draft-menu');
      check('saved document names are rendered as text',await page.locator('img[src=x]').count()===0);
      await page.locator('[data-close="draft-dialog"]').click();
      await page.locator('#title').fill('离线文档');await page.locator('[data-step="1"]').click();
      await page.locator('#body').fill('离线仍能排版的正文。');await preview();
      await page.evaluate(()=>navigator.serviceWorker.ready);
      await context.setOffline(true);
      await page.reload();await page.waitForFunction(()=>window.writerReady,{},{timeout:120000});await preview();
      check('offline reload preserves content and renders PDF',await page.locator('#body').inputValue()==='离线仍能排版的正文。');
      await context.setOffline(false);
      // Returning to old documents is still possible offline; no remote document traffic.
      check('no remote requests',requests.every(u=>u.startsWith(url)||u.startsWith('blob:')||u.startsWith('data:')));
      check('no uncaught page exceptions',errors.length===0);
      result.passed=true;
    }catch(e){result.error=e.stack;result.pageErrors=errors;if(page)try{await page.screenshot({path:resolve(folder,'failure.png'),fullPage:true});result.ui=await page.locator('#global-error').textContent();}catch{}console.error(profile.id+' FAILED: '+e.message);}
    finally{await boundedClose(context);await boundedClose(browser);}
    results.push(result);await writeFile(resolve(out,process.env.WRITER_RESULT_FILE || 'matrix.json'),JSON.stringify(results,null,2));
  }
}finally{await server.close();}
if(results.some(r=>!r.passed))process.exitCode=1;
console.log(JSON.stringify(results.map(r=>({profile:r.profile,passed:r.passed,checks:r.checks.length,version:r.engineVersion})),null,2));
