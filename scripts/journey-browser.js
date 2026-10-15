(async()=>{
 const q=window.__qa, api=window.go.main.App, $=id=>document.getElementById(id);
 const checks=[],exports=[],originals={...api};let latestExport=null;
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const assert=(value,message)=>{if(!value)throw Error(message)};
 const until=async(fn,label)=>{const end=Date.now()+20000;while(Date.now()<end){if(await fn())return;await sleep(60)}throw Error('Timeout: '+label)};
 const input=(id,value)=>{const e=$(id);e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));};
 const idle=()=>until(()=>!document.body.classList.contains('busy'),'idle');
 const result=async()=>{await idle();await until(()=>$('check-heading').textContent!=='正在检查…','inspection');};
 const home=async()=>{if($('welcome').hidden){$('home-open').click();await until(()=>!$('welcome').hidden,'home');}};
 async function acceptReplacement(){for(let i=0;i<100;i++){if($('replace-dialog').open){$('replace-dialog').querySelector('button[value=replace]').click();return;}if(!$('compose').hidden||!document.body.classList.contains('busy'))return;await sleep(30)}}
 async function start(kind){await home();$('template-home').click();await sleep(50);await acceptReplacement();await until(()=>!$('compose').hidden,'compose');input('field-kind',kind);}
 async function generate(){ $('compose-form').requestSubmit();await until(()=>!$('workspace').hidden,'generated');await result(); }
 async function selectImport(path){await api.QAQueueDialog(path);$(currentHome()?'import-home':'import-work').click();await sleep(80);await acceptReplacement();await idle();}
 function currentHome(){return !$('welcome').hidden}
 async function exportTo(format,path){
  latestExport=null;input('output-format',format);$('font-ack').checked=true;$('font-ack').dispatchEvent(new Event('change'));
  await until(()=>!$('export-open').disabled,'export enabled');await api.QAQueueDialog(path);$('export-open').click();await idle();return latestExport;
 }
 function note(name){checks.push(name)}
 api.ExportDocument=async(...args)=>{const r=await originals.ExportDocument(...args);latestExport=r;for(const path of r.paths||[])exports.push({path,source:args[0].sourceId||'',paragraphs:args[0].blocks.flatMap(b=>b.paragraph?[(b.paragraph.prefix||'')+b.paragraph.text]:b.table.rows.flatMap(row=>row.cells.flatMap(cell=>cell.paragraphs.map(p=>(p.prefix||'')+p.text))))});return r;};
 try{
  await until(()=>window.appReady,'startup');
  if(q.phase==='1'){
   assert(!$('welcome').hidden&&$('resume-section').hidden,'fresh start not empty');note('首次启动与空草稿');
   $('settings-open').click();await until(()=>$('settings-dialog').open,'settings');input('pref-agency','验收测试办公室');input('pref-reference','测办发');input('pref-format','docx');$('settings-form').requestSubmit();await until(()=>!$('settings-dialog').open,'settings saved');
   assert((await api.GetPreferences()).agency==='验收测试办公室','settings not persisted');
   $('settings-open').click();input('pref-agency','取消不应保存');$('settings-close').click();assert((await api.GetPreferences()).agency==='验收测试办公室','cancel saved settings');note('设置保存与取消');
   $('settings-open').click();input('pref-agency','失败不应生效');api.SavePreferences=async()=>{throw Error('测试保存失败')};$('settings-form').requestSubmit();await until(()=>$('settings-dialog').querySelector('.dialog-error'),'visible settings error');assert($('settings-dialog').open,'error closed dialog');api.SavePreferences=originals.SavePreferences;$('settings-close').click();$('dismiss-error').click();note('设置失败提示位于弹窗内且不污染已保存值');
   let builds=0;api.BuildDocument=async f=>{builds++;await sleep(120);return originals.BuildDocument(f)};$('sample-home').click();$('sample-home').click();await until(()=>!$('workspace').hidden,'sample');await result();assert(builds===1,'double click generated twice');api.BuildDocument=originals.BuildDocument;note('示例重复点击保护');
   await home();assert(!$('resume-section').hidden,'home lost draft');$('resume-work').click();await result();note('示例返回与继续');
   $('settings-open').click();$('clear-data-open').click();$('clear-data-dialog').querySelector('button[value=cancel]').click();assert((await api.GetWorkspace()).document.blocks.length,'cancel clear deleted draft');
   $('settings-open').click();$('clear-data-open').click();$('clear-data-confirm').click();await until(()=>!$('clear-data-dialog').open,'clear');await idle();assert(!$('welcome').hidden&&$('resume-section').hidden,'clear did not return empty home');assert(!(await api.GetWorkspace()).document.blocks?.length,'clear retained draft');assert((await api.GetPreferences()).agency==='验收测试办公室','clear erased settings');note('清理取消与确认、保留设置');
   for(const kind of ['notice','report','request','letter','minutes','rules','plain']){
    await start(kind);assert($('field-agency').value==='验收测试办公室','unit preset absent');input('field-title','验收测试办公室关于资料整理的'+kind);input('field-body','一、工作安排\n请各部门按照安排整理材料。\n二、有关要求\n请核对原始记录并妥善保存。');input('field-reference','测办发〔2026〕12号');input('field-recipient','各部门');input('field-date','2026-10-15');
    assert($('field-signer').closest('label').hidden===!['report','request'].includes(kind),'signer visibility wrong');
    if(['report','request'].includes(kind))input('field-signer','张三');
    if(kind==='minutes'){assert(!$('roster-fields').hidden,'minutes roster hidden');input('field-attendees','张三、李四');}
    if(kind==='request'){input('field-attachments','整理清单');$('field-annex-pages').checked=true;$('field-annex-pages').dispatchEvent(new Event('change',{bubbles:true}));}
    await generate();
    if(kind==='request'){
     assert($('export-open').disabled,'empty annex export allowed');$('edit-tab').click();const field=[...document.querySelectorAll('.paragraph-editor')].find(n=>n.textContent.startsWith('附件正文')).querySelector('textarea');field.focus();field.value='一、整理文档。\n二、核对台账。';field.dispatchEvent(new Event('input',{bubbles:true}));await result();
    }
    const r=await exportTo('both',q.output);assert(r?.paths.length===2,'template pair export failed: '+kind);assert(r.paths[0].slice(0,-5)===r.paths[1].slice(0,-4),'pair names differ');note('新建 '+kind+' 并导出实际 Word/PDF');
    if(kind==='plain'){$('open-result').click();$('open-folder').click();await until(async()=> (await api.QAOpened()).length===2,'open output actions');const opened=await api.QAOpened();assert(opened.includes(r.paths[0])&&opened.some(path=>path.replaceAll('\\','/')===q.output.replaceAll('\\','/')),'open output routed wrong path');note('打开成品和文件夹的完整调用路径（系统启动隔离）');}
   }
   // Table insertion, empty input, deletion, undo and edit-role controls.
   $('edit-tab').click();const body=[...document.querySelectorAll('.paragraph-editor')].find(n=>n.textContent.startsWith('正文')).querySelector('textarea');body.focus();const bodyId=body.dataset.paragraph;
   $('add-table').click();input('table-input','  \t ');$('table-form').requestSubmit();assert($('table-dialog').querySelector('.dialog-error'),'table error hidden behind dialog');
   input('table-input','\t项目\t数量\n1\t资料\t2');$('table-form').requestSubmit();await result();await until(()=>$('save-state').textContent==='已保存到本机','table saved');let saved=await api.GetWorkspace();const at=saved.document.blocks.findIndex(b=>b.paragraph?.id===bodyId);assert(saved.document.blocks[at+1]?.table,'table not after selected body');assert(saved.document.blocks[at+1].table.rows[0].cells[0].paragraphs[0].text==='','leading blank column lost');
   [...document.querySelectorAll('.editor-table-wrap button')].find(b=>b.textContent==='删除此表格').click();assert(!document.querySelector('.editor-table'),'table not removed');$('undo').click();assert(document.querySelector('.editor-table'),'undo table removal failed');note('表格插入位置、空输入、空列、删除与撤销');
   const editableBody=[...document.querySelectorAll('.paragraph-editor')].find(n=>n.textContent.startsWith('正文')).querySelector('textarea');editableBody.focus();$('add-paragraph').click();const added=document.activeElement;assert(added.tagName==='TEXTAREA','new paragraph not focused');added.value='补充说明。';added.dispatchEvent(new Event('input',{bubbles:true}));input('paragraph-role','heading');await idle();note('段落插入、编辑与角色切换');
   const normalized=api.NormalizeDocument;api.NormalizeDocument=async m=>{await sleep(200);return normalized(m)};$('normalize-format').click();assert($('workspace').inert&&$('home-open').disabled,'mutation was not locked');await idle();api.NormalizeDocument=normalized;$('undo').click();note('统一格式、操作锁与撤销');
   let r=await exportTo('docx',q.output+'/单独Word.docx');assert(r?.paths.length===1,'docx output missing');r=await exportTo('pdf',q.output+'/单独PDF.pdf');assert(r?.paths.length===1,'PDF output missing');r=await exportTo('pdf','');assert(r?.paths.length===0,'cancel export wrote file');note('单独 Word、PDF 与取消导出');
   await exportTo('docx',q.output+'/单独Word.docx');assert(!$('error').hidden&&$('error-text').textContent.includes('已存在'),'existing file not protected');$('dismiss-error').click();await exportTo('docx',q.output+'/错误扩展名.pdf');assert(!$('error').hidden,'wrong extension accepted');$('dismiss-error').click();await exportTo('docx',q.output+'/重试成功.docx');note('重名与扩展名错误后重试');
   await selectImport('');assert(!$('workspace').hidden,'cancel import changed workspace');await selectImport(q.bad);assert(!$('error').hidden&&!!(await api.GetWorkspace()).document.blocks.length,'bad import lost old document');$('dismiss-error').click();await selectImport(q.empty);assert(!$('error').hidden,'empty import accepted');$('dismiss-error').click();note('导入取消、损坏和空文件');
   await selectImport(q.text);await result();assert([...document.querySelectorAll('textarea')].some(e=>e.value==='测试通知'),'TXT text missing');note('TXT 实际导入');
   const {handleFileDrop}=await import('./workspace-ui.js');await handleFileDrop([q.text,q.files[0]]);assert(!$('error').hidden,'multiple dropped files accepted');$('dismiss-error').click();
   $('settings-open').click();await handleFileDrop([q.text]);assert($('settings-dialog').querySelector('.dialog-error'),'drop bypassed open modal');$('settings-close').click();$('dismiss-error').click();
   const dropped=handleFileDrop([q.text]);await sleep(80);await acceptReplacement();await dropped;await result();note('拖入处理路径、多个文件及弹窗保护（不使用鼠标）');
   for(let i=0;i<q.files.length;i++){
    await selectImport(q.files[i]);await result();assert(!document.querySelector('.issue-card'),'passing upstream flagged');$('track-changes').checked=true;const r=await exportTo('docx',q.output+'/原样-'+i+'.docx');assert(r?.paths.length===1,'source export failed');exports[exports.length-1].original=q.files[i];
   }note('七份上游 DOCX 经界面导入并原样导出');
   await selectImport(q.unsupported);await result();assert($('output-format').value==='docx','unsupported PDF did not offer Word');assert(!$('document-notice').hidden,'unsupported object not explained');await exportTo('docx',q.output+'/保留公式.docx');note('复杂对象保留与 Word 降级');
   await selectImport(q.text);await result();const realPreview=api.PreviewDocument;api.PreviewDocument=async()=>{throw Error('测试 PDF 渲染失败')};$('refresh-preview').click();await until(()=>$('pdf-state').textContent.includes('渲染失败'),'preview error');input('output-format','pdf');assert($('export-open').disabled,'failed PDF export enabled');input('output-format','docx');await until(()=>!$('export-open').disabled,'Word fallback');api.PreviewDocument=realPreview;$('refresh-preview').click();await until(()=>$('pdf-state').hidden,'preview retry');note('PDF 失败后 Word 出稿及刷新恢复');
   let call=0;api.PreviewDocument=async m=>{call++;if(call===1){await sleep(500);throw Error('过期预览错误');}return realPreview(m)};$('refresh-preview').click();await sleep(50);$('refresh-preview').click();await until(()=>$('pdf-state').hidden,'latest preview');await sleep(600);assert($('pdf-state').hidden,'stale preview replaced latest');api.PreviewDocument=realPreview;note('过期预览不覆盖最新结果');
   api.PreviewDocument=async m=>{await sleep(350);return realPreview(m)};$('refresh-preview').click();$('cancel-preview').click();await sleep(500);assert($('pdf-state').textContent.includes('已取消'),'cancelled preview came back');api.PreviewDocument=realPreview;$('refresh-preview').click();await until(()=>$('pdf-state').hidden,'cancel then retry');note('取消排版与重新生成');
   await start('plain');input('field-title','重新打开仍在的草稿');input('field-body','关闭前未等待自动保存的文字');
   note('关闭窗口前未生成表单已进入保存路径');
  }else if(q.phase==='2'){
   assert(!$('compose').hidden&&$('field-title').value==='重新打开仍在的草稿'&&$('field-body').value==='关闭前未等待自动保存的文字','unfinished form lost across restart');note('真实进程重启恢复未生成表单');
   input('field-title','恢复后的通知');input('field-reference','测办发【2026】第012号');await generate();await until(()=>document.querySelector('.issue-card .subtle'),'issue confirmation');document.querySelector('.issue-card .subtle').click();await home();note('确认保留写法后返回首页并退出');
  }else if(q.phase==='3'){
   assert(!$('welcome').hidden&&!$('resume-section').hidden,'home state not restored');$('resume-work').click();await result();assert(!document.querySelector('.issue-card'),'confirmed issues reappeared after restart');note('重启保留首页位置和已确认问题');
   $('edit-tab').click();$('add-table').click();input('table-input','项目\t数量\n重启后仍保留\t2');note('表格弹窗输入后直接关闭窗口');
  }else{
   assert($('table-dialog').open&&$('table-input').value.includes('重启后仍保留'),'unfinished table lost on restart');$('table-form').requestSubmit();await result();assert(document.querySelector('.editor-table'),'restored table not added');note('真实重启恢复未添加表格并继续');
   $('settings-open').click();$('clear-data-open').click();$('clear-data-confirm').click();await until(()=>!$('clear-data-dialog').open,'final clear');await idle();assert(!(await api.GetWorkspace()).document.blocks?.length,'clear retained current document');note('最终清理不影响已导出成品');
  }
  Object.assign(api,originals);window.runtime.EventsEmit('qa:journey',{passed:true,phase:q.phase,checks,exports});
 }catch(e){Object.assign(api,originals);window.runtime.EventsEmit('qa:journey',{passed:false,phase:q.phase,checks,exports,error:String(e),visibleError:$('error-text')?.textContent,modal:document.querySelector('dialog[open]')?.id,stack:e.stack});}
})();
