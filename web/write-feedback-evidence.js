import {captureFeedbackFrame} from './write-feedback-capture.js';
import {visibleEvidenceCandidates,exampleFromSelection,evidenceRisks,inspectScreenshotHeader,validRectangle} from './write-feedback-evidence-model.js';

const MAX_BYTES=4*1024*1024,MAX_FILES=4;
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(text,fn,primary=false)=>{const b=el('button',text,primary?'feedback-primary':'feedback-secondary');b.type='button';b.addEventListener('click',fn);return b;};
const canvas=(width,height)=>{const n=document.createElement('canvas');n.width=width;n.height=height;return n;};
const png=surface=>new Promise((resolve,reject)=>surface.toBlob(blob=>blob?resolve(blob):reject(Error('截图副本未能生成，请缩小范围后重试。')),'image/png'));
const hint='涉密材料禁止上传。优先使用虚构或公开材料；本地处理和风险提示不代表已经完全脱敏。原稿不会改变，未确认的副本不会发送。';

/** Local-only evidence preparation. getDraft is invoked exclusively by the explicit draft-copy button. */
export function installFeedbackEvidence({container,getDraft,onChange=()=>{},onCaptureStart=()=>{},onCaptureEnd=()=>{}}){
  if(!container)throw Error('证据容器缺失');
  let files=[],active=null,disposed=false,epoch=0,serial=0,busy=false,locked=false;let captureAbort=new AbortController();
  const root=el('section',undefined,'feedback-evidence');root.setAttribute('aria-label','本地准备反馈证据');
  const style=el('style');style.textContent=`.feedback-evidence{color:#202b3c;font:inherit}.feedback-evidence p{line-height:1.65;margin:.5rem 0}.feedback-evidence .fbe-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.feedback-evidence button{font:inherit;padding:8px 12px;border:1px solid #aeb9c8;border-radius:7px;background:#fff;color:#202b3c;cursor:pointer}.feedback-evidence button.feedback-primary{background:#2458b8;color:#fff;border-color:#2458b8}.feedback-evidence button:hover{border-color:#2458b8}.feedback-evidence button:focus-visible,.feedback-evidence input:focus-visible,.feedback-evidence textarea:focus-visible{outline:3px solid #e5ab33;outline-offset:2px}.feedback-evidence button:disabled{opacity:.55;cursor:default}.feedback-evidence input,.feedback-evidence textarea{box-sizing:border-box;font:inherit;color:inherit;border:1px solid #aeb9c8;border-radius:7px;padding:8px;background:#fff}.feedback-evidence input[type=number]{width:100%}.feedback-evidence input[type=checkbox]{width:auto;margin-right:8px;accent-color:#2458b8}.feedback-evidence textarea{width:100%;min-height:76px;resize:vertical;line-height:1.6}.feedback-evidence .fbe-help{font-size:13px;color:#5e6b7b}.feedback-evidence .fbe-status{font-size:14px;line-height:1.65}.feedback-evidence .fbe-status[data-error=true]{color:#aa2633}.feedback-evidence .fbe-stage{border-top:1px solid #dce2ea;margin-top:16px;padding-top:16px}.feedback-evidence .fbe-canvas{display:block;max-width:100%;height:auto;touch-action:none;cursor:crosshair;border:1px solid #aeb9c8}.feedback-evidence .fbe-coordinates{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;max-width:640px}.feedback-evidence .fbe-coordinates label{font-size:13px}.feedback-evidence .fbe-file{border-top:1px solid #dce2ea;padding:14px 0}.feedback-evidence .fbe-image{display:block;max-width:100%;max-height:440px;object-fit:contain;object-position:left top}.feedback-evidence .fbe-choice{padding:12px 0;border-bottom:1px solid #dce2ea}.feedback-evidence .fbe-choice>label{display:block;cursor:pointer}.feedback-evidence .fbe-choice-edit{margin-top:8px}.feedback-evidence .fbe-table-scroll{overflow:auto;max-width:100%;margin:8px 0}.feedback-evidence table{border-collapse:collapse;min-width:100%}.feedback-evidence td,.feedback-evidence th{border:1px solid #aeb9c8;padding:6px;white-space:pre-wrap;vertical-align:top;min-width:70px}.feedback-evidence td textarea{min-width:100px;min-height:50px}.feedback-evidence pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:360px;overflow:auto;font:13px/1.6 system-ui}.feedback-evidence h4{font-size:16px;margin:0 0 8px}.feedback-evidence summary{cursor:pointer;padding:7px 0}.feedback-evidence .fbe-replace{display:grid;grid-template-columns:1fr 1fr;gap:8px}.feedback-evidence .fbe-replace input{min-width:0;width:100%}`;
  root.append(style);
  const actions=el('div',undefined,'fbe-actions'),input=el('input');input.type='file';input.accept='image/png,image/jpeg';input.hidden=true;input.setAttribute('aria-label','选择本地截图');
  const capture=button('截图说明',takeScreenshot),pick=button('选择图片文件',()=>input.click()),fromDraft=button('从当前稿创建示例',loadDraft),more=el('details',undefined,'fbe-more');more.append(el('summary','更多材料'),pick,fromDraft);actions.append(capture,input,more);
  const status=el('p','可截取当前页面，也可粘贴或拖入图片。涉密材料禁止上传。','fbe-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const stage=el('div',undefined,'fbe-stage'),list=el('div');stage.hidden=true;root.append(actions,status,stage,list);container.append(root);
  const announce=(text,error=false)=>{if(disposed)return;status.textContent=text;status.dataset.error=String(error);};
  const notify=()=>{if(!disposed)onChange();};
  const release=item=>{if(item?.url)URL.revokeObjectURL(item.url);if(item?.edit?.source){item.edit.source.width=0;item.edit.source.height=0;}};
  const clearActive=()=>{if(active?.source&&!files.some(item=>item.edit?.source===active.source)&&active.old?.edit?.source!==active.source){active.source.width=0;active.source.height=0;}active=null;stage.replaceChildren();stage.hidden=true;};
  const editingAvailable=()=>{if(locked)return false;if(active){announce('请先完成或取消当前副本，再准备另一个。',true);return false;}if(files.length>=MAX_FILES){announce('一次最多4份证据，请先移除不需要的副本。',true);return false;}return !busy;};
  const tools=(...nodes)=>{const row=el('div',undefined,'fbe-actions');row.append(...nodes);return row;};
  function endEdit(restore=false){if(active?.old&&restore)files.push(active.old);clearActive();renderList();notify();announce(restore?'已取消修改，保留此前确认的副本。':'已取消本地准备，原稿未改变。');}
  function semanticDescription(block){
    const values={role:{auto:'自动识别',body:'正文',title:'标题',heading:'一级标题',heading2:'二级标题',heading3:'三级标题',heading4:'四级标题',article:'条款',signature:'署名',date:'日期'},align:{auto:'自动',left:'左对齐',center:'居中',right:'右对齐',both:'两端对齐'},indent:{auto:'自动',none:'无首行缩进',two:'首行两字'},before:{auto:'自动',none:'无',half:'半行',one:'一行'},after:{auto:'自动',none:'无',half:'半行',one:'一行'}};
    if(block.type==='table'||block.kind==='table')return block.header===undefined?'表头状态未提供':block.header?'首行为表头':'首行按数据行';
    const labels={role:'段落角色',align:'对齐',indent:'缩进',before:'段前',after:'段后'};return Object.keys(labels).filter(k=>block[k]!==undefined).map(k=>labels[k]+'：'+values[k][block[k]]).join('；');
  }
  function renderExample(example,parent){
    parent.append(el('p','这是可检查的结构示例，保留所选语义，不是原始Word/PDF页码、字体或像素复刻；分页和字体问题请另附必要截图。','fbe-help'));
    if(example.title!==undefined)parent.append(el('h4',example.title));
    for(const block of example.blocks){const semantics=semanticDescription(block);if(semantics)parent.append(el('p',semantics,'fbe-help'));
      if(block.type==='paragraph'){const p=el('p',block.text);p.dataset.role=block.role||'unspecified';const align={left:'left',center:'center',right:'right',both:'justify'}[block.align];if(align)p.style.textAlign=align;if(block.indent==='two')p.style.textIndent='2em';else if(block.indent==='none')p.style.textIndent='0';if(block.before!=='auto'&&block.before!==undefined)p.style.marginTop={none:'0',half:'.5em',one:'1em'}[block.before];if(block.after!=='auto'&&block.after!==undefined)p.style.marginBottom={none:'0',half:'.5em',one:'1em'}[block.after];parent.append(p);}
      else{const wrap=el('div',undefined,'fbe-table-scroll'),t=el('table');block.rows.forEach((row,index)=>{const tr=el('tr');for(const value of row)tr.append(el(index===0&&block.header===true?'th':'td',value));t.append(tr);});wrap.append(t);parent.append(wrap);}
    }
    const details=el('details'),summary=el('summary','查看实际示例JSON');details.append(summary,el('pre',JSON.stringify(example,null,2)));parent.append(details);
  }
  function renderList(){
    list.replaceChildren();for(const item of files){const row=el('div',undefined,'fbe-file'),label=el('p',`${item.name} · ${(item.blob.size/1024).toFixed(1)} KB`);row.append(label);
      const detail=el('details');detail.open=true;detail.append(el('summary',item.type==='image/png'?'将发送的图片':'将发送的示例'));
      if(item.type==='image/png'){const image=el('img',undefined,'fbe-image');image.src=item.url;image.alt='实际待发送的扁平截图副本';detail.append(image);}else renderExample(item.example,detail);
      if(item.type==='image/png')detail.append(el('p','图片会随反馈上传，请遮住不想发送的内容；不要上传涉密材料。','fbe-help'));row.append(detail,tools(button(item.type==='image/png'?'调整图片':'调整示例',()=>editExisting(item)),button('移除',()=>{files=files.filter(f=>f!==item);release(item);renderList();notify();announce('副本已移除，不会发送；原稿未改变。');})));list.append(row);
    }
  }
  function editExisting(item){if(active){announce('请先完成或取消正在准备的副本。',true);return;}files=files.filter(f=>f!==item);active={...item.edit,old:item};renderList();notify();if(item.type==='image/png')renderScreenshot();else renderSelection();announce('正在修改的副本已暂时移出发送清单。完成预览并加入后才会发送。');}
  async function addScreenshot(){
    if(!active||active.kind!=='image'||busy||locked)return;const current=active,version=epoch;busy=true;announce('正在本地生成实际像素副本…');
    try{if(current.requireSelection&&!current.selectedRect)throw Error('请先框选要分享的范围。');const chosen=current.requireSelection?{...current,ops:[...current.ops,{mode:'crop',rect:{...current.selectedRect}}]}:current;const rendered=renderImage(chosen),safeSource=canvas(rendered.width,rendered.height);safeSource.getContext('2d').drawImage(rendered,0,0);const blob=await png(rendered);rendered.width=0;rendered.height=0;if(disposed||epoch!==version||active!==current){safeSource.width=0;safeSource.height=0;return;}if(blob.size>MAX_BYTES){safeSource.width=0;safeSource.height=0;throw Error('最终图片超过4MB，请裁剪必要区域再试。');}
      const item={id:current.old?.id||crypto.randomUUID(),name:current.old?.name||`反馈截图-${++serial}.png`,blob,type:'image/png',url:URL.createObjectURL(blob),edit:{kind:'image',source:safeSource,ops:[],requireSelection:false}};
      if(current.old?.url)URL.revokeObjectURL(current.old.url);current.source.width=0;current.source.height=0;files.push(item);active=null;stage.replaceChildren();stage.hidden=true;renderList();notify();announce('图片已就绪。图片会随反馈上传，请遮住不想发送的内容；不要上传涉密材料。');
    }catch(e){announce(e.message||'副本生成失败，原稿未改变。',true);}finally{if(epoch===version)busy=false;notify();}
  }
  function renderImage(image){
    let surface=canvas(image.source.width,image.source.height);surface.getContext('2d').drawImage(image.source,0,0);
    for(const op of image.ops){if(op.mode==='crop'){const next=canvas(op.rect.width,op.rect.height);next.getContext('2d').drawImage(surface,op.rect.x,op.rect.y,op.rect.width,op.rect.height,0,0,op.rect.width,op.rect.height);surface.width=0;surface.height=0;surface=next;}
      else{const ctx=surface.getContext('2d');if(op.mode==='redact'){ctx.fillStyle='#202b3c';ctx.fillRect(op.rect.x,op.rect.y,op.rect.width,op.rect.height);}else{ctx.strokeStyle='#aa2633';ctx.lineWidth=Math.max(2,Math.min(8,Math.round(surface.width/200)));ctx.beginPath();ctx.ellipse(op.rect.x+op.rect.width/2,op.rect.y+op.rect.height/2,Math.max(.5,op.rect.width/2-ctx.lineWidth),Math.max(.5,op.rect.height/2-ctx.lineWidth),0,0,2*Math.PI);ctx.stroke();}}}
    return surface;
  }
  function renderScreenshot(){
    if(!active||active.kind!=='image')return;const current=active;stage.hidden=false;stage.replaceChildren(el('h4','调整这张图片'),el('p',current.requireSelection?'框选要分享的范围，再使用图片。也可先裁剪，再遮盖或圈注。':'拖动选区，可裁剪、遮盖或圈注。遮盖会写入实际像素。','fbe-help'));
    const rendered=renderImage(current),display=canvas(rendered.width,rendered.height);display.className='fbe-canvas';display.setAttribute('aria-label','截图区域选择预览');display.setAttribute('role','img');
    let rect={x:0,y:0,width:rendered.width,height:rendered.height},drag=null;const use=button('使用此图',addScreenshot,true);use.disabled=current.requireSelection&&!current.selectedRect;
    function show(){display.getContext('2d').drawImage(rendered,0,0);const ctx=display.getContext('2d');ctx.strokeStyle='#2458b8';ctx.lineWidth=Math.max(1,Math.round(display.width/320));ctx.setLineDash([ctx.lineWidth*4,ctx.lineWidth*2]);ctx.strokeRect(rect.x+.5,rect.y+.5,rect.width-1,rect.height-1);ctx.setLineDash([]);}
    const point=event=>{const bounds=display.getBoundingClientRect();return {x:Math.max(0,Math.min(display.width-1,Math.floor((event.clientX-bounds.left-display.clientLeft)/display.clientWidth*display.width))),y:Math.max(0,Math.min(display.height-1,Math.floor((event.clientY-bounds.top-display.clientTop)/display.clientHeight*display.height)))};};
    display.addEventListener('pointerdown',event=>{drag=point(event);display.setPointerCapture(event.pointerId);});display.addEventListener('pointermove',event=>{if(!drag)return;const end=point(event);rect={x:Math.min(drag.x,end.x),y:Math.min(drag.y,end.y),width:Math.abs(drag.x-end.x)+1,height:Math.abs(drag.y-end.y)+1};current.selectedRect={...rect};use.disabled=false;show();});display.addEventListener('pointerup',()=>{drag=null;});display.addEventListener('pointercancel',()=>{drag=null;});
    const operation=mode=>{if(locked)return;try{if(current.requireSelection&&mode!=='crop')throw Error('先裁剪要分享的范围，再遮盖或圈注。');const values={...rect};validRectangle(values,display.width,display.height);if(current.ops.length>=40)throw Error('最多40次处理，请撤销不必要的步骤。');current.ops.push({mode,rect:values});if(mode==='crop')current.requireSelection=false;current.selectedRect=null;rendered.width=0;rendered.height=0;renderScreenshot();announce(mode==='redact'?'所选区域已用实际不透明像素遮盖。请核对整张最终副本。':'已在本地处理，可撤销或继续。');}catch(e){announce(e.message,true);}};
    const undo=button('撤销上一步',()=>{if(locked)return;const removed=current.ops.pop();if(removed?.mode==='crop'&&current.captured&&!current.ops.some(o=>o.mode==='crop'))current.requireSelection=true;rendered.width=0;rendered.height=0;renderScreenshot();});undo.disabled=!current.ops.length;
    stage.append(display,tools(button('裁剪到选区',()=>operation('crop')),button('遮盖选区',()=>operation('redact')),button('圈注选区',()=>operation('outline')),undo),el('p','虚线仅是选区，不会发送；只有点击“遮盖选区”才会消除选区原像素。','fbe-help'),tools(use,button(current.old?'取消修改并恢复原副本':'取消截图准备',()=>{rendered.width=0;rendered.height=0;endEdit(Boolean(current.old));})));show();
  }
  async function addLocalImage(file){
    if(!file||!editingAvailable())return;const version=epoch;busy=true;notify();announce('正在本地准备图片，尚未上传。');
    try{if(file.size>8*1024*1024)throw Error('图片最多8MB，请缩小范围。');const bytes=await file.arrayBuffer();inspectScreenshotHeader(bytes);const decoded=await createImageBitmap(new Blob([bytes]),{imageOrientation:'none'});if(disposed||epoch!==version){decoded.close();return;}
      if(decoded.width>4096||decoded.height>4096||decoded.width*decoded.height>8000000){decoded.close();throw Error('图片超过像素限制，请先缩小范围。');}const source=canvas(decoded.width,decoded.height),ctx=source.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,source.width,source.height);ctx.drawImage(decoded,0,0);decoded.close();active={kind:'image',source,ops:[],requireSelection:false};busy=false;await addScreenshot();
    }catch(e){announce(e.message||'图片无法读取，请选择PNG或JPEG。',true);}finally{if(epoch===version)busy=false;notify();}
  }
  input.addEventListener('change',()=>{const file=input.files?.[0];input.value='';addLocalImage(file);});
  async function takeScreenshot(){
    if(!editingAvailable())return;const version=epoch;busy=true;notify();announce('正在生成当前页面截图…');
    try{const frame=await captureFeedbackFrame({beforeCapture:onCaptureStart,afterCapture:onCaptureEnd,signal:captureAbort.signal});if(!frame){announce('已取消截图，原填写保持。');return;}if(disposed||epoch!==version){frame.width=0;frame.height=0;return;}active={kind:'image',source:frame,ops:[],captured:true,requireSelection:true};renderScreenshot();announce((frame.dataset.feedbackCaptureScaled==='true'?'画面已缩小以便本地处理。':'')+'框选需要分享的区域。未选画面不会上传。');
    }catch(e){if(e.code==='unsupported')more.open=true;announce(e.message||'无法截取画面；可粘贴、拖入图片或选择文件。',true);}finally{if(epoch===version)busy=false;notify();}
  }
  const pasteTarget=container.closest('.feedback-compose')||container;
  const pasteImages=event=>{const images=[...(event.clipboardData?.files||[])].filter(f=>/^image\/(png|jpeg)$/.test(f.type));if(!images.length)return;event.preventDefault();(async()=>{for(const file of images)await addLocalImage(file);})().catch(()=>announce('图片未能准备，请重试。',true));};
  const dragImages=event=>{if([...(event.dataTransfer?.types||[])].includes('Files'))event.preventDefault();};
  const dropImages=event=>{const all=[...(event.dataTransfer?.files||[])];if(!all.length)return;event.preventDefault();if(all.some(f=>!/^image\/(png|jpeg)$/.test(f.type))){announce('只接受PNG或JPEG图片，不会读取或上传原文档。',true);return;}(async()=>{for(const file of all)await addLocalImage(file);})().catch(()=>announce('图片未能准备，请重试。',true));};
  pasteTarget.addEventListener('paste',pasteImages);pasteTarget.addEventListener('dragover',dragImages);pasteTarget.addEventListener('drop',dropImages);
  async function loadDraft(){
    if(!editingAvailable())return;if(typeof getDraft!=='function'){announce('当前入口不能读取稿件。可以选择本地截图，或仅填写说明。',true);return;}
    const version=epoch;busy=true;notify();try{const draft=await getDraft();if(disposed||epoch!==version)return;const candidates=visibleEvidenceCandidates(draft);active={kind:'example',items:candidates.map(item=>({...item,selected:false}))};renderSelection();announce('请选择必要段落或表格，并替换身份和业务数据。默认没有任何内容被选中。');}catch(e){announce(e.message||'当前稿无法制作安全示例，请改用截图。',true);}finally{if(epoch===version)busy=false;notify();}
  }
  function renderSelection(){
    if(!active||active.kind!=='example')return;const current=active;stage.hidden=false;stage.replaceChildren(el('h4','选择必要内容并改成示例'),el('p','只会包含勾选后可见的标题、段落和表格。原件、批注、修订、作者、字体、原始材料和恢复信息不会进入此示例。','fbe-help'));
    const replace=el('div',undefined,'fbe-replace'),find=el('input'),replacement=el('input');find.placeholder='要替换的身份或业务数据';find.setAttribute('aria-label','示例中要替换的文字');replacement.placeholder='替换为虚构内容';replacement.setAttribute('aria-label','替换后的虚构内容');replace.append(find,replacement);stage.append(replace,tools(button('替换所有已选内容',()=>{if(!find.value){announce('先填写要替换的文字。',true);return;}for(const item of current.items.filter(i=>i.selected)){if(item.kind==='table')item.rows=item.rows.map(row=>row.map(cell=>cell.split(find.value).join(replacement.value)));else item.text=item.text.split(find.value).join(replacement.value);}renderSelection();announce('替换只作用于本地反馈副本；请逐项核对。');})));
    for(const item of current.items){const choice=el('div',undefined,'fbe-choice'),label=el('label'),check=el('input');check.type='checkbox';check.checked=Boolean(item.selected);label.append(check,document.createTextNode(item.label));const excerpt=item.kind==='table'?item.rows[0].join(' / '):item.text;choice.append(label,el('p',excerpt.slice(0,100)+(excerpt.length>100?'…':''),'fbe-help'));const semantics=semanticDescription(item);if(semantics)choice.append(el('p','选中后保留：'+semantics,'fbe-help'));const edits=el('div',undefined,'fbe-choice-edit');
      const populate=()=>{edits.replaceChildren();edits.hidden=!item.selected;if(!item.selected)return;if(item.kind==='table'){const wrap=el('div',undefined,'fbe-table-scroll'),table=el('table');item.rows.forEach((row,ri)=>{const tr=el('tr');row.forEach((value,ci)=>{const td=el('td'),field=el('textarea');field.value=value;field.maxLength=1000;field.setAttribute('aria-label',`${item.label} 第${ri+1}行第${ci+1}列示例文字`);field.addEventListener('input',()=>{item.rows[ri][ci]=field.value;});td.append(field);tr.append(td);});table.append(tr);});wrap.append(table);edits.append(wrap);}else{const field=el('textarea');field.value=item.text;field.maxLength=item.kind==='title'?300:10000;field.setAttribute('aria-label',item.label+'的示例文字');field.addEventListener('input',()=>{item.text=field.value;});edits.append(field);}};
      check.addEventListener('change',()=>{item.selected=check.checked;populate();});populate();choice.append(edits);stage.append(choice);
    }
    stage.append(tools(button('预览实际示例副本',previewExample,true),button(current.old?'取消修改并恢复原副本':'取消示例准备',()=>endEdit(Boolean(current.old)))));
  }
  function previewExample(){
    if(!active||active.kind!=='example')return;const current=active;try{const example=exampleFromSelection(current.items),raw=JSON.stringify(example),blob=new Blob([raw],{type:'application/json'});if(blob.size>1024*1024)throw Error('示例JSON超过1MB，请减少内容。');stage.replaceChildren(el('h4','核对实际示例副本'),el('p',hint,'fbe-help'));renderExample(example,stage);const risks=evidenceRisks(example);stage.append(el('p',risks.length?'本地提示：'+risks.join('、')+'。请返回替换并重新核对。':'未提示出常见号码或邮箱，也不代表已经完全脱敏。请逐项核对文字和表格。','fbe-help'));
      const add=button('加入待发送副本',()=>{if(disposed||active!==current)return;const item={id:current.old?.id||crypto.randomUUID(),name:current.old?.name||`反馈示例-${++serial}.json`,blob,type:'application/json',example,edit:{kind:'example',items:structuredClone(current.items.filter(i=>i.selected))}};files.push(item);active=null;stage.replaceChildren();stage.hidden=true;renderList();notify();announce('所选示例已加入待发送清单。只包含预览中的白名单内容，原稿未改变。');},true);
      if(risks.some(r=>r.includes('涉密'))){add.disabled=true;stage.append(el('p','示例含可能的涉密标识。涉密材料禁止上传，请取消或改用完全虚构材料。','fbe-status'));}stage.append(tools(add,button('返回修改示例',renderSelection)));
    }catch(e){announce(e.message||'示例生成失败，原稿未改变。',true);}
  }
  function clear(){epoch++;captureAbort.abort();captureAbort=new AbortController();for(const file of files)release(file);files=[];if(active?.old)release(active.old);clearActive();list.replaceChildren();busy=false;input.value='';notify();announce('证据副本已清除，原稿未改变。');}
  return {async getFiles(){if(busy||active)throw Error('请先完成或取消当前图片/示例的调整，再发送。');return files.map(({id,name,blob,type})=>({id,name,blob,type}));},isPreparing:()=>busy||Boolean(active),setLocked(value){locked=Boolean(value);root.inert=locked;},clear,dispose(){captureAbort.abort();clear();disposed=true;pasteTarget.removeEventListener('paste',pasteImages);pasteTarget.removeEventListener('dragover',dragImages);pasteTarget.removeEventListener('drop',dropImages);root.remove();}};
}
