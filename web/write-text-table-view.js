import {captureTextTableSelection,previewTextTable,applyTextTable} from './write-text-table.js';
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};

// A protected local transformation: no source content is modified until the final confirm.
export function installTextTableView({region,getContent,canEdit,onConfirm}){
  const dialog=el('dialog',undefined,'text-table-dialog');dialog.dataset.textTableRegion=region;dialog.setAttribute('aria-label','将所选文字组织成表格');
  const header=el('header'),heading=el('h2','将所选文字组织成表格'),intro=el('p','来源是当前稿选中的完整段落。纯文字不足以还原原表的合并、列宽或空格位置；下面是你明确选择的新组织方式，不称恢复原网格。');header.append(heading,intro);
  const body=el('div',undefined,'text-table-dialog-body'),source=el('section'),choices=el('section'),results=el('section'),message=el('p','', 'field-error');message.setAttribute('role','alert');const footer=el('footer',undefined,'text-table-dialog-footer'),actions=el('div',undefined,'dialog-actions'),cancel=el('button','取消','secondary'),confirm=el('button','确认在原位置组织表格','primary');for(const button of[cancel,confirm])button.type='button';message.dataset.textTableMessage='true';message.id='text-table-message-'+region;confirm.setAttribute('aria-describedby',message.id);actions.append(cancel,confirm);footer.append(message,actions);dialog.append(header,body,footer);body.append(source,choices,results);document.body.append(dialog);
  let request=null,selection=null,preview=null;const previewLink=el('button','查看二维预览','text-button text-table-show-preview');previewLink.type='button';previewLink.onclick=()=>{const pane=body.getBoundingClientRect(),target=results.getBoundingClientRect();body.scrollTop+=target.top-pane.top-8;previewLink.focus({preventScroll:true});};
  const mode=el('select');mode.setAttribute('aria-label','组织方式');for(const[value,label]of[['','请选择组织方式'],['rows','按明确列数，把各段依次排成格'],['header','所选字段作表头，新建待填写回执']]){const option=el('option',label);option.value=value;mode.append(option);}
  const columns=el('input');columns.type='number';columns.min='1';columns.max='10';columns.step='1';columns.placeholder='请填写';columns.setAttribute('aria-label','明确列数');
  const blankRows=el('input');blankRows.type='number';blankRows.min='1';blankRows.max='99';blankRows.step='1';blankRows.placeholder='请填写';blankRows.setAttribute('aria-label','待填写空白行数');
  const headerBox=el('input');headerBox.type='checkbox';headerBox.setAttribute('aria-label','第一行作为表头');
  const field=(name,input)=>{const label=el('label',name);label.append(input);return label;},modeField=field('组织方式',mode),columnField=field('列数（不会自动猜测）',columns),blankField=field('待填写的空白行数',blankRows),headerField=field('第一行作为表头（仅按实际用途选择）',headerBox);headerField.className='check';headerField.replaceChildren(headerBox,document.createTextNode('第一行作为表头（仅按实际用途选择）'));const headerColumns=el('p','','hint');choices.append(modeField,columnField,headerColumns,blankField,headerField);
  const explain=(text,failed=false)=>{message.textContent=text;message.className=failed?'field-error text-table-operation-message':'hint text-table-operation-message';};
  const error=text=>{explain(text,true);confirm.disabled=true;};
  function current(){return request&&request.signature===JSON.stringify(getContent());}
  function update(){
    preview=null;results.replaceChildren();confirm.disabled=true;blankField.hidden=mode.value!=='header';headerField.hidden=mode.value!=='rows';columnField.hidden=mode.value!=='rows';headerColumns.hidden=mode.value!=='header';if(!selection)return;if(!current())return error('当前稿已经变化，原选区快照不再适用。请取消后重新选择，原文未替换。');
    explain('');const includeIDs=[...source.querySelectorAll('input[type=checkbox]:checked')].map(input=>input.value);headerColumns.textContent=`已选 ${includeIDs.length} 个字段，对应 ${includeIDs.length} 列；每段文字成为一个表头。`;if(!mode.value){explain('请选择组织方式，未确认前不会改变当前稿。');return;}if(mode.value==='rows'&&!columns.value){explain('请填写列数（1–10），再核对二维预览；原文尚未改变。');return;}if(mode.value==='header'&&!blankRows.value){explain('请填写待填写的空白行数（1–99），再核对二维预览；原文尚未改变。');return;}
    try{
      preview=previewTextTable(getContent(),selection,{mode:mode.value,columns:mode.value==='header'?includeIDs.length:Number(columns.value),header:headerBox.checked,blankRows:Number(blankRows.value),includeIDs});
      results.append(el('h3','按当前选择组织后的表格'));
      for(const[index,item]of preview.tables.entries()){
        const section=el('section',undefined,'text-table-result'),table=el('table');table.setAttribute('aria-label','组织预览表格 '+(index+1));for(const[rowIndex,row]of item.rows.entries()){const tr=el('tr');for(const text of row){const cell=el(rowIndex===0&&item.header?'th':'td',text);if(!text){cell.textContent='';cell.setAttribute('aria-label','空白待填写单元格');}tr.append(cell);}table.append(tr);}section.append(el('p',`表格 ${index+1}：${item.rows.length} 行 × ${item.rows[0]?.length||0} 列`,'hint'),table);results.append(section);
      }
      const retained=el('section');retained.append(el('h3','不进入表格、继续保留的原文'));if(!preview.retainedOriginal.length)retained.append(el('p','所选文字全部进入上述表格；选区外内容仍保持。','hint'));for(const line of preview.retainedOriginal){const p=el('p',line.text.trim()?line.text:'（空白段：原空白字符仍保留）');p.className='text-table-source-line';retained.append(el('p',`原第 ${line.index+1} 段 · ${line.reason==='header-gap'?'空白间隔，保留为表外段并显示在新表之后':line.reason==='remainder'?'不足一整行，原位保留':'未选入表格，按说明保留'}`,'hint'),p);}results.append(retained);for(const warning of preview.warnings)results.append(el('p',warning,'hint'));confirm.disabled=!preview.canApply;if(preview.canApply){explain(`预览已就绪：${preview.tables.length} 张表。确认只替换已选文字，未用原文按预览说明保留。`);message.append(' ',previewLink);}else explain(!includeIDs.length?'尚未选入任何段落。请在原文列表选出需要组织的字段或段落；原文未替换。':'当前选择还不能组成完整表行。请减少列数或调整原段勾选；未用文字继续保留。');
    }catch(e){error(e.message||'当前选择尚不能完整组织，原文没有改变。');}
  }
  function revealFocused(){const input=document.activeElement;if(!dialog.open||!choices.contains(input))return;const pane=body.getBoundingClientRect(),r=input.getBoundingClientRect();if(r.bottom>pane.bottom-8)body.scrollTop+=r.bottom-pane.bottom+8;else if(r.top<pane.top+8)body.scrollTop-=pane.top+8-r.top;}
  for(const input of[mode,columns,blankRows,headerBox])input.addEventListener('input',()=>{update();requestAnimationFrame(revealFocused);});new ResizeObserver(()=>requestAnimationFrame(revealFocused)).observe(body);
  function close(){request=null;selection=null;preview=null;dialog.close();}
  cancel.onclick=close;dialog.addEventListener('cancel',()=>{request=null;selection=null;preview=null;});
  confirm.onclick=()=>{if(!canEdit()||!preview||!current())return error('当前稿已变化或暂不可编辑。请取消后重新选择，原文未替换。');try{const next=applyTextTable(getContent(),preview);if(onConfirm(next,request,preview)!==false)close();}catch(e){error(e.message||'原文已变化，没有替换。');}};
  return {
    open(candidate){
      request=candidate;selection=null;preview=null;message.textContent='';source.replaceChildren(el('h3','选中的原文（可取消不需要组织的段落）'));results.replaceChildren();choices.hidden=false;confirm.disabled=true;mode.value='';columns.value='';blankRows.value='';headerBox.checked=false;blankField.hidden=true;headerField.hidden=true;columnField.hidden=true;headerColumns.hidden=true;
      try{if(candidate?.boundaryError)throw Error(candidate.boundaryError);if(!candidate?.range)throw Error('请先在当前文稿中选中需要组织的完整段落，再点击此按钮。选区外文字不会自动加入。');if(!current())throw Error('原选择后文稿已经变化，请重新选择。不会依据旧快照替换。');selection=captureTextTableSelection(getContent(),candidate.range,{region,sectionOnly:region==='postscript'});const blankLines=selection.source.filter(line=>!line.text.trim()),blankChoices=el('details',undefined,'text-table-blank-choices');if(blankLines.length){blankChoices.append(el('summary',`查看 ${blankLines.length} 个未选入的空白/空格段（按需选择）`),el('p','这些原段默认保留为表外文字，不是原表空单元格。若确实要把某段作为空单元格，可在此明确选入；不会自动清除空白。','hint'));source.append(el('p',`${blankLines.length} 个空白/空格段默认未选入，原文保留，无需逐项取消。`,'hint'));}for(const line of selection.source){const blank=!line.text.trim(),label=el('label',undefined,'text-table-source-choice'),input=el('input');input.type='checkbox';input.checked=!blank;input.value=line.id;input.setAttribute('aria-label',`原第 ${line.index+1} 段进入表格`);const text=blank?`原第 ${line.index+1} 段：${line.text.length?'仅空白字符（'+[...line.text].length+'个）':'空段'}，默认表外保留`:line.text;label.append(input,el('span',text));(blank?blankChoices:source).append(label);input.addEventListener('change',update);}if(blankLines.length)source.append(blankChoices);update();}catch(e){choices.hidden=true;error(e.message||'请选择完整段落，不会扩大原选区。');}
      dialog.showModal();body.scrollTop=0;if(selection)mode.focus();else cancel.focus();
    },
    refresh(){if(dialog.open&&!current())error('当前稿已经变化，原选区快照不再适用。请取消后重新选择，原文未替换。');},
    get isOpen(){return dialog.open;},
  };
}
