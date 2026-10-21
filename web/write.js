import {WriterEngine} from './write-engine.js';
import {DRAFT_KEY, names, blank, draft, validateDraft, validDate, fieldsForEngine, applySignature, textContent, safeName} from './write-model.js';
import {COMMON_KEY, LIBRARY_KEY, defaultCommon, validateCommon, commonFrom, freshFields, copyFields, validateLibrary, archiveDocument} from './write-library.js';
let pdfjsPromise, pdfjsAttempts=0;
async function previewLibrary() {
  if(!pdfjsPromise){
    pdfjsPromise=(async()=>{
      for(let attempt=0;attempt<2;attempt++){
        const url=new URL('./vendor/pdfjs/pdf.js',import.meta.url);
        if(pdfjsAttempts++)url.searchParams.set('retry',String(pdfjsAttempts));
        try{const library=await import(url.href);library.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.js',import.meta.url).href;return library;}catch(error){if(attempt===1)throw error;}
      }
    })().catch(()=>{pdfjsPromise=null;throw Error('暂时无法显示预览。请点击“重新生成预览”；已填写的内容不会改变。');});
  }
  return pdfjsPromise;
}

const $ = id => document.getElementById(id);
let fields = blank(), step = 0, revision = 0, readyRevision = -1;
let model, inspection, pdf, pageNumber = 1, currentRender;
let previewTimer, rendering = false, repeatPreview = false, exporting = false, fontBusy = false, hasLock = false, blockedSave = false;
let previewFailed=false,lastPreviewError='';
let previous, replacement, rawRecovery, fontDB, fontStore = {}, engineFonts = [];
let currentId=crypto.randomUUID(), common=defaultCommon(), library={version:1,items:[]}, libraryBroken=false, deleteId;
const confirmed = new Set();
const engine = new WriterEngine(() => fontStore);
const error = message => {
  $('global-error').textContent=message;$('global-error').hidden=false;
  if($('draft-dialog').open)$('draft-status').textContent=message;
  if(step===2){$('export-status').textContent=message;$('export-status').classList.add('failed');}
};
const clearError = () => {
  $('global-error').hidden=true;
  if($('export-status').classList.contains('failed')){$('export-status').textContent='';$('export-status').classList.remove('failed');}
};
const bytes = data => Uint8Array.from(atob(data), c => c.charCodeAt(0));
function base64(buffer) { let value = ''; for (let i=0;i<buffer.length;i+=32768) value += String.fromCharCode(...buffer.subarray(i,i+32768)); return btoa(value); }
function download(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], {type}));
  const link = document.createElement('a'); link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function readFields() {
  for (const name of names) fields[name] = $(name).value;
  fields.letterhead = $('letterhead').checked;
}
function fillFields() {
  for (const name of names) $(name).value = fields[name];
  $('letterhead').checked = fields.letterhead;
  $('agency-field').hidden = !fields.letterhead;
  $('letterhead').closest('details').open = Boolean(fields.letterhead || fields.reference);
  $('attachments').closest('details').open = Boolean(fields.attachments || fields.copyTo);
  $('body-count').textContent = fields.body.length.toLocaleString('zh-CN')+' 字';
}
function persist() {
  if (!hasLock || blockedSave) return;
  if (fields.date && !validDate(fields.date)) {
    $('save-status').textContent = '日期待修正，其他内容已保存';
    // Keep the prior valid date while retaining all other edits.
    try {
      let priorDate = '';
      try { priorDate = validateDraft(JSON.parse(localStorage.getItem(DRAFT_KEY))).fields.date; } catch {}
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft({...fields,date:priorDate},step,currentId)));
    } catch { $('save-status').textContent = '自动保存失败'; error('浏览器未能保存最新内容，请下载草稿后再关闭页面。'); }
    return;
  }
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft(fields,step,currentId)));
    window.writerBoot?.saved(currentId);
    $('save-status').textContent = '已保存到此浏览器';
  } catch {
    $('save-status').textContent = '自动保存失败';
    error('浏览器未能保存最新内容。请打开“我的文档”下载草稿，避免关闭页面后丢失。');
  }
}
function invalidate() {
  previewFailed=false;
  revision++; readyRevision = -1; confirmed.clear();
  $('export-status').textContent = ''; updateExport();
  $('preview-status').textContent = pdf ? '内容已修改，正在更新预览…' : '正在准备预览…';
}
function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => preview(), 650);
}
function fieldError(name, message) {
  const node = $(name+'-error');
  if (node) { node.textContent = message; node.hidden = !message; }
  $(name).setAttribute('aria-invalid', String(Boolean(message)));
}
function validate(target) {
  const errors = [];
  if (!fields.title.trim()) errors.push(['title','请填写一个文档标题。']);
  if (fields.letterhead && !fields.agency.trim()) errors.push(['agency','显示红头时，请填写发文单位。']);
  if (target >= 1 && !fields.body.trim()) errors.push(['body','请填写正文，也可以粘贴已有内容。']);
  if (fields.date && !validDate(fields.date) || $('date').validity.badInput) errors.push(['date','请选择 1900 年及以后的有效日期，或清空日期。']);
  for (const name of ['title','agency','body','date']) fieldError(name, errors.find(e=>e[0]===name)?.[1] || '');
  if (errors.length) {
    const name = errors[0][0]; showStep(['body','date'].includes(name)?1:0, false);
    if (name==='agency') $('agency').closest('details').open = true;
    $(name).focus(); return false;
  }
  return true;
}
function showStep(next, push = true) {
  step = next;
  document.querySelectorAll('[data-panel]').forEach(node => node.hidden = Number(node.dataset.panel)!==step);
  document.querySelectorAll('[data-step]').forEach(node => {
    if (Number(node.dataset.step)===step) node.setAttribute('aria-current','step'); else node.removeAttribute('aria-current');
  });
  if (push && location.hash !== '#step-'+(step+1)) history.pushState({writerStep:step}, '', '#step-'+(step+1));
  if (step===2) { renderSummary(); renderChecks(); }
  persist();
}
function navigate(next) {
  readFields();
  if (next > step && !validate(next===2?1:0)) return;
  showStep(next);
  document.querySelector(`[data-panel="${step}"] h1`).focus();
  if (step===2) preview();
}
window.addEventListener('popstate', () => {
  if(!window.writerReady)return;
  const next = Number(location.hash.match(/^#step-([123])$/)?.[1] || 1)-1;
  if (next===2 && !validate(1)) return;
  showStep(next, false);
});
function updateExport() {
  const format = document.querySelector('[name=format]:checked').value;
  $('export').textContent = exporting ? '正在生成文件…' : '下载 '+({docx:'Word',pdf:'PDF',txt:'纯文本'}[format]);
  const issues = inspection?.issues || [];
  const unresolved = issues.some(issue => issue.severity==='error' || (issue.severity==='review' && !confirmed.has(issue.id)));
  $('export').disabled = exporting || fontBusy || !hasLock || (format!=='txt' && (readyRevision!==revision || unresolved));
  $('export-guidance').textContent=exporting?'文件正在生成，请稍候。':fontBusy?'字体正在更新，完成预览后即可下载。':format!=='txt'&&previewFailed?'预览尚未完成，请点击“重新生成预览”。':format!=='txt'&&readyRevision!==revision?'预览正在更新，完成后即可下载。':format!=='txt'&&unresolved?'请先处理上方提醒，或确认保留原文，再下载文件。':'';
}
function renderSummary() {
  const rows = [
    ['标题',fields.title,0,'title'],['正文',fields.body.length.toLocaleString('zh-CN')+' 字',1,'body'],
    ['落款',fields.signature || '未填写',1,'signature'],['日期',fieldsForEngine(fields).date || '未填写',1,'date']
  ];
  $('review-summary').replaceChildren(...rows.map(([label,value,target,id])=>{
    const row = document.createElement('div'); row.className = 'review-row';
    const dt = document.createElement('dt'); dt.textContent = label;
    const dd = document.createElement('dd'); dd.textContent = value;
    const edit = document.createElement('button'); edit.type='button'; edit.className='quiet'; edit.textContent='修改';
    edit.setAttribute('aria-label','修改'+label); edit.onclick=()=>{showStep(target);$(id).focus();};
    row.append(dt,dd,edit); return row;
  }));
}
function issueTarget(issue) {
  const paragraph = model?.blocks?.find(block => block.paragraph?.id === issue.paragraphId)?.paragraph;
  const targets = {title:'title',agency:'agency',reference:'reference',recipient:'recipient',signature:'signature',date:'date'};
  return targets[paragraph?.role] || 'body';
}
function renderChecks() {
  $('check-list').replaceChildren();
  if (readyRevision!==revision) { $('checks-status').textContent='内容更新后会重新核对。'; return; }
  const issues = inspection?.issues || [];
  $('checks-status').textContent = issues.length ? '请逐项核对提醒；事实、名称和数字仍需你确认。' : '未发现需要处理的格式问题。请自行核对事实、名称和数字。';
  for (const issue of issues) {
    const item = document.createElement('div'); item.className='review-issue';
    const text = document.createElement('p'); text.textContent=issue.message;
    const edit = document.createElement('button'); edit.type='button'; edit.className='secondary'; edit.textContent='返回修改';
    edit.onclick=()=>{const target=issueTarget(issue);showStep(['title','agency','reference','recipient'].includes(target)?0:1);const details=$(target).closest('details');if(details)details.open=true;$(target).focus();};
    item.append(text,edit);
    if (issue.severity==='review') {
      const label=document.createElement('label'); label.className='check';
      const check=document.createElement('input'); check.type='checkbox'; check.checked=confirmed.has(issue.id);
      check.onchange=()=>{check.checked?confirmed.add(issue.id):confirmed.delete(issue.id);updateExport();};
      label.append(check,document.createTextNode('我已核对，此处保留原文')); item.append(label);
    }
    $('check-list').append(item);
  }
  updateExport();
}
async function preview() {
  clearTimeout(previewTimer);
  if (fontBusy || fields.date && !validDate(fields.date)) return;
  if (!fields.title.trim()) {
    $('preview-status').textContent='填写标题后自动更新';
    if (pdf) $('preview-status').textContent='标题尚未填写，下方为上一版';
    return;
  }
  if (readyRevision===revision) return;
  if (rendering) { repeatPreview=true; return; }
  rendering=true;previewFailed=false;updateExport(); const requested=revision; const snapshot={...fields};
  $('preview-canvas').setAttribute('aria-busy','true'); $('preview-status').textContent='正在排版…';
  try {
    const nextModel=applySignature(await engine.call('BuildDocument',fieldsForEngine(snapshot,true)),snapshot);
    const result=await engine.call('PreviewDocument',nextModel);
    const checked=await engine.call('InspectDocument',nextModel);
    if(requested!==revision) {repeatPreview=true;return;}
    const pdfjs=await previewLibrary();
    const nextPDF=await pdfjs.getDocument({data:bytes(result.pdf),isEvalSupported:false,useSystemFonts:false}).promise;
    if(requested!==revision){await nextPDF.destroy();repeatPreview=true;return;}
    currentRender?.cancel(); await pdf?.destroy(); pdf=nextPDF; model=nextModel; inspection=checked;
    pageNumber=Math.min(pageNumber,pdf.numPages);
    await renderPage();
    if(requested!==revision){repeatPreview=true;return;}
    readyRevision=requested;
    if(lastPreviewError&&$('global-error').textContent===lastPreviewError)clearError();lastPreviewError='';
    const incomplete=!snapshot.body.trim() || (snapshot.letterhead&&!snapshot.agency.trim());
    $('preview-status').textContent=incomplete?'填写中 · 待填内容仅用于预览':'已更新 · '+pdf.numPages+' 页';
    renderChecks(); updateExport();
  } catch(e) {
    if(requested===revision) {
      previewFailed=true;lastPreviewError=e.message;
      $('preview-status').textContent=pdf?'更新失败，下方为上一版':'预览暂未生成';
      error(e.message);
    }
  } finally {
    rendering=false;updateExport(); $('preview-canvas').setAttribute('aria-busy','false');
    if(repeatPreview){repeatPreview=false;schedulePreview();}
  }
}
async function renderPage() {
  if(!pdf)return;
  currentRender?.cancel();
  const source=pdf, number=pageNumber;
  const page=await source.getPage(number);
  const viewport=page.getViewport({scale:1.35});
  const wrapper=document.createElement('div'); wrapper.className='pdf-page';
  const canvas=document.createElement('canvas'); canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
  canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`文档第 ${number} 页，正文可在填写区阅读`);
  wrapper.append(canvas);
  const render=currentRender=page.render({canvasContext:canvas.getContext('2d'),viewport});
  try{await render.promise;}catch(e){if(e.name==='RenderingCancelledException')return;throw e;}
  if(source!==pdf||number!==pageNumber)return;
  $('pdf-pages').replaceChildren(wrapper);$('preview-empty').hidden=true;
  $('page-count').textContent=`${number} / ${pdf.numPages} 页`;
  $('prev-page').disabled=number<=1;$('next-page').disabled=number>=pdf.numPages;
}
async function exportFile() {
  if(exporting||fontBusy||!hasLock)return;
  readFields();if(!validate(1))return;
  const format=document.querySelector('[name=format]:checked').value;
  if(format!=='txt'&&readyRevision!==revision){error('预览正在更新，请稍后下载。');return;}
  exporting=true;$('editable').disabled=true;updateExport();clearError();
  try {
    if(format==='txt') download(safeName(fields.title)+'.txt','\ufeff'+textContent(fields),'text/plain;charset=utf-8');
    else {
      const checked=structuredClone(model); checked.confirmedIssues=[...confirmed];
      const file=await engine.call('ExportDocument',checked,format,false,null);
      download(file.name,bytes(file.data),format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    }
    $('export-status').textContent='文件已生成并开始下载，可在浏览器下载列表中查看。';
  }catch(e){error(e.message);}finally{exporting=false;$('editable').disabled=!hasLock;updateExport();}
}
function saveDraft() {
  readFields();
  if(fields.date&&!validDate(fields.date)){error('请先修正日期，再下载可继续填写的草稿。');return;}
  download(safeName(fields.title)+'.gongwen.json',JSON.stringify(draft(fields,step,currentId),null,2),'application/json');
  $('draft-status').textContent='草稿已开始下载。打开这份文件即可继续填写。';
}
function requestReplace(next, direct=false) {
  if(!hasLock){error('另一标签页正在编辑，请关闭它后刷新本页。');return;}
  if(blockedSave&&!rawRecovery){error('原有文档尚未成功归档，切换已取消。请先下载当前草稿，腾出本地空间后刷新此页重试恢复。');return;}
  if(exporting||fontBusy){error('请等待当前文件或字体处理完成，再切换文档。');return;}
  if(fields.date&&!validDate(fields.date) || $('date').validity.badInput) {
    $('draft-dialog').close();$('replace-dialog').close();
    fieldError('date','请先修正或清空日期，再开始新的文档，以便完整保留恢复副本。');
    showStep(1);$('date').focus();return;
  }
  replacement=next;
  if(direct)return replace(next);
  if(names.some(name=>fields[name]) || rawRecovery) $('replace-dialog').showModal(); else replace(next);
}
function replace(next) {
  const prior=draft(fields,step,currentId);
  try{
    if(libraryBroken)throw Error('最近文档列表无法读取，切换已取消。请在“我的文档”下载恢复数据和当前草稿。');
    const defaults=freshFields(common);
    const onlyDefaults=Object.keys(fields).every(name=>fields[name]===defaults[name]);
    const nextLibrary=onlyDefaults?library:archiveDocument(library,currentId,prior);
    localStorage.setItem(LIBRARY_KEY,JSON.stringify(nextLibrary));library=nextLibrary;
    localStorage.setItem(DRAFT_KEY+'-previous',rawRecovery || JSON.stringify(prior));
    // Commit new current state before changing the visible editor.
    next={...next,id:next.id || crypto.randomUUID()};
    localStorage.setItem(DRAFT_KEY,JSON.stringify(next));
  }
  catch(e){error(e.name==='QuotaExceededError'?'浏览器空间不足，切换已取消。请先下载当前草稿并清理不再需要的旧稿。':e.message);return;}
  previous=prior;currentId=next.id;
  fields={...next.fields}; blockedSave=false;rawRecovery=null;
  for(const name of ['title','agency','body','date'])fieldError(name,'');
  currentRender?.cancel();pdf?.destroy().catch(()=>{});pdf=null;model=null;inspection=null;pageNumber=1;
  $('pdf-pages').replaceChildren();$('preview-empty').hidden=false;$('page-count').textContent='A4 纸张';
  $('prev-page').disabled=true;$('next-page').disabled=true;
  fillFields();invalidate();showStep(next.step || 0);persist();schedulePreview();
  $('undo-replace').hidden=false;
  $('replace-dialog').close();$('draft-dialog').close();
  clearError();
  $('reuse-status').textContent=next.reuseMessage || (prior.fields.title.trim()||prior.fields.body.trim()?'上一份已保存在“我的文档”。可以随时切换回来。':'已打开文档，修改会自动保存。');
  $('reuse-status').hidden=false;
  document.querySelector(`[data-panel="${step}"] h1`).focus();
  return true;
}
function saveCommon(next) {
  if(!hasLock)throw Error('请关闭正在编辑的另一标签页后重试。');
  const checked=validateCommon(next);
  if(checked.fields.letterhead&&!checked.fields.agency.trim())throw Error('默认显示红头时，请填写常用发文单位。');
  localStorage.setItem(COMMON_KEY,JSON.stringify(checked));common=checked;
}
function populateCommon(next=common) {
  for(const name of ['recipient','agency','signature','copyTo'])$('common-'+name).value=next.fields[name];
  $('common-letterhead').checked=next.fields.letterhead;$('common-format').value=next.format;
}
function newDocument() {
  const hasCommon=Object.values(common.fields).some(Boolean);
  const next={...draft(freshFields(common),0),reuseMessage:hasCommon?'已带入常用信息。标题、正文、日期和文号请按本次内容填写。':'已新建空白文档，填写标题即可开始。已有旧稿会保留在“我的文档”。'};
  if(requestReplace(next,true)){document.querySelector(`[name=format][value="${common.format}"]`).checked=true;updateExport();}
}
function renderLibrary() {
  const root=$('recent-documents');root.replaceChildren();
  $('copy-current').disabled=!fields.title.trim()&&!fields.body.trim();
  const current=document.createElement('p');current.className='current-document';current.textContent='正在编辑：'+(fields.title || '未命名文档');root.append(current);
  const items=library.items.filter(item=>item.id!==currentId);
  if(!items.length){const empty=document.createElement('p');empty.className='hint';empty.textContent='新建或打开另一份文档后，上一份会出现在这里。';root.append(empty);}
  for(const item of items){
    const row=document.createElement('div');row.className='recent-document';
    const heading=document.createElement('h3');heading.textContent=item.document.fields.title || '未命名文档';
    const meta=document.createElement('p');meta.className='hint';meta.textContent=new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(item.savedAt))+' · '+item.document.fields.body.length.toLocaleString('zh-CN')+' 字';
    const actions=document.createElement('div');actions.className='recent-actions';
    const action=(text,fn)=>{const b=document.createElement('button');b.type='button';b.className='quiet';b.textContent=text;b.onclick=fn;actions.append(b);};
    action('继续编辑',()=>requestReplace({...item.document,id:item.id},true));
    action('复制新稿',()=>requestReplace({...draft(copyFields(item.document.fields),0),reuseMessage:'已复制旧稿，日期和文号已清空。请核对正文中的时间、数字和事实。'},true));
    action('下载草稿',()=>download(safeName(item.document.fields.title)+'.gongwen.json',JSON.stringify(item.document,null,2),'application/json'));
    action('删除',()=>{deleteId=item.id;$('delete-document-name').textContent=heading.textContent;$('delete-document-dialog').showModal();});
    row.append(heading,meta,actions);root.append(row);
  }
}
async function openFontDB() {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('gongwen-writer-fonts',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('fonts');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
}
async function writeFonts(value) {
  if(!fontDB) throw Error('字体存储不可用，请允许浏览器本地存储后重试。');
  return new Promise((resolve,reject)=>{
    const transaction=fontDB.transaction('fonts','readwrite');
    transaction.objectStore('fonts').put(value,'custom');
    transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error || Error('字体保存中断'));
  });
}
async function showFonts() {
  engineFonts=await engine.call('Fonts');
  $('font-status').replaceChildren(...engineFonts.map(font=>{
    const p=document.createElement('p');p.textContent=font.name+'：'+(fontStore[font.name]?'已选择授权字体':'内置备用字体');return p;
  }));
}
async function changeFont(file, reset=false) {
  if(!hasLock||fontBusy||exporting||(!reset&&!file))return;
  fontBusy=true;invalidate();
  const role=$('font-role').value;
  $('font-message').textContent='正在处理字体…';$('font-reset').disabled=true;$('font-file').disabled=true;$('font-file-open').disabled=true;
  try {
    const next={...fontStore};
    if(reset)delete next[role];
    else {
      if(!file)return;
      if(file.size>32*1024*1024)throw Error('字体文件超过 32 MB，请选择较小的字体文件。');
      const data=base64(new Uint8Array(await file.arrayBuffer()));
      // Register validates font bytes in the shared Go engine; restart restores old fonts on failure.
      await engine.call('RegisterFont',role,data);next[role]=data;
    }
    await writeFonts(next);fontStore=next;
    engine.reset();await showFonts();
    $('font-message').textContent='字体已保存，预览将重新排版。';
  }catch(e){engine.reset();$('font-message').textContent=e.message;}
  finally{fontBusy=false;invalidate();schedulePreview();$('font-reset').disabled=false;$('font-file').disabled=false;$('font-file-open').disabled=false;$('font-file').value='';}
}
async function boot() {
  try {
    if(!navigator.locks)throw Error('当前浏览器不支持安全草稿保存，请使用新版 Edge、Chrome、Firefox 或 Safari。');
    hasLock=await new Promise((resolve,reject)=>navigator.locks.request(DRAFT_KEY,{ifAvailable:true},lock=>{
      resolve(Boolean(lock));if(lock)return new Promise(()=>{});
    }).catch(reject));
    if(!hasLock)throw Error('另一标签页正在编辑这份草稿。请关闭它后刷新本页，以免相互覆盖。');
    const savedCommon=localStorage.getItem(COMMON_KEY);
    if(savedCommon)try{common=validateCommon(JSON.parse(savedCommon));}catch(e){error(e.message);}
    const savedLibrary=localStorage.getItem(LIBRARY_KEY);
    if(savedLibrary)try{library=validateLibrary(JSON.parse(savedLibrary));}catch(e){libraryBroken=true;error(e.message);$('rescue-draft').hidden=false;}
    const raw=localStorage.getItem(DRAFT_KEY);
    if(raw) {
      try {const restored=validateDraft(JSON.parse(raw));fields=restored.fields;step=restored.step;currentId=restored.id || currentId;}
      catch {rawRecovery=raw;blockedSave=true;error('保存的草稿无法读取，原始数据已保留。请在“我的文档”下载原始恢复数据，或新写一份文档。');$('rescue-draft').hidden=false;}
    }else fields=freshFields(common);
    const old=localStorage.getItem(DRAFT_KEY+'-previous');
    if(old)try{previous=validateDraft(JSON.parse(old));$('undo-replace').hidden=false;}catch{/* Preserve raw prior data. */}
  }catch(e){error(e.message);hasLock=false;}
  $('editable').disabled=!hasLock;
  $('new-document').disabled=!hasLock;$('load-draft').disabled=!hasLock;$('load-draft-open').disabled=!hasLock;
  try {
    fontDB=await openFontDB();
    fontStore=await new Promise((resolve,reject)=>{
      const request=fontDB.transaction('fonts').objectStore('fonts').get('custom');
      request.onsuccess=()=>resolve(request.result || {});request.onerror=()=>reject(request.error);
    });
  }catch{error('字体存储不可用，当前使用内置字体。文档仍可填写与导出。');}
  // Inputs may arrive while module imports or IndexedDB are still loading.
  // Merge only the fields actually edited, rather than hydrating over them.
  const pending=window.writerBoot?.pending();
  const recoveries=window.writerBoot?.recoveries?.() || [];
  if(recoveries.length&&hasLock&&!libraryBroken&&!blockedSave){
    try{
      let archived=library;const seen=new Set();
      for(const record of recoveries){
        if(seen.has(record.id))continue;seen.add(record.id);
        if(pending&&JSON.stringify(record.value.fields)===JSON.stringify(pending.fields))continue;
        archived=archiveDocument(archived,record.id,draft(record.value.fields,record.value.step,record.id));
      }
      localStorage.setItem(LIBRARY_KEY,JSON.stringify(archived));library=archived;
      window.writerBoot.acknowledge(recoveries);
    }catch{blockedSave=true;error('还有未整理的已保存文档。请先下载当前草稿，在“我的文档”腾出空间后重新打开。原内容仍保留。');}
  }
  if(pending?.fields&&Array.isArray(pending.touched)){
    const independent=pending.source==='legacy-submit'||pending.source==='durable-recovery'||pending.baseId&&pending.baseId!==currentId;
    if(independent){
      try{
        if(!hasLock||libraryBroken||blockedSave)throw Error('recovery archive unavailable');
        const archived=archiveDocument(library,currentId,draft(fields,step,currentId));
        localStorage.setItem(LIBRARY_KEY,JSON.stringify(archived));library=archived;
      }catch{blockedSave=true;error('未完成的填写已恢复在此页，原有草稿没有覆盖。请先下载当前草稿，再处理本地存储问题。');}
      fields=blank();currentId=crypto.randomUUID();
    }
    for(const name of independent?[...names,'letterhead']:pending.touched){
      if(names.includes(name)&&typeof pending.fields[name]==='string')fields[name]=pending.fields[name];
      if(name==='letterhead'&&typeof pending.fields[name]==='boolean')fields[name]=pending.fields[name];
    }
    if(Number.isInteger(pending.step)&&pending.step>=0&&pending.step<=2)step=pending.step;
  }
  fillFields();showStep(step,false);
  document.querySelector(`[name=format][value="${common.format}"]`).checked=true;updateExport();
  const restoredSubmission=pending?.source==='legacy-submit'&&!window.writerBoot?.pending();
  history.replaceState({writerStep:step},'', location.pathname+(restoredSubmission?'':location.search)+'#step-'+(step+1));
  window.writerReady=true;
  window.writerBoot?.complete();
  if(fields.title.trim())preview();
}

$('writer-form').addEventListener('input',event=>{
  if(!window.writerReady || !hasLock || event.target.name==='format')return;
  readFields();$('agency-field').hidden=!fields.letterhead;
  $('body-count').textContent=fields.body.length.toLocaleString('zh-CN')+' 字';
  if(event.target.id==='title'&&fields.title.trim())fieldError('title','');
  if(event.target.id==='body'&&fields.body.trim())fieldError('body','');
  if(event.target.id==='agency'&&fields.agency.trim())fieldError('agency','');
  if(event.target.id==='date')fieldError('date',fields.date&&!validDate(fields.date)?'请选择 1900 年及以后的有效日期，或清空日期。':'');
  invalidate();persist();if(!event.isComposing)schedulePreview();
});
$('body').addEventListener('compositionend',()=>{if(window.writerReady){readFields();persist();schedulePreview();}});
$('writer-form').addEventListener('submit',event=>{event.preventDefault();if(step<2)navigate(step+1);});
document.querySelectorAll('[data-next]').forEach(button=>button.onclick=()=>navigate(Number(button.dataset.next)));
document.querySelectorAll('[data-step]').forEach(button=>button.onclick=()=>navigate(Number(button.dataset.step)));
document.querySelectorAll('[data-back]').forEach(button=>button.onclick=()=>navigate(Number(button.dataset.back)));
document.querySelectorAll('[name=format]').forEach(input=>input.onchange=updateExport);
document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>$(button.dataset.close).close());
$('export').onclick=exportFile;
$('refresh-preview').onclick=()=>{clearError();readyRevision=-1;preview();};
$('prev-page').onclick=()=>{if(pageNumber>1){pageNumber--;renderPage().catch(e=>error(e.message));}};
$('next-page').onclick=()=>{if(pdf&&pageNumber<pdf.numPages){pageNumber++;renderPage().catch(e=>error(e.message));}};
$('draft-menu').onclick=()=>{renderLibrary();$('draft-dialog').showModal();};
$('save-draft').onclick=saveDraft;
if($('save-document'))$('save-document').onclick=()=>{readFields();persist();};
$('load-draft-open').onclick=()=>$('load-draft').click();
$('backup-before-replace').onclick=saveDraft;
$('new-document').onclick=newDocument;
$('copy-current').onclick=()=>requestReplace({...draft(copyFields(fields),0),reuseMessage:'已复制旧稿，日期和文号已清空。请核对正文中的时间、数字和事实。'},true);
$('confirm-replace').onclick=()=>replace(replacement);
$('undo-replace').onclick=()=>{if(previous)requestReplace(previous);};
$('rescue-draft').onclick=()=>download('公文-恢复数据.json',JSON.stringify({current:rawRecovery || localStorage.getItem(DRAFT_KEY),previous:localStorage.getItem(DRAFT_KEY+'-previous'),library:localStorage.getItem(LIBRARY_KEY),common:localStorage.getItem(COMMON_KEY)},null,2),'application/json');
$('delete-document-confirm').onclick=()=>{
  if(!hasLock||deleteId===currentId)return;
  try{const next={version:1,items:library.items.filter(item=>item.id!==deleteId)};localStorage.setItem(LIBRARY_KEY,JSON.stringify(next));library=next;$('delete-document-dialog').close();renderLibrary();}
  catch{$('delete-document-name').textContent='未能删除，原文档仍保留。请重试。';}
};
$('common-open').onclick=()=>{populateCommon();$('common-message').textContent='';$('common-dialog').showModal();};
$('common-from-current').onclick=()=>populateCommon(commonFrom(fields,document.querySelector('[name=format]:checked').value));
$('common-form').onsubmit=event=>{
  event.preventDefault();
  const values={...blank()};
  for(const name of ['recipient','agency','signature','copyTo'])values[name]=$('common-'+name).value;
  values.letterhead=$('common-letterhead').checked;
  try{saveCommon(commonFrom(values,$('common-format').value));$('common-message').textContent='已保存，下次新建自动带入。';}
  catch(e){$('common-message').textContent=e.message;}
};
$('common-clear').onclick=()=>{try{saveCommon(defaultCommon());populateCommon();$('common-message').textContent='已清空常用信息，当前文档不变。';}catch(e){$('common-message').textContent=e.message;}};
$('remember-common').onclick=()=>{
  readFields();
  try{saveCommon(commonFrom(fields,document.querySelector('[name=format]:checked').value));$('common-hint').textContent='已记住，下次新建自动带入。可在顶部“常用设置”修改或清空。';}
  catch(e){$('common-hint').textContent='未能保存：'+e.message;}
};
$('use-today').onclick=()=>{
  const now=new Date();$('date').value=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
  $('date').dispatchEvent(new Event('input',{bubbles:true}));
};
$('jump-preview').onclick=()=>{$('preview-heading').scrollIntoView({block:'start'});$('preview-heading').focus({preventScroll:true});};
$('back-writing').onclick=()=>{const heading=document.querySelector(`[data-panel="${step}"] h1`);heading.scrollIntoView({block:'start'});heading.focus({preventScroll:true});};
$('zoom-preview').onclick=()=>{const zoomed=$('preview-canvas').classList.toggle('zoomed');$('zoom-preview').setAttribute('aria-pressed',String(zoomed));$('zoom-preview').textContent=zoomed?'适合屏幕':'放大预览';};
new MutationObserver(()=>$('mobile-save').textContent=$('save-status').textContent).observe($('save-status'),{childList:true,subtree:true,characterData:true});
$('load-draft').onchange=async event=>{
  const file=event.target.files[0];event.target.value='';if(!file)return;
  try {
    if(file.size>1024*1024)throw Error('草稿文件超过 1 MB，请选择本工具下载的填写草稿。');
    const next=validateDraft(JSON.parse(await file.text()));
    // A downloaded snapshot is a new local copy. Reusing its ID can hide and later
    // overwrite a newer version that is already archived in this browser.
    requestReplace({...next,id:crypto.randomUUID()});
  }catch(e){$('draft-status').textContent=e instanceof SyntaxError?'草稿不是有效的 JSON 文件，当前内容未改变。':e.message;}
};
$('settings-open').onclick=()=>{$('settings-dialog').showModal();showFonts().catch(e=>$('font-message').textContent=e.message);};
$('font-file').onchange=event=>changeFont(event.target.files[0]);
$('font-file-open').onclick=()=>$('font-file').click();
$('font-reset').onclick=()=>changeFont(null,true);
window.addEventListener('beforeunload',event=>{
  if($('save-status').textContent==='自动保存失败' || blockedSave&&names.some(name=>fields[name]) || fields.date&&!validDate(fields.date)){event.preventDefault();event.returnValue='';}
});
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='s'){event.preventDefault();if(window.writerReady)persist();}});
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
boot().catch(e=>error(e.message));
