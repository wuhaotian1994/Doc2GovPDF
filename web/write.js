import {WriterEngine} from './write-engine.js';
import {DRAFT_KEY,DRAFT_MAX_BYTES,materialNames, names, blank, draft, validateDraft, validDate, fieldsForEngine, applySignature, textContent, safeName} from './write-model.js';
import {COMMON_KEY, LIBRARY_KEY, defaultCommon, validateCommon, commonFrom, freshFields, copyFields, validateLibrary, archiveDocument} from './write-library.js';
import {fieldLabels, resolveSource, reviewItems, ReviewDecisions} from './write-checks.js';
import {analyseMaterial,selectMaterialClosing,materialProposal} from './write-materials.js';
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
let materialAnalysis=null;
const confirmed = new Set();
const decisions = new ReviewDecisions();
const engine = new WriterEngine(() => fontStore);
const error = message => {
  $('global-error').textContent=message;$('global-error').hidden=false;
  if($('draft-dialog').open)$('draft-status').textContent=message;
  if($('material-dialog').open)$('material-message').textContent=message;
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
  $('material-source').hidden=!fields.sourceMaterial;
  $('material-entry').open=Boolean(fields.pendingMaterial);
  $('postscript').closest('details').open=Boolean(fields.postscript);
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
  decisions.retain(fields,currentId);
  revision++; readyRevision = -1; confirmed.clear();
  renderChecks();
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
  if(step===2)$('issue-location').hidden=true;
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
    ['落款',fields.signature || '未单独填写；如已在正文中保留，无需重复添加。',1,'signature'],['日期',fieldsForEngine(fields).date || '未单独填写；如已在正文中保留，无需重复添加。',1,'date'],
    ...(fields.postscript?[['附注',fields.postscript.split(/\r?\n/).filter(line=>line.trim()).length+' 段，排在日期后',1,'postscript']]:[])
  ];
  $('review-summary').replaceChildren(...rows.map(([label,value,target,id])=>{
    const row = document.createElement('div'); row.className = 'review-row';
    const dt = document.createElement('dt'); dt.textContent = label;
    const dd = document.createElement('dd'); dd.textContent = value;
    const edit = document.createElement('button'); edit.type='button'; edit.className='quiet'; edit.textContent='修改';
    edit.setAttribute('aria-label','修改'+label); edit.onclick=()=>{showStep(target);if($(id).closest('details'))$(id).closest('details').open=true;$(id).focus();};
    row.append(dt,dd,edit); return row;
  }));
}
function locateIssue(entry) {
  if(readyRevision!==revision)return;
  const field=entry.source?.field || 'body';
  showStep(['title','agency','reference','recipient'].includes(field)?0:1);
  const input=$(field),details=input.closest('details');if(details)details.open=true;
  // Textarea values normalize imported CRLF to LF; select using displayed offsets.
  const line=resolveSource(entry.source,{...fields,[field]:input.value});
  $('issue-location').hidden=false;
  $('issue-location-text').textContent=line?`已定位到${fieldLabels[field]}${['body','attachments'].includes(field)?'第 '+line.line+' 段':''}，请核对选中的原文。`:'这条提醒涉及整篇文档，请核对正文与相关内容。';
  input.focus();
  if(line&&input.type!=='date') {
    input.setSelectionRange(line.start,line.end);
    if(input.tagName==='TEXTAREA') {
      // Match wrapping and typography so a late paragraph is visible even when
      // earlier paragraphs wrap across many display lines.
      const mirror=document.createElement('div'),style=getComputedStyle(input);
      for(const property of ['font','lineHeight','letterSpacing','padding','boxSizing','tabSize'])mirror.style[property]=style[property];
      Object.assign(mirror.style,{position:'fixed',left:'-10000px',top:'0',width:input.clientWidth+'px',whiteSpace:'pre-wrap',overflowWrap:'break-word',visibility:'hidden'});
      mirror.append(document.createTextNode(input.value.slice(0,line.start)));
      const marker=document.createElement('span');marker.textContent='\u200b';mirror.append(marker);document.body.append(mirror);
      input.scrollTop=Math.max(0,marker.offsetTop-input.clientHeight/3);mirror.remove();
    }
  }
  input.scrollIntoView({block:'center'});
}
function renderChecks() {
  $('check-list').replaceChildren();
  if (readyRevision!==revision) { $('checks-status').textContent='内容更新后会重新核对。'; return; }
  const entries=reviewItems(model,inspection,fields,currentId).sort((a,b)=>({error:0,review:1,suggestion:2}[a.issue.severity] ?? 3)-({error:0,review:1,suggestion:2}[b.issue.severity] ?? 3));
  const latest=decisions.reconcile(entries);confirmed.clear();for(const id of latest)confirmed.add(id);
  const count=severity=>entries.filter(entry=>entry.issue.severity===severity).length;
  $('checks-status').textContent = entries.length ? `必须修正 ${count('error')} 项，需要判断 ${count('review')} 项，建议 ${count('suggestion')} 项。事实、名称和数字仍需你核对。` : '未发现需要处理的格式问题。请自行核对事实、名称和数字。';
  for (const entry of entries) {
    const {issue,source}=entry,line=resolveSource(source,fields);
    const item = document.createElement('div'); item.className='review-issue';item.dataset.rule=issue.rule;item.dataset.severity=issue.severity;
    const heading=document.createElement('h3');heading.className='issue-heading';
    heading.textContent=({error:'必须修正',review:'需要你判断',suggestion:'建议 · 不影响下载'}[issue.severity] || '内容提醒')+' · '+(source?fieldLabels[source.field]+(line&&['body','attachments'].includes(source.field)?'第 '+line.line+' 段':''):'整篇文档');
    const text = document.createElement('p'); text.textContent=issue.message;
    if(issue.message.startsWith('这处写法可按公文体例整理'))text.textContent='请对照原文与建议写法，核对是否需要调整。';
    item.append(heading,text);
    if(issue.original){const quote=document.createElement('blockquote');quote.className='issue-original';quote.textContent=issue.original;quote.setAttribute('aria-label','提醒对应的原文');item.append(quote);}
    const help=document.createElement('details'),summary=document.createElement('summary');summary.textContent='查看依据与处理方法';help.className='issue-help';help.append(summary);
    const basis=document.createElement('p');basis.textContent='提醒依据：'+issue.basis;
    const action=document.createElement('p');action.textContent=issue.severity==='error'?'请依据原始材料修改，再返回这里核对。':issue.severity==='suggestion'?'可结合语境自行修改；保留现有写法也可以直接下载。':'请核对语境和原始材料。需要调整时定位修改；有意保留时，勾选下方确认。';
    help.append(basis,action);
    if(issue.replacement){const label=document.createElement('p');label.textContent='建议写法（仅供对照，不会自动替换）：';const next=document.createElement('blockquote');next.className='issue-proposed';next.textContent=issue.replacement;help.append(label,next);}
    item.append(help);
    const edit = document.createElement('button'); edit.type='button'; edit.className='secondary'; edit.textContent=source?'定位到原文':'查看正文';
    edit.setAttribute('aria-label',edit.textContent+'：'+heading.textContent);edit.onclick=()=>locateIssue(entry);item.append(edit);
    if (issue.severity==='review') {
      const label=document.createElement('label'); label.className='check';
      const check=document.createElement('input'); check.type='checkbox'; check.checked=confirmed.has(issue.id);
      check.onchange=()=>{decisions.set(entry,check.checked);check.checked?confirmed.add(issue.id):confirmed.delete(issue.id);updateExport();};
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
function selectedMaterial(){return Object.fromEntries([...document.querySelectorAll('#material-candidates input')].map(input=>[input.dataset.materialField,input.checked]));}
function renderMaterialPreview(){
  if(!materialAnalysis)return;
  const next=materialProposal(materialAnalysis,selectedMaterial(),$('material-join').checked,fields.title);
  $('material-body-preview').value=next.fields.body;
  $('material-postscript-preview').value=next.fields.postscript;
  $('material-postscript-result').hidden=!materialAnalysis.candidates.postscript;
  $('material-title-preview').textContent=next.fields.title?'整理后的标题：'+next.fields.title:'尚未选择标题。请选择原文首行，或取消后先填写标题再核对。';
  const problems=[...next.conflicts];
  if(!next.fields.title.trim())problems.push('请先确认标题的来源。');
  if(!next.fields.body.trim())problems.push('整理后没有正文，请保留或补充正文后再整理。');
  if(blockedSave)problems.push('原有草稿尚未安全恢复，请先下载恢复数据并处理本地存储问题，再继续整理。');
  $('material-message').textContent=problems.join(' ');
  $('material-apply').disabled=problems.length>0||!hasLock||exporting||fontBusy||blockedSave;
}
function renderMaterialCandidates(preserveBasic=false){
    const prior=preserveBasic?selectedMaterial():{};
    const options=[];
    const add=(name,label,value,note)=>{
      const row=document.createElement('label');row.className='check material-choice';
      const input=document.createElement('input');input.type='checkbox';input.dataset.materialField=name;input.onchange=renderMaterialPreview;
      const copy=document.createElement('span'),heading=document.createElement('strong'),source=document.createElement('span'),hint=document.createElement('small');
      heading.textContent=label;source.textContent=value;hint.textContent=note;copy.append(heading,source,hint);row.append(input,copy);options.push(row);
    };
    const labels={title:'作为文档标题',recipient:'作为收文对象',signature:'作为落款',date:'作为日期',postscript:'后面的内容作为落款后附注（保留原顺序）'};
    for(const name of ['title','recipient','signature','date','postscript']){
      const candidate=materialAnalysis.candidates[name];
      if(candidate)add(name,name==='signature'&&candidate.indices?.length>1?'作为联合落款（保留原顺序）':labels[name],candidate.text.trim(),'原文第 '+(candidate.indices||[candidate.index]).map(index=>index+1).join('、')+' 行；请确认用途，不会默认提取。');
    }
    if(fields.title.trim())add('keepTitle','不提取首行，沿用已填标题',fields.title,'原文首行会保留在正文中，请检查是否重复。');
    $('material-candidates').replaceChildren(...options);
    for(const name of ['title','recipient','keepTitle']){const input=document.querySelector(`[data-material-field=${name}]`);if(input)input.checked=Boolean(prior[name]);}
}
function openMaterial(){
  readFields();persist();
  try{
    if(!fields.pendingMaterial.trim())throw Error('请先整篇粘贴原始材料。现有文档不会改变。');
    materialAnalysis=analyseMaterial(fields.pendingMaterial);
    $('material-date-choice').hidden=materialAnalysis.closings.length<=1;
    const placeholder=document.createElement('option');placeholder.value='-1';placeholder.textContent='请先选择属于落款的日期';
    $('material-date-source').replaceChildren(placeholder,...materialAnalysis.closings.map((closing,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent='原文第 '+(closing.date.index+1)+' 行：'+closing.date.text+'；前一行：'+(materialAnalysis.lines[closing.date.index-1]||'（空行）');return option;}));
    $('material-date-source').value=String(materialAnalysis.closingIndex);
    renderMaterialCandidates();$('material-join').checked=false;
    clearError();$('material-dialog').showModal();renderMaterialPreview();
  }catch(e){error(e.message);}
}
function applyMaterial(){
  readFields();if(!materialAnalysis||fields.pendingMaterial.replace(/\r\n?/g,'\n')!==materialAnalysis.source){error('原始材料已变化，请取消后重新核对。');return;}
  const next=materialProposal(materialAnalysis,selectedMaterial(),$('material-join').checked,fields.title);
  if(next.conflicts.length||!next.fields.title.trim()||!next.fields.body.trim()){renderMaterialPreview();return;}
  if(fields.date&&!validDate(fields.date)||$('date').validity.badInput){$('material-dialog').close();showStep(1);fieldError('date','请先修正或清空当前日期，再整理新材料。');$('date').focus();return;}
  if(requestReplace({...draft(next.fields,1),reuseMessage:'已按你确认的选项整理。原始材料已保留，可查看或下载；上一份文档仍可恢复。'},true)){
    $('material-dialog').close();materialAnalysis=null;
  }
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
  if(materialNames.includes(event.target.id)){persist();return;}
  if(!$('issue-location').hidden)$('issue-location-text').textContent='内容已修改，返回内容提醒查看核对结果。';
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
$('return-checks').onclick=()=>{navigate(2);$('checks').scrollIntoView({block:'start'});};
$('refresh-preview').onclick=()=>{clearError();readyRevision=-1;preview();};
$('prev-page').onclick=()=>{if(pageNumber>1){pageNumber--;renderPage().catch(e=>error(e.message));}};
$('next-page').onclick=()=>{if(pdf&&pageNumber<pdf.numPages){pageNumber++;renderPage().catch(e=>error(e.message));}};
$('draft-menu').onclick=()=>{renderLibrary();$('draft-dialog').showModal();};
$('save-draft').onclick=saveDraft;
$('material-open').onclick=openMaterial;
$('material-apply').onclick=applyMaterial;
$('material-join').onchange=renderMaterialPreview;
$('material-date-source').onchange=()=>{materialAnalysis=selectMaterialClosing(materialAnalysis,Number($('material-date-source').value));renderMaterialCandidates(true);renderMaterialPreview();};
$('material-download-original').onclick=()=>{readFields();if(fields.sourceMaterial)download(safeName(fields.title)+'-原始材料.txt',fields.sourceMaterial,'text/plain;charset=utf-8');};
$('pendingMaterial').addEventListener('paste',event=>{
  const pasted=event.clipboardData?.getData('text/plain');if(typeof pasted!=='string')return;
  const input=event.target;
  if(input.value.length-(input.selectionEnd-input.selectionStart)+pasted.replace(/\r\n?/g,'\n').length>100000){event.preventDefault();error('这份材料超过 100000 字符，未替换当前输入。请拆成两份整理。');}
});
$('postscript').addEventListener('paste',event=>{
  const pasted=event.clipboardData?.getData('text/plain');if(typeof pasted!=='string')return;
  const input=event.target;
  if(input.value.length-(input.selectionEnd-input.selectionStart)+pasted.replace(/\r\n?/g,'\n').length>4000){event.preventDefault();error('附注超过 4000 字符，未替换当前输入。请先保留原文，再分份整理。');}
});
$('table-copy').onclick=()=>{
  readFields();if(!validate(1))return;
  saveDraft();$('table-copy-status').textContent='填写草稿已开始下载。打开高级编辑，选择刚下载的草稿，再点击“编辑正文”继续。';
};
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
    if(file.size>DRAFT_MAX_BYTES)throw Error('草稿文件超过 2 MB，请选择本工具下载的填写草稿。');
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
