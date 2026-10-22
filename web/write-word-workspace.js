import {wordRecords,saveWord,loadWord,removeWord,sourceData,saveSource,legacyFonts,legacyWorkspace,migrationId,activeWord,setActiveWord,validateWordRecord} from './write-word-store.js';

const $=id=>document.getElementById(id);
const node=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;};
const button=(text,fn)=>{const b=node('button',text,'secondary');b.type='button';b.onclick=fn;return b;};
export function paragraphs(model){return model.blocks.flatMap(b=>b.paragraph?[b.paragraph]:b.table?[...(b.table.caption?[b.table.caption]:[]),...b.table.rows.flatMap(r=>r.cells.flatMap(c=>c.paragraphs))]:[]);}
function name(value){return (value||'Word工作稿').replace(/\.docx$/i,'').replace(/[\\/:*?"<>|]/g,'_').slice(0,160);}
export function findingKey(issue,inspection,model){const p=paragraphs(model).find(p=>p.id===issue.paragraphId);return JSON.stringify([inspection.version,issue.rule,issue.severity,issue.original,issue.replacement,issue.basis,p||null,p?null:model]);}
function encode(data){let s='';for(let i=0;i<data.length;i+=32768)s+=String.fromCharCode(...data.subarray(i,i+32768));return btoa(s);}

export function installWordWorkspace(h){
  let record=null,saveQueue=Promise.resolve(),saveVersion=0,savedVersion=0,saveFailure='',undo=[],redo=[],lastUndoId='',busy=false,pdfAcknowledged=false,pdfWarnings=[];
  const headings=[...document.querySelectorAll('[data-panel] h1')].map(e=>e.textContent),leads=[...document.querySelectorAll('[data-panel]>.lead')].map(e=>e.textContent);
  const basic=node('section',undefined,'word-workspace');basic.id='word-basic';
  const label=node('label','工作稿名称');label.htmlFor='word-name';const title=node('input');title.id='word-name';title.maxLength=180;
  basic.append(label,title);const facts=node('p',undefined,'hint'),warnings=node('div');basic.append(facts,warnings);
  basic.append(button('下载未修改的原件',()=>original().catch(h.error)),button('下载可恢复工作稿',()=>backup().catch(h.error)));
  const boundary=node('p','可修改下方原段落和单元格中的文字，并按需调整段落格式。原表合并、分节、署名日期和其他结构保持；受保护段落只读。本工具不支持任意Word结构编辑，PDF使用本地字体，需核对实际预览。','hint');basic.append(boundary);
  const pending=node('section');basic.append(pending);
  document.querySelector('[data-panel="0"]').append(basic);
  const body=node('section',undefined,'word-workspace content-workspace');body.id='word-body';
  const toolbar=node('div',undefined,'content-toolbar'),undoButton=button('撤销文字或格式调整',()=>history(false)),redoButton=button('恢复调整',()=>history(true));toolbar.append(undoButton,redoButton);body.append(toolbar);
  const blocks=node('div');blocks.id='word-blocks';body.append(blocks);document.querySelector('[data-panel="1"]').append(body);
  basic.hidden=body.hidden=true;
  title.oninput=()=>{if(!canEdit())return;record.name=title.value;persist();h.summary();};
  function canEdit(){return record&&h.canEdit()&&!busy;}
  function remember(id){if(id!==lastUndoId){undo.push(structuredClone(record.document));if(undo.length>20)undo.shift();lastUndoId=id;}redo=[];}
  function changed(composing=false){pdfAcknowledged=false;pdfWarnings=[];h.changed();persist();if(!composing)h.schedule();undoButton.disabled=!undo.length;redoButton.disabled=!redo.length;}
  function history(forward){if(!canEdit())return;const from=forward?redo:undo,to=forward?undo:redo;if(!from.length)return;to.push(structuredClone(record.document));record.document=from.pop();lastUndoId='';renderBody();changed();}
  function persist(){
    if(!record||!h.canEdit())return saveQueue;
    const version=++saveVersion,snapshot=structuredClone(record);snapshot.step=h.step();
    $('save-status').textContent='正在保存Word工作稿…';
    saveQueue=saveQueue.catch(()=>{}).then(()=>saveWord(snapshot)).then(()=>{savedVersion=version;saveFailure='';if(version===saveVersion)$('save-status').textContent='已保存到此浏览器';}).catch(e=>{saveFailure=e.message;$('save-status').textContent='自动保存失败';h.error(e.message);});
    return saveQueue;
  }
  async function flush(){if(record){await persist();if(saveFailure||savedVersion!==saveVersion)throw Error(saveFailure||'保存尚未完成，请下载恢复包后再切换。');}}
  async function leave(){await flush();setActiveWord(null);record=null;document.body.classList.remove('word-mode');basic.hidden=body.hidden=true;document.querySelectorAll('[data-panel] h1').forEach((e,i)=>e.textContent=headings[i]);document.querySelectorAll('[data-panel]>.lead').forEach((e,i)=>e.textContent=leads[i]);h.reset();}
  async function activate(next,{restoring=false}={}){
    if(!h.canEdit())throw Error('请先关闭正在编辑的另一标签页。');
    if(record)await flush();else await h.prepareForm();
    next={...next,fonts:next.fonts||structuredClone(h.fonts())};validateWordRecord(next);
    if(next.document.sourceId&&!await sourceData(next.document.sourceId))throw Error('这份工作稿缺少原件。请先打开同一份原始DOCX，再打开工作稿；当前内容未改变。');
    await h.engine.call('InspectDocument',next.document);
    if(next.document.sourceId)await saveSource(next.document.sourceId,await sourceData(next.document.sourceId));
    await saveWord(next);setActiveWord(next.id);record=structuredClone(next);undo=[];redo=[];lastUndoId='';pdfAcknowledged=false;pdfWarnings=[];
    document.body.classList.add('word-mode');basic.hidden=body.hidden=false;
    document.querySelectorAll('[data-panel] h1').forEach((e,i)=>e.textContent=['核对这份Word','继续编辑原文','核对一下，就可以导出'][i]);
    document.querySelectorAll('[data-panel]>.lead').forEach((e,i)=>e.textContent=['原件另外保留，修改保存在当前工作稿。','正文和表格保持原顺序，按需修改文字和段落格式。','核对原文提醒、字体与分页，再另存文件。'][i]);
    renderBasic();renderBody();h.reset();h.showStep(restoring?Math.min(2,next.step||0):0);$('draft-dialog').close();h.changed();h.schedule();
  }
  function showPDFWarnings(values){pdfWarnings=Array.isArray(values)?values:[];renderBasic();}
  function renderBasic(){
    title.value=record.name;const m=record.document,pages=m.blocks.filter(b=>b.page).map(b=>b.page);
    facts.textContent=`${m.blocks.filter(b=>b.table).length} 张原生表格 · ${paragraphs(m).length} 个原段落 · `+(pages.length?pages.map((p,i)=>`第${i+1}节${p.width>p.height?'横向':'纵向'}`).join('，'):'按工作稿页面设置');
    warnings.replaceChildren(...[...(m.warnings||[]),...pdfWarnings].map(w=>node('p',w,'hint')));
    if(m.pdfUnsupported)warnings.append(node('p','这份Word含当前PDF排版不支持的结构；原件和Word另存仍可用，未将它压平为普通文字。','field-error'));
    pending.replaceChildren();
    if(record.pendingForm){
      pending.append(node('h2','继续未完成的旧稿'),node('p','旧稿的其他填写值已保留。补齐以下内容后继续，不会自动猜日期。','hint'));
      for(const [key,text] of [['title','标题'],['body','正文']]){const l=node('label',text),input=node(key==='body'?'textarea':'input');input.value=record.pendingForm[key]||'';input.oninput=()=>{record.pendingForm[key]=input.value;persist();};l.append(input);pending.append(l);}
      pending.append(button('保留原填写值并生成文稿',async()=>{try{if(!record.pendingForm.title?.trim()||!record.pendingForm.body?.trim())throw Error('请补齐标题和正文。');record.document=await h.engine.call('BuildDocument',record.pendingForm);delete record.pendingForm;renderBasic();renderBody();changed();}catch(e){h.error(e.message);}}));
    }
  }
  function paragraph(p,context){
    const wrap=node('div',undefined,'word-paragraph');wrap.dataset.paragraphId=p.id;
    const label=node('label',context+(p.protected?' · 受保护，只读':''));const input=node('textarea');input.id='word-paragraph-'+p.id;label.htmlFor=input.id;
    input.value=p.text;input.rows=Math.min(7,Math.max(1,Math.ceil(p.text.length/40)));input.readOnly=Boolean(p.protected)||p.text.length>100000;input.maxLength=100000;input.setAttribute('aria-label',context);input.dataset.wordParagraph=p.id;
    if(p.prefix)wrap.append(node('p','原编号：'+p.prefix,'hint'));
    input.onfocus=()=>{lastUndoId='';};
    input.addEventListener('input',e=>{if(!canEdit()||input.readOnly)return;remember(p.id);p.text=input.value;changed(e.isComposing);});
    input.addEventListener('compositionend',()=>{if(!canEdit()||input.readOnly)return;if(p.text!==input.value){remember(p.id);p.text=input.value;changed();}h.schedule();});
    wrap.append(label,input);
    if(p.protected)wrap.append(node('p','含字段、超链接或其他原结构；为保留原件，此段只读，可在Word中继续处理。','hint'));
    else if(!p.formatLocked){
      const detail=node('details',undefined,'word-format');detail.append(node('summary','调整这一段的格式'));
      for(const [key,text,options] of [['align','对齐',['left','center','right','both']],['size','字号（磅）'],['before','段前（毫米）'],['after','段后（毫米）'],['indent','首行缩进（毫米）']]){
        const l=node('label',text),control=node(options?'select':'input');
        if(options)options.forEach((v,i)=>{const o=node('option',['左对齐','居中','右对齐','两端对齐'][i]);o.value=v;control.append(o);});else {control.type='number';control.step='0.5';control.min=key==='size'?'6':'0';control.max=key==='size'?'72':'50';}
        control.value=p[key]??0;control.onchange=()=>{if(!canEdit()||!control.reportValidity())return;remember(p.id+'-'+key);p[key]=options?control.value:Number(control.value);changed();};l.append(control);detail.append(l);
      }wrap.append(detail);
    }return wrap;
  }
  function renderBody(){
    blocks.replaceChildren();let n=0,t=0;
    for(const b of record.document.blocks){
      if(b.page)blocks.append(node('p',`原第${++n}节 · ${b.page.width>b.page.height?'横向':'纵向'}页面`,'word-section'));
      if(b.paragraph)blocks.append(paragraph(b.paragraph,'原文段落 '+b.paragraph.id));
      if(!b.table)continue;t++;const area=node('section',undefined,'word-table');area.append(node('h2','原表 '+t));if(b.table.caption)area.append(paragraph(b.table.caption,'原表 '+t+' 标题'));
      const scroll=node('div',undefined,'word-table-scroll'),table=node('table');table.setAttribute('aria-label','原表 '+t);const group=node('colgroup');b.table.widths?.forEach(w=>{const col=node('col');col.style.width=w+'mm';group.append(col);});table.append(group);
      const rows=b.table.rows;rows.forEach((r,ri)=>{const tr=node('tr');let logical=0;r.cells.forEach((c,ci)=>{const column=logical;logical+=c.span||1;if(c.merge==='continue')return;const cell=node(r.header?'th':'td');cell.colSpan=c.span||1;if(c.merge==='restart'){let span=1;for(let j=ri+1;j<rows.length;j++){let pos=0,match;for(const next of rows[j].cells){if(pos===column){match=next;break;}pos+=next.span||1;}if(match?.merge!=='continue')break;span++;}cell.rowSpan=span;}c.paragraphs.forEach(p=>cell.append(paragraph(p,`表${t} 第${ri+1}行第${column+1}列`)));tr.append(cell);});table.append(tr);});scroll.append(table);area.append(scroll);blocks.append(area);
    }undoButton.disabled=!undo.length;redoButton.disabled=!redo.length;
  }
  function summary(){const root=$('review-summary');root.replaceChildren();for(const [label,value] of [['工作稿',record.name],['原文',`${paragraphs(record.document).length} 段，${record.document.blocks.filter(b=>b.table).length} 张表格；署名日期仍在原位置`],['保存方式','另存新文件；原件不覆盖']]){const row=node('div',undefined,'review-row');row.append(node('dt',label),node('dd',value));root.append(row);}const b=button('继续编辑原文',()=>h.showStep(1));root.append(b);}
  function checks(inspection,confirmed){
    const list=$('check-list');list.replaceChildren();confirmed.clear();
    if(!inspection){$('checks-status').textContent='正在核对原文…';return;}
    const issues=inspection.issues||[],kept=record.review?.fingerprints||[];
    $('checks-status').textContent=issues.length?`必须修正 ${issues.filter(i=>i.severity==='error').length} 项，需要判断 ${issues.filter(i=>i.severity==='review').length} 项。事实、署名日期和数字仍需核对。`:'未发现需要处理的格式问题。请核对事实、署名日期和数字。';
    for(const issue of issues){
      const p=paragraphs(record.document).find(p=>p.id===issue.paragraphId),key=findingKey(issue,inspection,record.document),item=node('div',undefined,'review-issue');item.dataset.severity=issue.severity;item.dataset.rule=issue.rule;
      if(kept.includes(key))confirmed.add(issue.id);
      item.append(node('h3',({error:'必须修正',review:'需要你判断',suggestion:'建议 · 不影响下载'}[issue.severity]||'提醒')+' · '+(p?'原段落 '+p.id:'整篇文档')),node('p',issue.message),node('blockquote',p?.text||issue.original||'整篇文档','issue-original'));
      const detail=node('details'),s=node('summary','查看依据与处理方法');detail.append(s,node('p','依据：'+issue.basis));if(issue.replacement)detail.append(node('p','建议写法（不会自动替换）：'+issue.replacement));item.append(detail);
      item.append(button('定位到原文',()=>{h.showStep(1);const input=$('word-paragraph-'+p?.id);if(input){input.focus();const i=input.value.indexOf(issue.original);input.setSelectionRange(Math.max(0,i),i<0?input.value.length:i+issue.original.length);input.scrollIntoView({block:'center'});}else blocks.scrollIntoView({block:'start'});}));
      if(issue.severity==='review'){const l=node('label',undefined,'check'),check=node('input');check.type='checkbox';check.checked=confirmed.has(issue.id);check.onchange=()=>{const values=new Set(record.review?.fingerprints||[]);check.checked?values.add(key):values.delete(key);record.review={fingerprints:[...values]};check.checked?confirmed.add(issue.id):confirmed.delete(issue.id);persist();h.updateExport();};l.append(check,document.createTextNode('我已核对，此处保留原文'));item.append(l);}list.append(item);
    }
    for(const message of pdfWarnings)list.append(node('p',message,'field-error'));
    const note=node('p','当前为原件保护与另存，不表示全文国标检查通过。原件中的字体、合并表格和分节在Word另存时保留。预览/PDF可能使用备用字体，分页与Microsoft Word可能不同。请逐页核对后再导出PDF。','hint');list.append(note);
    const l=node('label',undefined,'check'),ack=node('input');ack.type='checkbox';ack.id='word-pdf-ack';ack.checked=pdfAcknowledged;ack.onchange=()=>{pdfAcknowledged=ack.checked;h.updateExport();};l.append(ack,document.createTextNode('我已核对当前PDF预览的字体、分节及表格分页'));list.append(l);
    if(inspection.unchecked?.length)list.append(node('p','仍需人工核对：'+inspection.unchecked.join('；'),'hint'));
  }
  async function original(){if(!record.document.sourceId)throw Error('这份工作稿来自旧的新建文稿，没有另存原件。可下载恢复工作稿或Word。');const data=await sourceData(record.document.sourceId);if(!data)throw Error('未找到原件。');h.download(name(record.origin?.name||record.name)+'-原件.docx',h.bytes(data),'application/vnd.openxmlformats-officedocument.wordprocessingml.document');}
  async function backup(target=record){const source=target.document.sourceId?{name:target.origin?.name||target.name,data:await sourceData(target.document.sourceId)}:null;h.download(name(target.name)+'.gongwen-word.json',JSON.stringify({...target,source},null,2),'application/json');}
  async function open(file){
    if(!file)return;if(!h.canEdit())throw Error('请先关闭正在编辑的另一标签页。');if(file.size>(/\.docx?$/i.test(file.name)?50:350)*1024*1024)throw Error('文件超过当前类型的安全读取范围，当前内容未改变。');
    busy=true;h.busy(true);try{
      if(/\.docx$/i.test(file.name)){
        const data=encode(new Uint8Array(await file.arrayBuffer())),m=await h.engine.call('Import',file.name,data);await saveSource(m.sourceId,data);
        await activate({type:'gongwen-word',version:1,id:crypto.randomUUID(),name:file.name,document:m,review:{fingerprints:[]},origin:{name:file.name}});
      }else if(/\.doc$/i.test(file.name))throw Error('旧版.doc尚不能直接读取，请在Word另存为.docx后打开。当前内容未改变。');
      else if(/\.txt$/i.test(file.name)){if(file.size>400000)throw Error('文字材料过长，请拆分后整理。');const text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());await h.openText(text);}
      else {const value=JSON.parse(await file.text());if(value.type==='gongwen-word'){
        const next=validateWordRecord(value);if(next.source?.data){const imported=await h.engine.call('Import',next.source.name||next.name,next.source.data);if(imported.sourceId!==next.document.sourceId)throw Error('工作稿原件与记录不匹配，当前内容未改变。');await saveSource(imported.sourceId,next.source.data);}delete next.source;next.id=crypto.randomUUID();next.review={fingerprints:[]};await activate(next);
      }else if(value.document?.blocks){await migrate(value);}else await h.openForm(value);}
    }finally{busy=false;h.busy(false);}
  }
  async function migrate(old){
    if(!old||!old.document?.blocks)throw Error('没有可承接的旧Word工作稿，原数据未改变。');
    const signature=encode(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(old))))).replace(/[/+=]/g,'');const existing=await migrationId(signature);if(existing){await activate(await loadWord(existing),{restoring:true});return;}
    let m=structuredClone(old.document);
    if(!m.blocks.length&&old.form)m=await h.engine.call('BuildDocument',{...old.form,title:old.form.title||'待补齐旧稿标题',body:old.form.body||'待补齐旧稿正文'});
    if(m.sourceId){const data=await sourceData(m.sourceId);if(!data)throw Error('旧稿缺少原始Word。请先打开匹配的原始DOCX后重试承接，旧记录完整保留。');const fresh=await h.engine.call('Import',old.name||'原件.docx',data);if(!m.layoutNormalized&&!m.blocks.some(b=>b.page)&&JSON.stringify(m.page)===JSON.stringify(fresh.page)&&paragraphs(m).map(p=>p.id).join('|')===paragraphs(fresh).map(p=>p.id).join('|')&&m.blocks.length===fresh.blocks.length){m.blocks.forEach((b,i)=>{if(fresh.blocks[i].page)b.page=fresh.blocks[i].page;if(b.table&&fresh.blocks[i].table)b.table.rows.forEach((row,ri)=>row.cells.forEach((cell,ci)=>{const original=fresh.blocks[i].table.rows[ri]?.cells[ci];if(original&&cell.span===original.span){if(cell.borders===undefined&&original.borders)cell.borders=original.borders;if(cell.fill===undefined&&original.fill)cell.fill=original.fill;}}));});}}
    const next={type:'gongwen-word',version:1,id:crypto.randomUUID(),name:old.name||'承接的Word工作稿',document:m,review:{fingerprints:[]},origin:{name:old.name||'原件.docx'},fonts:await legacyFonts(),legacy:old};
    if(!old.document.blocks.length&&old.form)next.pendingForm=structuredClone(old.form);
    else if(Array.isArray(old.ignored)&&old.ignored.length){
      const before=await h.engine.call('InspectDocument',old.document),after=await h.engine.call('InspectDocument',m),keys=new Set((before.issues||[]).filter(i=>old.ignored.includes(i.id)).map(i=>findingKey(i,before,old.document)));
      next.review.fingerprints=(after.issues||[]).map(i=>findingKey(i,after,m)).filter(key=>keys.has(key));
    }
    await activate(next);await migrationId(signature,next.id);
  }
  async function appendLibrary(root){
    try{for(const item of await wordRecords()){
      const row=node('div',undefined,'recent-document');row.append(node('h3',item.name),node('p',(item.id===record?.id?'正在编辑 · ':'')+'Word工作稿 · '+(item.savedAt||'').slice(0,16),'hint'));const actions=node('div',undefined,'recent-actions');
      actions.append(button('继续编辑',()=>activate(item,{restoring:true}).catch(e=>h.error(e.message))),button('复制新稿',()=>copy(item).catch(e=>h.error(e.message))),button('下载草稿',()=>backup(item).catch(e=>h.error(e.message))));
      if(item.id!==record?.id)actions.append(button('删除',()=>{const dialog=node('dialog'),heading=node('h2','删除这份本地Word工作稿？');dialog.append(heading,node('p',item.name+'；原始文件和已下载文件不变。'),button('取消',()=>dialog.close()),button('删除这份文档',async()=>{try{await removeWord(item.id);dialog.close();row.remove();}catch(e){h.error(e.message);}}));dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();}));row.append(actions);root.append(row);
    }}catch(e){root.append(node('p',e.message,'field-error'));}
  }
  async function copy(item=record){const next={...structuredClone(item),id:crypto.randomUUID(),name:name(item.name)+'-副本',review:{fingerprints:[]}};await activate(next);$('reuse-status').hidden=false;$('reuse-status').textContent='已复制原文结构。原文中的日期、文号、数字仍保留，请按本次工作核对，不会自动猜改。';}
  async function restore(){const id=activeWord();if(id)await activate(await loadWord(id),{restoring:true});if(new URLSearchParams(location.search).has('resume-word')){const old=await legacyWorkspace();if(old)await migrate(old);else {$('reuse-status').hidden=false;$('reuse-status').textContent='已进入统一工作区。本浏览器没有旧Word工作稿，可直接打开Word或新建填写。';}}}
  return {get active(){return Boolean(record);},get document(){return record?.document;},get fonts(){return record?.fonts;},async setFonts(value){record.fonts=structuredClone(value);await persist();if(saveFailure)throw Error(saveFailure);},get dirty(){return record&&(saveFailure||savedVersion!==saveVersion);},get pending(){return Boolean(record?.pendingForm);},persist,flush,leave,open,restore,summary,checks,showPDFWarnings,appendLibrary,copy,backup,source:()=>sourceData(record?.document.sourceId),filename:format=>name(record?.name)+'-另存.'+format,pdfAllowed:()=>pdfAcknowledged&&!record?.document.pdfUnsupported};
}
