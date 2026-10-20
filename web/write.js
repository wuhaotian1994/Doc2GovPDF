import {WriterEngine} from './write-engine.js';
import {DRAFT_KEY, names, blank, draft, validateDraft, validDate, fieldsForEngine, applySignature, textContent, safeName} from './write-model.js';
import * as pdfjs from './vendor/pdfjs/pdf.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.mjs', import.meta.url).href;

const $ = id => document.getElementById(id);
let fields = blank(), step = 0, revision = 0, readyRevision = -1;
let model, inspection, pdf, pageNumber = 1, currentRender;
let previewTimer, rendering = false, repeatPreview = false, exporting = false, fontBusy = false, hasLock = false, blockedSave = false;
let previous, replacement, rawRecovery, fontDB, fontStore = {}, engineFonts = [];
const confirmed = new Set();
const engine = new WriterEngine(() => fontStore);
const error = message => { $('global-error').textContent = message; $('global-error').hidden = false; };
const clearError = () => { $('global-error').hidden = true; };
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
  if (fields.letterhead || fields.reference) $('letterhead').closest('details').open = true;
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
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft({...fields,date:priorDate},step)));
    } catch { $('save-status').textContent = '自动保存失败'; error('浏览器未能保存最新内容，请下载草稿后再关闭页面。'); }
    return;
  }
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft(fields,step)));
    $('save-status').textContent = '已保存到此浏览器';
  } catch {
    $('save-status').textContent = '自动保存失败';
    error('浏览器未能保存最新内容。请打开“我的草稿”下载草稿，避免关闭页面后丢失。');
  }
}
function invalidate() {
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
  rendering=true; const requested=revision; const snapshot={...fields};
  $('preview-canvas').setAttribute('aria-busy','true'); $('preview-status').textContent='正在排版…';
  try {
    const nextModel=applySignature(await engine.call('BuildDocument',fieldsForEngine(snapshot,true)),snapshot);
    const result=await engine.call('PreviewDocument',nextModel);
    const checked=await engine.call('InspectDocument',nextModel);
    if(requested!==revision) {repeatPreview=true;return;}
    const nextPDF=await pdfjs.getDocument({data:bytes(result.pdf),isEvalSupported:false,useSystemFonts:false}).promise;
    if(requested!==revision){await nextPDF.destroy();repeatPreview=true;return;}
    currentRender?.cancel(); await pdf?.destroy(); pdf=nextPDF; model=nextModel; inspection=checked;
    pageNumber=Math.min(pageNumber,pdf.numPages);
    await renderPage();
    if(requested!==revision){repeatPreview=true;return;}
    readyRevision=requested;
    const incomplete=!snapshot.body.trim() || (snapshot.letterhead&&!snapshot.agency.trim());
    $('preview-status').textContent=incomplete?'填写中 · 待填内容仅用于预览':'已更新 · '+pdf.numPages+' 页';
    renderChecks(); updateExport();
  } catch(e) {
    if(requested===revision) {
      $('preview-status').textContent=pdf?'更新失败，下方为上一版':'预览暂未生成';
      error(e.message);
    }
  } finally {
    rendering=false; $('preview-canvas').setAttribute('aria-busy','false');
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
  download(safeName(fields.title)+'.gongwen.json',JSON.stringify(draft(fields,step),null,2),'application/json');
  $('draft-status').textContent='草稿已开始下载。打开这份文件即可继续填写。';
}
function requestReplace(next) {
  if(!hasLock){error('另一标签页正在编辑，请关闭它后刷新本页。');return;}
  if(fields.date&&!validDate(fields.date) || $('date').validity.badInput) {
    $('draft-dialog').close();$('replace-dialog').close();
    fieldError('date','请先修正或清空日期，再开始新的文档，以便完整保留恢复副本。');
    showStep(1);$('date').focus();return;
  }
  replacement=next;
  if(names.some(name=>fields[name]) || rawRecovery) $('replace-dialog').showModal(); else replace(next);
}
function replace(next) {
  previous=draft(fields,step);
  try{localStorage.setItem(DRAFT_KEY+'-previous',rawRecovery || JSON.stringify(previous));}
  catch{error('浏览器无法保留上一份草稿，替换已取消。请先下载当前草稿。');return;}
  fields={...next.fields}; blockedSave=false;rawRecovery=null;
  currentRender?.cancel();pdf?.destroy().catch(()=>{});pdf=null;model=null;inspection=null;pageNumber=1;
  $('pdf-pages').replaceChildren();$('preview-empty').hidden=false;$('page-count').textContent='A4 纸张';
  $('prev-page').disabled=true;$('next-page').disabled=true;
  fillFields();invalidate();showStep(next.step || 0);persist();schedulePreview();
  $('undo-replace').hidden=false;
  $('replace-dialog').close();$('draft-dialog').close();
  clearError();
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
    const raw=localStorage.getItem(DRAFT_KEY);
    if(raw) {
      try {const restored=validateDraft(JSON.parse(raw));fields=restored.fields;step=restored.step;}
      catch {rawRecovery=raw;blockedSave=true;error('保存的草稿无法读取，原始数据已保留。请在“我的草稿”下载原始恢复数据，或新写一份文档。');$('rescue-draft').hidden=false;}
    }
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
  fillFields();showStep(step,false);
  history.replaceState({writerStep:step},'', '#step-'+(step+1));
  window.writerReady=true;
  if(fields.title.trim())preview();
}

$('writer-form').addEventListener('input',event=>{
  if(!hasLock || event.target.name==='format')return;
  readFields();$('agency-field').hidden=!fields.letterhead;
  $('body-count').textContent=fields.body.length.toLocaleString('zh-CN')+' 字';
  if(event.target.id==='title'&&fields.title.trim())fieldError('title','');
  if(event.target.id==='body'&&fields.body.trim())fieldError('body','');
  if(event.target.id==='agency'&&fields.agency.trim())fieldError('agency','');
  if(event.target.id==='date')fieldError('date',fields.date&&!validDate(fields.date)?'请选择 1900 年及以后的有效日期，或清空日期。':'');
  invalidate();persist();schedulePreview();
});
$('writer-form').addEventListener('submit',event=>{event.preventDefault();if(step<2)navigate(step+1);});
document.querySelectorAll('[data-step]').forEach(button=>button.onclick=()=>navigate(Number(button.dataset.step)));
document.querySelectorAll('[data-back]').forEach(button=>button.onclick=()=>navigate(Number(button.dataset.back)));
document.querySelectorAll('[name=format]').forEach(input=>input.onchange=updateExport);
document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>$(button.dataset.close).close());
$('export').onclick=exportFile;
$('refresh-preview').onclick=()=>{clearError();readyRevision=-1;preview();};
$('prev-page').onclick=()=>{if(pageNumber>1){pageNumber--;renderPage().catch(e=>error(e.message));}};
$('next-page').onclick=()=>{if(pdf&&pageNumber<pdf.numPages){pageNumber++;renderPage().catch(e=>error(e.message));}};
$('draft-menu').onclick=()=>$('draft-dialog').showModal();
$('save-draft').onclick=saveDraft;
$('load-draft-open').onclick=()=>$('load-draft').click();
$('backup-before-replace').onclick=saveDraft;
$('new-document').onclick=()=>requestReplace(draft(blank(),0));
$('confirm-replace').onclick=()=>replace(replacement);
$('undo-replace').onclick=()=>{if(previous)requestReplace(previous);};
$('rescue-draft').onclick=()=>download('公文-恢复数据.json',rawRecovery || localStorage.getItem(DRAFT_KEY+'-previous') || '{}','application/json');
$('load-draft').onchange=async event=>{
  const file=event.target.files[0];event.target.value='';if(!file)return;
  try {
    if(file.size>1024*1024)throw Error('草稿文件超过 1 MB，请选择本工具下载的填写草稿。');
    const next=validateDraft(JSON.parse(await file.text()));requestReplace(next);
  }catch(e){$('draft-status').textContent=e instanceof SyntaxError?'草稿不是有效的 JSON 文件，当前内容未改变。':e.message;}
};
$('settings-open').onclick=()=>{$('settings-dialog').showModal();showFonts().catch(e=>$('font-message').textContent=e.message);};
$('font-file').onchange=event=>changeFont(event.target.files[0]);
$('font-file-open').onclick=()=>$('font-file').click();
$('font-reset').onclick=()=>changeFont(null,true);
window.addEventListener('beforeunload',event=>{
  if($('save-status').textContent==='自动保存失败' || blockedSave&&names.some(name=>fields[name]) || fields.date&&!validDate(fields.date)){event.preventDefault();event.returnValue='';}
});
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='s'){event.preventDefault();persist();}});
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
boot().catch(e=>error(e.message));
