import * as pdfjs from './vendor/pdfjs/pdf.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.mjs', import.meta.url).href;
const $=id=>document.getElementById(id), api=window.go?.main?.App;
let work={name:'',document:{blocks:[]},ignored:[],actions:[]}, prefs={agency:'',referencePrefix:'',outputFormat:'both',autoUpdate:true};
let inspection=null, revision=0, busy=false, saveTimer,checkTimer,previewTimer,toastTimer;
let saveChain=Promise.resolve(), queued='',saveFailed=false, history=[],pdfTask=null,pdfDocument=null,observer=null,lastResult=[];
let previewRevision=-1,fontWarnings=[],selectedParagraph='';
let currentScreen='welcome',resumeTarget=null,previewRequest=0,tableAnchor='';
let preferenceChain=Promise.resolve();
let composing=false;
const clone=value=>structuredClone(value);
function paragraphs(){return work.document.blocks.flatMap(b=>b.paragraph?[b.paragraph]:b.table.rows.flatMap(r=>r.cells.flatMap(c=>c.paragraphs)));}
function findParagraph(id){return paragraphs().find(p=>p.id===id);}
function error(message){
 const text=String(message);
 $('error-text').textContent=text;$('error').hidden=false;
 const dialog=document.querySelector('dialog[open]');
 if(dialog){let notice=dialog.querySelector('.dialog-error');if(!notice){notice=document.createElement('p');notice.className='dialog-error';notice.setAttribute('role','alert');dialog.querySelector('form').prepend(notice);}notice.textContent=text;}
}
function dismissError(){$('error').hidden=true;document.querySelectorAll('.dialog-error').forEach(n=>n.remove());}
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('close',()=>{if(!dialog.open)dialog.querySelector('.dialog-error')?.remove();});
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
function exportReady(){return Boolean(api&&inspection&&!inspection.issues.some(f=>f.severity==='error')&&work.document.blocks.length&&!busy&&($('output-format').value==='docx'||(!work.document.pdfUnsupported&&previewRevision===revision&&(!fontWarnings.length||$('font-ack').checked))));}
function updateButtons(){
 $('export-open').disabled=!exportReady();$('undo').disabled=!history.length||busy;
 for(const id of ['import-home','import-work','new-document','paste-home','template-home','sample-home','settings-open','home-open','resume-work'])$(id).disabled=busy||!api;
 $('workspace').inert=busy;$('compose').inert=busy;
 let reason='';
 if(busy)reason='正在处理，请稍候。';
 else if(!inspection&&work.document.blocks.length)reason='正在检查文档。';
 else if(inspection?.issues.some(f=>f.severity==='error'))reason='请先处理需要修正的问题，再导出。';
 else if($('output-format').value!=='docx'){
  if(work.document.pdfUnsupported)reason='此文件包含暂不支持的 PDF 对象，可选择 Word 导出。';
  else if(previewRevision!==revision)reason='PDF 预览尚未完成，可刷新预览或选择 Word 导出。';
  else if(fontWarnings.length&&!$('font-ack').checked)reason='请确认本次使用备用字体，或选择 Word 导出。';
 }
 $('export-hint').textContent=reason;$('export-hint').hidden=!reason;
}
function setBusy(value){busy=value;document.body.classList.toggle('busy',value);updateButtons();}
function screen(name){
 currentScreen=name;work.screen=name;
 if(name!=='welcome')resumeTarget=name;work.resumeTarget=resumeTarget;
 for(const id of ['welcome','compose','workspace'])$(id).hidden=id!==name;
 $('home-open').hidden=name==='welcome';
 $('character-count').hidden=name!=='workspace';
 $('resume-section').hidden=!(resumeTarget==='compose'||work.document.blocks.length);
 $('resume-name').textContent=resumeTarget==='compose'?($('field-title').value||'尚未生成的新公文'):(work.name||'当前草稿');
 if(name==='welcome')$('status').textContent='准备就绪';
}
function goHome(){
 if(busy||currentScreen==='welcome')return;
 const saveDocument=currentScreen==='workspace'||currentScreen==='compose';
 screen('welcome');
 $('welcome-heading').focus();
 // Navigation never clears the document or waits on storage. A failed save
 // remains visible and the in-memory document is still available to resume.
 if(saveDocument)persist().catch(()=>{});
}
$('home-open').onclick=goHome;
$('resume-work').onclick=()=>{
 if(busy)return;
 const destination=resumeTarget==='compose'?'compose':'workspace';
 screen(destination);persist().catch(()=>{});if(destination==='workspace'&&previewRevision!==revision)preview();
 $(destination==='compose'?'field-title':$('edit-panel').hidden?'edit-tab':'preview-tab').focus();
};
function view(edit){
 work.editing=edit;$('workspace').classList.toggle('editing',edit);$('edit-panel').hidden=!edit;$('preview-panel').hidden=false;
 $('edit-tab').hidden=edit;$('edit-tab').setAttribute('aria-expanded',String(edit));$('preview-tab').hidden=!edit;
 $('view-heading').textContent=edit?'编辑与实时预览':'成品预览';
 (edit?$('editor-checks'):document.querySelector('.work-grid')).append($('inspector'));
}
function clearPreview(){composing=false;observer?.disconnect();pdfDocument=null;const old=pdfTask;pdfTask=null;old?.destroy().catch(()=>{});$('pdf-pages').replaceChildren();$('preview-panel').scrollTop=0;}
function snapshot(){history.push(clone(work));if(history.length>30)history.shift();}
function record(kind,id,before,after){work.actions ||= [];work.actions.push({time:new Date().toISOString(),kind,paragraphId:id,before,after});if(work.actions.length>1000)work.actions.shift();}
function persist(){
 clearTimeout(saveTimer);
 if(!api)return Promise.resolve();
 if(resumeTarget==='compose'&&work.form)work.form=readFields();
 if($('table-dialog').open)work.tableDraft=readTableDraft();
 if(!work.document.blocks.length&&!work.form)return saveChain.catch(()=>{});
 const state=clone(work),key=JSON.stringify(state);
 if(!saveFailed&&key===queued)return saveChain;
 queued=key;$('save-state').textContent='正在保存…';$('compose-save').textContent='正在保存…';
 saveChain=saveChain.catch(()=>{}).then(()=>api.SaveWorkspace(state)).then(()=>{
  if(key===queued)saveFailed=false;
  if(JSON.stringify(work)===key){$('save-state').textContent='已保存到本机';$('compose-save').textContent='新建草稿已保存到本机';}
 }).catch(e=>{if(key===queued)saveFailed=true;$('save-state').textContent='保存失败，可按 Ctrl+S 重试';$('compose-save').textContent='保存失败，可按 Ctrl+S 重试';error(e);throw e;});
 return saveChain;
}
function changed({render=false,resetIgnored=true}={}){$('save-state').textContent='尚有更改待保存';revision++;previewRequest++;inspection=null;previewRevision=-1;$('pdf-state').hidden=false;$('pdf-state').textContent=$('pdf-pages').children.length?'正在更新预览，下方暂为上一版…':'内容已变化，正在排版…';if(resetIgnored)work.ignored=[];$('export-success').hidden=true;$('file-name').textContent=work.name||'未命名公文';$('character-count').textContent=paragraphs().reduce((n,p)=>n+Array.from(p.text).length,0)+' 字';$('check-heading').textContent='正在检查…';$('editor-check-summary').textContent='检查与修改 · 正在核对';$('check-description').textContent='内容已变化，自动重新核对。';$('issue-list').replaceChildren();if(render)renderEditors();clearTimeout(saveTimer);saveTimer=setTimeout(()=>persist().catch(()=>{}),350);clearTimeout(checkTimer);checkTimer=setTimeout(check,300);clearTimeout(previewTimer);if(!composing)previewTimer=setTimeout(preview,450);updateButtons();}
const roleNames={agency:'发文机关标志',reference:'发文字号',recipient:'主送机关',title:'标题',body:'正文',heading:'一级标题',heading2:'二级标题',signature:'发文单位署名',date:'成文日期',imprint:'版记',roster:'参会人员','attachment-body':'附件正文','attachment-description':'附件说明',article:'条文正文'};
const editableRoles=['body','title','heading','heading2','signature','date'];
function renderEditors(){
 const fragment=document.createDocumentFragment();let index=0;selectedParagraph='';$('paragraph-role').disabled=true;
 function field(p,story=false){
  const label=document.createElement('label');label.className='paragraph-editor';label.id='edit-'+p.id;
  const title=document.createElement('span');title.textContent=`${roleNames[p.role]||'内容'} · 第 ${++index} 段${p.protected?'（含原有修订或对象，保留原样）':''}`;
  const input=document.createElement('textarea');input.value=p.text;input.disabled=Boolean(p.protected);input.rows=Math.max(2,Math.min(10,p.text.split('\n').length+Math.floor(p.text.length/60)));input.dataset.paragraph=p.id;
  input.onfocus=()=>{selectedParagraph=p.id;$('paragraph-role').disabled=Boolean(p.protected||p.prefix||story||!editableRoles.includes(p.role));$('paragraph-role').value=editableRoles.includes(p.role)?p.role:'body';input.dataset.before=p.text;input.beforeWork=clone(work);input.savedUndo=false;};
  input.oninput=()=>{if(!input.savedUndo&&input.beforeWork){history.push(input.beforeWork);if(history.length>30)history.shift();input.savedUndo=true;}p.text=input.value;if(p.role==='title')work.name=p.text||'未命名公文';changed();};
  input.addEventListener('compositionstart',()=>{composing=true;clearTimeout(previewTimer);});
  input.addEventListener('compositionend',()=>{composing=false;clearTimeout(previewTimer);previewTimer=setTimeout(preview,450);});
  input.onchange=()=>{if(input.dataset.before!==p.text){record('edit',p.id,input.dataset.before||'',p.text);persist().catch(()=>{});}};
  label.append(title,input);return label;
 }
 function removeButton(block,text){const button=document.createElement('button');button.type='button';button.className='subtle';button.textContent=text;button.onclick=()=>{if(busy)return;snapshot();work.document.blocks.splice(work.document.blocks.indexOf(block),1);changed({render:true});toast('已移除，可撤销。');};return button;}
 const headers=[...(work.document.firstHeader||[]),...(work.document.header||[])].filter(p=>p.text.trim());
 if(headers.length){const section=document.createElement('details'),title=document.createElement('summary');title.textContent='版头信息';section.append(title);for(const p of headers)section.append(field(p,true));fragment.append(section);}
 for(const block of work.document.blocks){
  if(block.paragraph){const p=block.paragraph;if(p.role==='letterhead-divider'||(!p.text.trim()&&(p.borderBottom||p.borderTop)))continue;const element=field(p);fragment.append(element);if(!work.document.sourceId&&['body','heading','heading2'].includes(p.role))fragment.append(removeButton(block,'删除此段'));}
  else{const wrapper=document.createElement('div');wrapper.className='editor-table-wrap';const table=document.createElement('table');table.className='editor-table';for(const row of block.table.rows){const tr=document.createElement('tr');for(const cell of row.cells){const td=document.createElement('td');td.colSpan=cell.span||1;for(const p of cell.paragraphs)td.append(field(p));tr.append(td);}table.append(tr);}wrapper.append(table);if(!work.document.sourceId)wrapper.append(removeButton(block,'删除此表格'));fragment.append(wrapper);}
 }
 $('blocks-editor').replaceChildren(fragment);$('add-paragraph').hidden=Boolean(work.document.sourceId);$('add-table').hidden=Boolean(work.document.sourceId);$('track-changes').disabled=!work.document.sourceId;
 const warnings=work.document.warnings||[];$('document-notice').hidden=!warnings.length;$('document-notice').textContent=warnings.join(' ');
}
function locate(id){view(true);const target=$('edit-'+id);if(!target)return;const details=target.closest('details');if(details)details.open=true;document.querySelectorAll('.paragraph-editor.focused').forEach(n=>n.classList.remove('focused'));target.classList.add('focused');target.scrollIntoView({block:'center'});target.querySelector('textarea')?.focus();}
async function check(){clearTimeout(checkTimer);if(!api||!work.document.blocks.length)return;const current=revision;try{const result=await api.InspectDocument(clone(work.document));if(current!==revision)return;inspection=result;renderIssues();}catch(e){if(current===revision){error(e);$('check-heading').textContent='检查未完成';$('check-description').textContent='内容仍保留，请根据提示修正。';}}updateButtons();}
function renderIssues(){if(!inspection)return;const ignored=new Set(work.ignored||[]),issues=inspection.issues.filter(f=>f.severity==='error'||!ignored.has(f.id));const required=issues.filter(f=>f.severity!=='suggestion'),optional=issues.length-required.length;$('editor-check-summary').textContent=required.length?`检查与修改 · ${required.length} 处需确认`:'检查与修改 · 无待处理项';$('check-heading').textContent=required.length?`${required.length} 处需要确认`:'可以继续出稿';$('check-description').textContent=required.length?'点击问题定位原文，确认后修改。':optional?`另有 ${optional} 条可选写法建议，不影响导出。`:'在已检查范围内未发现待处理项。';$('reset-ignored').hidden=!ignored.size;const list=$('issue-list');list.replaceChildren();const suggestions=document.createElement('details');suggestions.className='optional-suggestions';const suggestionTitle=document.createElement('summary');suggestionTitle.textContent=`可选写法建议（${optional}）`;suggestions.append(suggestionTitle);for(const issue of [...required,...issues.filter(f=>f.severity==='suggestion')]){const card=document.createElement('section');card.className='issue-card '+issue.severity;const heading=document.createElement('h3');heading.textContent=issue.rule.startsWith('number.')?'数字核对':issue.rule.startsWith('format.')?'格式核对':issue.rule.startsWith('style.')?'措辞建议':'写法核对';if(issue.paragraphId){const jump=document.createElement('button');jump.className='link';jump.textContent='定位原文';jump.onclick=()=>locate(issue.paragraphId);heading.append(jump);}const desc=document.createElement('p');desc.textContent=issue.message;card.append(heading,desc);if(issue.replacement){const change=document.createElement('div');change.className='change';const old=document.createElement('del');old.textContent=issue.original;const replacement=document.createElement('ins');replacement.textContent=issue.replacement;change.append(old,replacement);card.append(change);}const controls=document.createElement('div');controls.className='issue-controls';if(issue.replacement){const apply=document.createElement('button');apply.className='issue-action';apply.textContent='确认并修改';apply.onclick=async()=>{apply.disabled=true;const current=revision;try{const next=await api.ApplyDocumentFix(clone(work.document),issue.id);if(current!==revision)return;snapshot();record('fix',issue.paragraphId,issue.original,issue.replacement);work.document=next;changed({render:true});await check();}catch(e){error(e);}finally{apply.disabled=false;}};controls.append(apply);}else if(issue.paragraphId){const edit=document.createElement('button');edit.className='issue-action';edit.textContent='修改原文';edit.onclick=()=>locate(issue.paragraphId);controls.append(edit);}const ignore=document.createElement('button');ignore.className='subtle';ignore.textContent=issue.severity==='suggestion'?'保留原写法':'已核对，保留';ignore.onclick=()=>{work.ignored ||= [];work.ignored.push(issue.id);record('confirm',issue.paragraphId,issue.original,issue.original);renderIssues();persist().catch(()=>{});};if(issue.severity!=='error')controls.append(ignore);card.append(controls);const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='查看依据';const basis=document.createElement('p');basis.textContent=issue.basis;details.append(summary,basis);card.append(details);if(issue.severity==='suggestion')suggestions.append(card);else list.append(card);}if(optional)list.append(suggestions);if(currentScreen==='workspace')$('status').textContent=required.length?`还有 ${required.length} 处需确认`:'已完成当前范围的检查';updateButtons();}
async function preview(){
 clearTimeout(previewTimer);if(!api||!work.document.blocks.length||composing)return;
 const current=revision,request=++previewRequest;
 $('pdf-state').hidden=false;$('cancel-preview').hidden=false;$('pdf-state').textContent=$('pdf-pages').children.length?'正在更新预览，下方暂为上一版…':'正在生成 PDF 预览…';
 try{
  const result=await api.PreviewDocument(clone(work.document));if(current!==revision||request!==previewRequest)return;
  fontWarnings=result.warnings||[];$('font-notice').hidden=!fontWarnings.length;$('font-warning').textContent=fontWarnings.length?'部分公文字体缺失或不可嵌入。预览和新建 Word 使用内置备用字体；需要严格字体要求时，请安装对应的授权字体并重启软件。':'';
  await displayPDF(result.pdf,current,request);if(current!==revision||request!==previewRequest)return;
  previewRevision=current;$('pdf-state').hidden=true;$('character-count').textContent=result.pages+' 页';
 }catch(e){if(current!==revision||request!==previewRequest)return;$('pdf-state').textContent=($('pdf-pages').children.length?'预览未更新，下方仍为上一版。':'')+(String(e).includes('canceled')?'排版已取消，可点击“刷新预览”。':String(e));previewRevision=-1;}
 if(request===previewRequest){$('cancel-preview').hidden=true;updateButtons();}
}
async function displayPDF(base64,current,request){
 const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0)),task=pdfjs.getDocument({data:bytes,isEvalSupported:false,useSystemFonts:false});
 let committed=false;
 try{
  const pdf=await task.promise;if(current!==revision||request!==previewRequest)return;
  const area=$('pdf-pages'),scroll=$('preview-panel'),fragment=document.createDocumentFragment(),pages=[];
  for(let i=1;i<=pdf.numPages;i++){const page=document.createElement('div');page.className='pdf-page pdf-page-placeholder';page.dataset.page=String(i);page.setAttribute('aria-label',`PDF 第 ${i} 页`);const label=document.createElement('div');label.className='pdf-page-label';label.textContent=`第 ${i} 页 / 共 ${pdf.numPages} 页`;page.append(label);fragment.append(page);pages.push(page);}
  const oldPage=[...area.children].find(p=>p.getBoundingClientRect().bottom>scroll.getBoundingClientRect().top);
  const pageNumber=Math.min(Number(oldPage?.dataset.page)||1,pdf.numPages);
  await renderPage(pageNumber,pages[pageNumber-1],pdf,current,request,true);
  if(current!==revision||request!==previewRequest)return;
  const fraction=oldPage?Math.max(0,(scroll.getBoundingClientRect().top-oldPage.getBoundingClientRect().top)/oldPage.clientHeight):0;
  const old=pdfTask;observer?.disconnect();pdfTask=task;pdfDocument=pdf;committed=true;
  area.replaceChildren(fragment);$('pdf-state').hidden=true;
  const target=pages[pageNumber-1];scroll.scrollTop+=target.getBoundingClientRect().top-scroll.getBoundingClientRect().top+fraction*target.clientHeight;
  observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);renderPage(Number(entry.target.dataset.page),entry.target,pdf,current,request).catch(()=>{if(request===previewRequest){entry.target.textContent='预览页显示失败，请刷新预览。';previewRevision=-1;updateButtons();}});}},{root:scroll,rootMargin:'500px'});
  for(const page of pages)if(!page.querySelector('canvas'))observer.observe(page);
  old?.destroy().catch(()=>{});
 }finally{if(!committed)await task.destroy().catch(()=>{});}
}
async function renderPage(number,container,pdf,current,request,staging=false){
 const page=await pdf.getPage(number);if(current!==revision||request!==previewRequest||(!staging&&pdfDocument!==pdf))return;
 // A stable backing resolution stays sharp when the split view is opened or closed.
 const viewport=page.getViewport({scale:1.5}),canvas=document.createElement('canvas'),ratio=Math.min(devicePixelRatio,2);
 canvas.width=Math.floor(viewport.width*ratio);canvas.height=Math.floor(viewport.height*ratio);await page.render({canvasContext:canvas.getContext('2d'),viewport,transform:ratio===1?null:[ratio,0,0,ratio,0,0]}).promise;
 if(current!==revision||request!==previewRequest)return;const label=document.createElement('div');label.className='pdf-page-label';label.textContent=`第 ${number} 页 / 共 ${pdf.numPages} 页`;container.classList.remove('pdf-page-placeholder');container.replaceChildren(canvas,label);
}
async function replaceAllowed(){const hasForm=resumeTarget==='compose'&&($('field-title').value.trim()||$('field-body').value.trim());if(!work.document.blocks.length&&!hasForm)return true;const d=$('replace-dialog');d.showModal();return new Promise(resolve=>d.addEventListener('close',()=>resolve(d.returnValue==='replace'),{once:true}));}
async function load(next){if(!await replaceAllowed())return;clearPreview();work={ignored:[],actions:[],...next,form:null};history=[];$('font-ack').checked=false;$('font-notice').hidden=true;fontWarnings=[];$('error').hidden=true;screen('workspace');view(Boolean(work.document.pdfUnsupported));$('output-format').value=work.document.pdfUnsupported?'docx':prefs.outputFormat;changed({render:true});await check();await preview();}
async function importFile(path){if(!api||busy)return;setBusy(true);try{const next=path?await api.OpenWorkspacePath(path):await api.ImportWorkspace();if(next?.document?.blocks?.length)await load(next);}catch(e){error(e);}finally{setBusy(false);}}
function syncLetterhead(fromKind=false){
 const kind=$('field-kind').value;
 if(fromKind)$('field-letterhead').checked=kind!=='plain';
 $('field-agency').required=$('field-letterhead').checked;$('letterhead-fields').open=$('field-letterhead').checked;
 $('field-signer').closest('label').hidden=!['request','report'].includes(kind);$('roster-fields').hidden=kind!=='minutes';
}
function dateText(value){if(!value)return '';const [y,m,d]=value.split('-').map(Number);return `${y}年${m}月${d}日`;}
function readFields(){
 const kind=$('field-kind').value;
 return {kind,title:$('field-title').value,body:$('field-body').value,agency:$('field-agency').value,reference:$('field-reference').value,recipient:$('field-recipient').value,date:dateText($('field-date').value),signer:['request','report'].includes(kind)?$('field-signer').value:'',copyTo:$('field-copy').value,attendees:kind==='minutes'?$('field-attendees').value:'',absentees:kind==='minutes'?$('field-absentees').value:'',observers:kind==='minutes'?$('field-observers').value:'',attachments:$('field-attachments').value.split('\n').filter(Boolean),annexPages:$('field-annex-pages').checked,letterhead:$('field-letterhead').checked};
}
function fillFields(fields){
 $('compose-form').reset();for(const [id,key] of [['kind','kind'],['title','title'],['body','body'],['agency','agency'],['reference','reference'],['recipient','recipient'],['signer','signer'],['copy','copyTo'],['attendees','attendees'],['absentees','absentees'],['observers','observers']])$('field-'+id).value=fields[key]||'';
 const date=fields.date?.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);$('field-date').value=date?`${date[1]}-${date[2].padStart(2,'0')}-${date[3].padStart(2,'0')}`:'';
 $('field-attachments').value=(fields.attachments||[]).join('\n');$('field-annex-pages').checked=Boolean(fields.annexPages);$('field-letterhead').checked=Boolean(fields.letterhead);syncLetterhead();
}
function saveForm(){if(currentScreen!=='compose')return;work.form=readFields();$('compose-save').textContent='尚有更改待保存';clearTimeout(saveTimer);saveTimer=setTimeout(()=>persist().catch(()=>{}),350);}
$('field-kind').onchange=()=>{syncLetterhead(true);saveForm();};$('field-letterhead').onchange=()=>{syncLetterhead();saveForm();};
$('compose-form').addEventListener('input',saveForm);$('compose-form').addEventListener('change',saveForm);
async function compose(kind){
 if(busy||!await replaceAllowed())return;dismissError();
 const now=new Date();const fields={kind,agency:prefs.agency,reference:prefs.referencePrefix,date:`${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日`,letterhead:kind!=='plain'};
 fillFields(fields);work.form=readFields();screen('compose');persist().catch(()=>{});$('field-title').focus();
}
$('compose-form').onsubmit=async e=>{
 e.preventDefault();if(busy)return;const fields=readFields();work.form=fields;setBusy(true);dismissError();
 try{const model=await api.BuildDocument(fields);clearPreview();work={name:fields.title,document:model,fields,form:null,ignored:[],actions:[]};history=[];$('font-ack').checked=false;$('output-format').value=prefs.outputFormat;screen('workspace');view(false);changed({render:true});await check();await preview();}catch(err){error(err);persist().catch(()=>{});}finally{setBusy(false);}
};

$('import-home').onclick=()=>importFile();$('import-work').onclick=()=>importFile();$('paste-home').onclick=()=>compose('plain');$('template-home').onclick=()=>compose('notice');$('new-document').onclick=()=>compose('notice');$('compose-cancel').onclick=goHome;
$('sample-home').onclick=async()=>{if(busy)return;setBusy(true);try{const fields={kind:'notice',letterhead:true,title:'示例单位办公室关于开展办公环境整理工作的通知',agency:'示例单位办公室',reference:'办发【2026】第012号',date:'2026年10月08日',recipient:'各部门',body:'为营造整洁、有序的办公环境，现将有关事项通知如下。\n一、整理范围\n请各部门整理办公区域和纸质档案。\n二、工作安排\n请于本周五前完成整理。重要文件按规定归档。',attachments:[]};const model=await api.BuildDocument(fields);await load({name:'办公环境整理通知 · 示例',document:model,fields});}catch(e){error(e);}finally{setBusy(false);}};
$('paragraph-role').onchange=async()=>{if(!selectedParagraph||busy)return;setBusy(true);try{const next=await api.SetParagraphRole(clone(work.document),selectedParagraph,$('paragraph-role').value);snapshot();work.document=next;record('role',selectedParagraph,'',$('paragraph-role').value);changed({render:true});}catch(e){error(e);}finally{setBusy(false);}};$('preview-tab').onclick=()=>{view(false);persist().catch(()=>{});$('edit-tab').focus();};$('edit-tab').onclick=()=>{view(true);persist().catch(()=>{});const input=document.querySelector('#edit-panel textarea:not(:disabled)');input?.focus({preventScroll:true});};
$('undo').onclick=()=>{if(history.length){const editing=work.editing;work=history.pop();work.editing=editing;changed({render:true});}};$('refresh-preview').onclick=preview;$('cancel-preview').onclick=()=>{previewRequest++;previewRevision=-1;clearTimeout(previewTimer);api.CancelPreview();$('cancel-preview').hidden=true;$('pdf-state').hidden=false;$('pdf-state').textContent=($('pdf-pages').children.length?'下方仍为上一版。':'')+'排版已取消，可点击“刷新预览”。';updateButtons();};$('normalize-format').onclick=async()=>{if(busy)return;setBusy(true);try{const model=await api.NormalizeDocument(clone(work.document));snapshot();work.document=model;record('format','','','统一公文格式');changed({render:true});await check();await preview();}catch(e){error(e);}finally{setBusy(false);}};$('font-ack').onchange=updateButtons;$('output-format').onchange=()=>{updateButtons();savePreferences({...prefs,outputFormat:$('output-format').value}).catch(error);};$('reset-ignored').onclick=()=>{work.ignored=[];renderIssues();persist().catch(()=>{});};$('dismiss-error').onclick=dismissError;
$('export-open').onclick=async()=>{
 if(!exportReady())return;
 setBusy(true);$('export-success').hidden=true;
 const model=clone(work.document),format=$('output-format').value,tracked=$('track-changes').checked;
 try{
  await persist();const result=await api.ExportDocument(model,format,tracked);
  if(result.paths?.length){lastResult=result.paths;$('export-success-text').textContent=`已保存 ${lastResult.length} 份文件。`;$('export-success').hidden=false;$('status').textContent='导出完成，原件保留';}
  else $('status').textContent='已取消导出，草稿保留';
 }catch(e){error(e);}finally{setBusy(false);}
};
$('open-result').onclick=()=>api.OpenResult(lastResult[0],false).catch(error);$('open-folder').onclick=()=>api.OpenResult(lastResult[0],true).catch(error);
function insertBlock(block,anchor=selectedParagraph){
 let at=work.document.blocks.findIndex(b=>b.paragraph?.id===anchor||b.table?.rows.some(r=>r.cells.some(c=>c.paragraphs.some(p=>p.id===anchor))));
 if(at<0||['agency','reference','letterhead-divider','signature','date','imprint','roster'].includes(work.document.blocks[at]?.paragraph?.role)){
  at=work.document.blocks.findIndex(b=>['signature','date','imprint','roster'].includes(b.paragraph?.role));if(at<0)at=work.document.blocks.length;
 }else at++;
 snapshot();work.document.blocks.splice(at,0,block);changed({render:true});
 const id=block.paragraph?.id||block.table.rows[0].cells[0].paragraphs[0].id;locate(id);
}
$('add-paragraph').onclick=()=>{if(busy)return;insertBlock({paragraph:{id:'new-'+crypto.randomUUID(),text:'',role:'body',align:'both',font:'仿宋',size:16,line:10.21,indent:11.29,before:0,after:0}});};
function readTableDraft(){return {text:$('table-input').value,header:$('table-header').checked,threeLine:$('table-three-line').checked,anchor:tableAnchor};}
function showTableDraft(draft){tableAnchor=draft.anchor||'';$('table-input').value=draft.text||'';$('table-header').checked=draft.header;$('table-three-line').checked=draft.threeLine;$('table-dialog').showModal();$('table-input').focus();}
$('add-table').onclick=()=>{if(busy)return;tableAnchor=document.activeElement?.dataset.paragraph||selectedParagraph;$('table-form').reset();work.tableDraft=readTableDraft();$('table-dialog').showModal();$('table-input').focus();};
$('table-cancel').onclick=()=>{work.tableDraft=null;$('table-dialog').close();persist().catch(()=>{});};
$('table-dialog').addEventListener('cancel',()=>{work.tableDraft=null;setTimeout(()=>persist().catch(()=>{}),0);});
for(const event of ['input','change'])$('table-form').addEventListener(event,()=>{work.tableDraft=readTableDraft();clearTimeout(saveTimer);saveTimer=setTimeout(()=>persist().catch(()=>{}),350);});
$('table-form').onsubmit=e=>{
 e.preventDefault();const text=$('table-input').value.replace(/\r\n?/g,'\n').replace(/^\n+|\n+$/g,'');const rows=text.split('\n').map(row=>row.split('\t'));
 if(!rows.some(r=>r.some(c=>c.trim()))){error('请先粘贴表格内容，空白内容不能生成表格。');return;}
 if(rows.length>100||rows.some(r=>r.length>10)){error('一次最多添加 100 行、10 列，请拆分后添加。');return;}
 const columns=Math.max(...rows.map(r=>r.length));const table={widths:Array(columns).fill((work.document.page.width-work.document.page.left-work.document.page.right)/columns),borders:true,borderStyle:$('table-three-line').checked?'three-line':'grid',rows:rows.map((cells,i)=>({header:i===0&&$('table-header').checked,cells:Array.from({length:columns},(_,j)=>({span:1,paragraphs:[{id:'cell-'+crypto.randomUUID(),text:cells[j]||'',role:'body',align:'left',font:'仿宋',size:14,line:8,indent:0,before:0,after:0}]}))}))};
 work.tableDraft=null;$('table-dialog').close();dismissError();insertBlock({table},tableAnchor);
};
function savePreferences(next){
 preferenceChain=preferenceChain.catch(()=>{}).then(()=>api.SavePreferences(next)).then(()=>{prefs=next;});return preferenceChain;
}

$('clear-data-open').onclick=()=>{$('settings-dialog').close();$('clear-data-dialog').showModal();};
$('clear-data-confirm').onclick=async()=>{
 if(busy)return;setBusy(true);$('clear-data-confirm').disabled=true;
 try{clearTimeout(saveTimer);clearTimeout(checkTimer);clearTimeout(previewTimer);previewRequest++;revision++;await saveChain.catch(()=>{});await api.ClearLocalDrafts();work={name:'',document:{blocks:[]},form:null,ignored:[],actions:[]};history=[];resumeTarget=null;inspection=null;queued='';saveFailed=false;observer?.disconnect();await pdfTask?.destroy();pdfTask=null;pdfDocument=null;previewRevision=-1;lastResult=[];$('export-success').hidden=true;$('compose-form').reset();$('pdf-pages').replaceChildren();$('blocks-editor').replaceChildren();$('clear-data-dialog').close();dismissError();screen('welcome');toast('本地草稿已清除，原件和成品保留。');}catch(e){error(e);}finally{setBusy(false);$('clear-data-confirm').disabled=false;}
};
$('settings-open').onclick=async()=>{
 $('pref-agency').value=prefs.agency;$('pref-reference').value=prefs.referencePrefix;$('pref-update').checked=prefs.autoUpdate;$('pref-format').value=prefs.outputFormat;$('settings-dialog').showModal();
 try{const info=await api.UpdateStatus();$('update-status').textContent='版本 '+info.version+' · '+info.message;$('pref-update').closest('label').hidden=!info.configured;}catch{$('update-status').textContent='暂时无法读取版本信息，文件处理不受影响。';}
};
$('settings-close').onclick=()=>$('settings-dialog').close();
$('settings-form').onsubmit=async e=>{
 e.preventDefault();const button=$('settings-save');if(button.disabled)return;button.disabled=true;
 const next={...prefs,agency:$('pref-agency').value,referencePrefix:$('pref-reference').value,autoUpdate:$('pref-update').checked,outputFormat:$('pref-format').value};
 try{await savePreferences(next);$('output-format').value=next.outputFormat;updateButtons();$('settings-dialog').close();dismissError();toast('设置已保存');}catch(err){error(err);}finally{button.disabled=false;}
};

document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if($('settings-dialog').open){$('settings-form').requestSubmit();return;}persist().then(()=>toast('已保存')).catch(()=>{});}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='o'&&!document.querySelector('dialog[open]')){e.preventDefault();importFile();}});
document.addEventListener('dragover',e=>e.preventDefault());document.addEventListener('drop',e=>e.preventDefault());
export async function handleFileDrop(paths){
 if(busy)return;
 if(document.querySelector('dialog[open]')){error('请先完成或关闭当前对话框，再拖入文件。');return;}
 if(paths.length!==1){error('请每次拖入一份文件。');return;}
 await importFile(paths[0]);
}
if(window.runtime){window.runtime.EventsOn('job:busy',()=>error('正在导出，请等待完成后再退出。'));window.runtime.OnFileDrop((x,y,paths)=>handleFileDrop(paths),false);window.runtime.EventsOn('app:closing',async()=>{try{await preferenceChain.catch(()=>{});await persist();await api.Close();}catch{error('保存尚未完成，窗口已保留，请重试保存。');}});}
async function init(){
 setBusy(true);document.querySelector('main').inert=true;$('retry-start').hidden=true;
 if(!api){error('此界面只能在本地应用中使用。请重新启动公文整理。');return;}
 try{
  const [templates,settings,restored,fonts]=await Promise.all([api.Templates(),api.GetPreferences().catch(e=>{error(e);return prefs;}),api.GetWorkspace().catch(e=>{error(e);return {document:{blocks:[]}};}),api.Fonts()]);
  prefs=settings;$('field-kind').replaceChildren();for(const t of templates){const option=document.createElement('option');option.value=t.id;option.textContent=t.name;$('field-kind').append(option);}$('output-format').value=prefs.outputFormat;$('font-list').replaceChildren();
  for(const f of fonts){const line=document.createElement('p');line.textContent=`${f.name}：${f.available?'已安装':'使用内置备用字体'}`;$('font-list').append(line);}
  work={name:'',document:{blocks:[]},ignored:[],actions:[],...restored};work.document||={blocks:[]};work.document.blocks||=[];work.ignored||=[];work.actions||=[];
  const wanted=work.screen|| (work.document.blocks.length?'workspace':work.form?'compose':'welcome');resumeTarget=work.resumeTarget||(work.form?'compose':'workspace');
  if(work.form)fillFields(work.form);
  if(work.document.blocks.length){revision++;renderEditors();$('file-name').textContent=work.name||'未命名公文';$('save-state').textContent='已恢复本地草稿';view(Boolean(work.editing||work.document.pdfUnsupported));await check();}
  screen(wanted==='compose'&&!work.form?'welcome':wanted==='workspace'&&!work.document.blocks.length?'welcome':wanted);
  if(currentScreen==='workspace')await preview();
  await api.MarkHealthy();document.querySelector('main').inert=false;setBusy(false);
  if(work.tableDraft&&work.document.blocks.length){screen('workspace');view(true);showTableDraft(work.tableDraft);}
  window.appReady=true;
 }catch(e){error(e);$('retry-start').hidden=false;}
}
$('retry-start').onclick=()=>{dismissError();init();};

init();
