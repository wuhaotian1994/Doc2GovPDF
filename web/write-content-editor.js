import {continuousField,mountContinuous,editorCaret} from './write-continuous.js';
import {setAnnex,annexAt} from './write-annexes.js';
import {paragraph,table,contentFromText,contentText,validateContent,splitContentParagraph,mergeContentParagraph,moveContentBlock,tabularContentAt} from './write-content.js';
const labels={auto:'自动识别',body:'正文',title:'标题',heading:'一级标题',heading2:'二级标题',heading3:'三级标题',heading4:'四级标题',article:'条文正文',signature:'署名',date:'日期'};
export function installContentEditor({getContent:readContent,onChange,onError,canEdit,onSettled,onPending,region='body'}){
  const $=id=>document.getElementById(region==='body'?id:id.startsWith('content-')?'postscript-'+id:id.replace(/^body/,'postscript')),root=$('content-workspace'),blocks=$('content-blocks'),toolbar=$('content-toolbar'),body=$('body');
  blocks.setAttribute('aria-label',region==='body'?'正文文稿':'落款后的文稿');blocks.setAttribute('aria-describedby',region==='body'?'body-hint body-error':'postscript-hint postscript-error');
  root.setAttribute('aria-describedby',region==='body'?'body-hint body-error':'postscript-hint postscript-error');
  let selected=null,past=[],future=[],request=null,formatOpen=false,editSession=null,displayContent=null,contextOpen=false;
  const getContent=()=>readContent()||displayContent;
  const snapshot=()=>{const input=inputFor(selected)||body;return {content:readContent()?structuredClone(readContent()):null,body:body.value,plainIndex:displayContent?.blocks.findIndex(b=>b.id===selected?.block)??0,selected:selected?{...selected}:null,range:{start:input.selectionStart,end:input.selectionEnd}};};
  const status=text=>{$('content-status').textContent=text;};
  const button=(text,action,disabled=false)=>{const node=document.createElement('button');node.type='button';node.className='secondary';node.textContent=text;node.disabled=disabled;node.onclick=()=>{if(canEdit())action();};return node;};
  const select=(label,values,current,change)=>{const wrap=document.createElement('label');wrap.textContent=label;const input=document.createElement('select');input.setAttribute('aria-label',label);for(const [value,text] of values){const option=document.createElement('option');option.value=value;option.textContent=text;input.append(option);}input.value=current;input.onchange=()=>{change(input.value);requestAnimationFrame(()=>{const updated=[...toolbar.querySelectorAll('select')].find(node=>node.getAttribute('aria-label')===label);updated?.focus({preventScroll:true});updated?.scrollIntoView({block:'nearest'});});};wrap.append(input);return wrap;};
  const current=()=>(getContent()||displayContent)?.blocks.find(block=>block.id===selected?.block);
  const inputFor=path=>{
    if(!path)return null;
    if(Number.isInteger(path.rowIndex)){
      const block=getContent()?.blocks.find(block=>block.id===path.block);
      if(block?.type==='table'){const row=block.rows[Math.min(path.rowIndex,block.rows.length-1)];path={block:block.id,row:row.id,cell:row.cells[Math.min(path.columnIndex,row.cells.length-1)].id};}
    }
    const candidates=blocks.querySelectorAll('[data-editor-key]');
    return [...candidates].find(input=>input.dataset.block===path.block&&(path.cell?input.dataset.cell===path.cell:path.caption?input.dataset.caption==='true':input.dataset.kind==='paragraph'))||[...candidates].find(input=>input.dataset.block===path.block&&input.dataset.kind==='cell')||null;
  };
  function reveal(input){
    if(!input?.isConnected||!input.getClientRects().length)return;
    input.scrollIntoView({block:'nearest',inline:'nearest'});
    const scroll=document.querySelector('.form-scroll');if(!scroll)return;
    const pane=scroll.getBoundingClientRect(),bar=toolbar.getBoundingClientRect(),rect=input.getBoundingClientRect(),top=Math.max(pane.top,bar.bottom>pane.top&&bar.top<pane.bottom?bar.bottom:pane.top)+6,bottom=pane.bottom-6;
    if(rect.height<=bottom-top){if(rect.top<top)scroll.scrollTop-=top-rect.top;else if(rect.bottom>bottom)scroll.scrollTop+=rect.bottom-bottom;}
  }
  function focus(path,range){const input=inputFor(path);if(!input)return;input.focus({preventScroll:true});input.setSelectionRange(range?.start??0,range?.end??range?.start??0);requestAnimationFrame(()=>reveal(input));}
  function historyButtons(){$('content-undo').hidden=!past.length;$('content-redo').hidden=!future.length;}
  function fitControls(){const scroll=document.querySelector('.form-scroll');if(!scroll)return;const height=scroll.clientHeight;toolbar.style.maxHeight=Math.max(64,height/2)+'px';root.style.setProperty('--content-input-max',Math.max(52,height/2-16)+'px');}
  function commit(next,{record=true,render=true,path=selected,range,message='',composing=false,before}={}){
    if(!canEdit())return false;
    try{
      const checked=next?validateContent(next,{postscript:region==='postscript'}):null;
      if(checked&&JSON.stringify(checked)===JSON.stringify(readContent())){if(!composing)onSettled?.();return true;}
      if(record){editSession=null;past.push(before||snapshot());if(past.length>40)past.shift();future=[];}
      onChange(checked,checked?contentText(checked):before?.body??body.value,{composing});
      if(render){draw();if(path)focus(path,range);}historyButtons();if(message)status(message);return true;
    }catch(error){onError(error.message);return false;}
  }
  function mutate(action,options={}){try{const next=structuredClone(getContent());action(next);return commit(next,options);}catch(error){onError(error.message);return false;}}
  function updateBlock(values){mutate(next=>Object.assign(next.blocks.find(block=>block.id===selected.block),values),{message:'段落设置已更新，可撤销。'});}
  function removeBlock(){mutate(next=>{next.blocks=next.blocks.filter(block=>block.id!==selected.block);if(!next.blocks.length)next.blocks.push(paragraph());},{path:null,message:'已移除，可撤销。'});}
  function move(direction){try{const section=getContent(),i=section.blocks.findIndex(b=>b.id===selected.block),a=annexAt(section,selected.block),b=annexAt(section,section.blocks[i+direction]?.id);if((a?.start||'')!==(b?.start||''))throw Error('这会改变附件内容范围，请先取消附件身份再调整位置。');commit(moveContentBlock(getContent(),selected.block,direction),{message:'顺序已调整，可撤销。'});}catch(error){onError(error.message);}}
  function split(){const block=current(),input=inputFor(selected);if(block?.type!=='paragraph'||!input)return;try{const next=splitContentParagraph(getContent(),block.id,input.selectionStart),index=next.blocks.findIndex(item=>item.id===block.id);commit(next,{path:{block:next.blocks[index+1].id},range:{start:0},message:'已拆成两段，可撤销。'});}catch(error){onError(error.message);}}
  function merge(){const content=getContent(),index=content.blocks.findIndex(block=>block.id===selected.block),previous=content.blocks[index-1];try{commit(mergeContentParagraph(content,selected.block),{path:{block:previous.id},range:{start:previous.text.length},message:'已与上一段合并，可撤销。'});}catch(error){onError(error.message);}}
  function tableChange(kind){
    const block=current();if(block?.type!=='table')return;
    const rowIndex=Math.max(0,block.rows.findIndex(row=>row.id===selected.row)),columnIndex=Math.max(0,block.rows[rowIndex].cells.findIndex(cell=>cell.id===selected.cell));
    mutate(next=>{
      const target=next.blocks.find(item=>item.id===block.id),columns=target.rows[0].cells.length;
      if(kind==='add-row'){if(target.rows.length>=100)throw Error('表格最多 100 行，原内容未改变。');target.rows.splice(rowIndex+1,0,table(1,columns).rows[0]);}
      if(kind==='remove-row'){if(target.rows.length<=1)throw Error('请至少保留一行，或移除整张表格。');target.rows.splice(rowIndex,1);}
      if(kind==='add-column'){if(columns>=10)throw Error('表格最多 10 列，原内容未改变。');for(const row of target.rows)row.cells.splice(columnIndex+1,0,{id:crypto.randomUUID(),text:''});}
      if(kind==='remove-column'){if(columns<=1)throw Error('请至少保留一列，或移除整张表格。');for(const row of target.rows)row.cells.splice(columnIndex,1);}
    },{path:{block:block.id,rowIndex:kind==='add-row'?rowIndex+1:rowIndex,columnIndex:kind==='add-row'?0:kind==='add-column'?columnIndex+1:columnIndex},message:'表格已调整，可撤销。'});
  }
  function renderToolbar(){
    const open=toolbar.querySelector('.content-format');if(open)formatOpen=open.open;const prior=toolbar.querySelector('[data-continuous-context]');if(prior)contextOpen=prior.open;
    const block=current();toolbar.replaceChildren();if(!block)return;fitControls();
    const index=getContent().blocks.indexOf(block),actions=document.createElement('div');actions.className='content-actions';
    if(block.type==='paragraph'){
      const marked=getContent().annexes?.find(a=>a.start===block.id||a.title===block.id);if(marked||/^附件\s*[0-9]*$/.test(block.text.trim()))actions.append(button(marked?'取消实际附件身份':'作为实际附件，另面起排',()=>{try{commit(setAnnex(getContent(),marked?.start||block.id,!marked),{message:marked?'已取消附件身份，原文仍保留。':'已确认实际附件：另面起排并核对附件说明，修改可撤销。'});}catch(e){onError(e.message);}}));
      if(!marked)actions.append(select('段落类型',Object.entries(labels),block.role,value=>updateBlock({role:value})),button('拆分段落',split),button('与上一段合并',merge,index===0||getContent().blocks[index-1].type!=='paragraph'));
    }else{
      const rowIndex=block.rows.findIndex(row=>row.id===selected?.row),columnIndex=rowIndex<0?-1:block.rows[rowIndex].cells.findIndex(cell=>cell.id===selected?.cell);
      const caption=document.createElement('strong');caption.textContent=`表格 · ${block.rows.length} 行 ${block.rows[0].cells.length} 列`+(rowIndex>=0&&columnIndex>=0?`；当前第 ${rowIndex+1} 行，第 ${columnIndex+1} 列`:'');actions.append(caption,button('下方加一行',()=>tableChange('add-row'),block.rows.length>=100),button('右侧加一列',()=>tableChange('add-column'),block.rows[0].cells.length>=10),button('删除当前行',()=>tableChange('remove-row'),block.rows.length<=1),button('删除当前列',()=>tableChange('remove-column'),block.rows[0].cells.length<=1));
      const header=document.createElement('label');header.className='check';const input=document.createElement('input');input.type='checkbox';input.checked=block.header;input.onchange=()=>mutate(next=>next.blocks.find(item=>item.id===block.id).header=input.checked,{message:'表头设置已更新，可撤销。'});header.append(input,document.createTextNode('第一行为表头'));actions.append(header);
    }
    if(getContent().annexes?.some(a=>a.start===block.id||a.title===block.id)){const note=document.createElement('p');note.className='hint';note.textContent='此处已声明实际附件：标识顶格、标题居中，导出另面起排。需恢复普通段落时先取消附件身份。';toolbar.append(note);}
    actions.append(button('上移',()=>move(-1),index===0),button('下移',()=>move(1),index===getContent().blocks.length-1),button(block.type==='table'?'移除表格':'删除本段',removeBlock));toolbar.append(actions);
    if(block.type==='paragraph'&&!getContent().annexes?.some(a=>a.start===block.id||a.title===block.id)){
      const details=document.createElement('details');details.className='content-format';const summary=document.createElement('summary');summary.textContent='对齐、缩进与段间距';details.append(summary);details.open=formatOpen;details.ontoggle=()=>{formatOpen=details.open;};
      const settings=document.createElement('div');settings.className='content-format-fields';
      settings.append(select('对齐',[['auto','随段落类型'],['left','左对齐'],['center','居中'],['right','右对齐'],['both','两端对齐']],block.align,value=>updateBlock({align:value})),select('首行缩进',[['auto','随段落类型'],['none','不缩进'],['two','两个字']],block.indent,value=>updateBlock({indent:value})),select('段前间距',[['auto','随段落类型'],['none','不留空'],['half','半行'],['one','一行']],block.before,value=>updateBlock({before:value})),select('段后间距',[['auto','随段落类型'],['none','不留空'],['half','半行'],['one','一行']],block.after,value=>updateBlock({after:value})));details.append(settings);toolbar.append(details);
    }
    const controls=[...toolbar.childNodes];toolbar.replaceChildren();const details=document.createElement('details');details.dataset.continuousContext='true';details.className='writing-context';details.open=contextOpen;details.ontoggle=()=>contextOpen=details.open;const summary=document.createElement('summary');summary.textContent=block.type==='table'?'表格设置':'段落与排版';details.append(summary,...controls);toolbar.append(details);
    if(block.type==='table')toolbar.prepend(button('下方加一行',()=>tableChange('add-row'),block.rows.length>=100));
  }
  function field(block,path,value,label,kind){
    const key=path.cell||block.id+(path.caption?':caption':'');
    const input=continuousField(value,key,{label,tag:kind==='paragraph'?'p':'div',className:kind==='paragraph'?'writing-line':'writing-cell'});
    input.dataset.block=block.id;input.dataset.kind=kind;input.dataset.role=block.role||'';if(path.cell)input.dataset.cell=path.cell;if(path.row)input.dataset.row=path.row;if(path.caption)input.dataset.caption='true';
    return input;
  }
  function draw(){
    const content=readContent()||contentFromText(body.value);displayContent=content;root.hidden=false;body.hidden=true;body.readOnly=true;$('content-edit').hidden=true;$('body-label').removeAttribute('for');blocks.replaceChildren();
    if(!content.blocks.some(block=>block.id===selected?.block))selected=null;
    content.blocks.forEach((block,index)=>{
      const section=document.createElement('section');section.className='content-block';section.dataset.contentBlock=block.id;
      if(block.type==='paragraph')section.append(field(block,{},block.text,`第 ${index+1} 段`,'paragraph'));
      else{
        if(block.caption)section.append(field(block,{caption:true},block.caption,'表格标题','caption'));
        const scroll=document.createElement('div');scroll.className='content-table-scroll';const grid=document.createElement('table');grid.className='content-table';grid.style.minWidth=block.rows[0].cells.length*100+'px';
        block.rows.forEach((row,i)=>{const tr=document.createElement('tr');row.cells.forEach((cell,j)=>{const td=document.createElement(i===0&&block.header?'th':'td');td.append(field(block,{row:row.id,cell:cell.id},cell.text,`第 ${i+1} 行，第 ${j+1} 列`,'cell'));tr.append(td);});grid.append(tr);});scroll.append(grid);section.append(scroll);
      }
      blocks.append(section);
    });renderToolbar();historyButtons();
  }
  function entries(){return (getContent()||displayContent)?.blocks.flatMap(block=>block.type==='paragraph'?[{key:block.id,text:block.text,path:{block:block.id},kind:'paragraph'}]:[...(block.caption||blocks.querySelector(`[data-block="${block.id}"][data-caption]`)?[{key:block.id+':caption',text:block.caption,path:{block:block.id,caption:true},kind:'caption'}]:[]),...block.rows.flatMap(row=>row.cells.map(cell=>({key:cell.id,text:cell.text,path:{block:block.id,row:row.id,cell:cell.id},kind:'cell'})))])||[];}
  function ensure(){if(!getContent()){onChange(displayContent,contentText(displayContent),{});}return getContent();}
  function setText(next,entry,text){const b=next.blocks.find(b=>b.id===entry.path.block);if(entry.kind==='paragraph')b.text=text;else if(entry.kind==='caption')b.caption=text;else b.rows.find(row=>row.id===entry.path.row).cells.find(cell=>cell.id===entry.path.cell).text=text;}
  function selectedRange(range){const es=entries(),a=es.findIndex(e=>e.key===range.start.key),b=es.findIndex(e=>e.key===range.end.key);if(a<0||b<a)throw Error('请选择文稿中的文字。');return {es,a,b};}
  function replaceRange(range,text,{inputType='insertFromPaste',softBreak=false}={}){
    if(text.length>(region==='postscript'?4000:100000)||text.split('\n').length>1000)throw Error('粘贴内容超过当前文稿限制，原内容未改变；请分成适当范围后再试。');
    ensure();const {es,a,b}=selectedRange(range),first=es[a],last=es[b],next=structuredClone(getContent());
    if(a===0&&b===es.length-1&&range.start.offset===0&&range.end.offset===last.text.length&&(a!==b||first.kind!=='paragraph')){
      const before=snapshot(),parts=text.split('\n').map(value=>paragraph(value));if(first.kind==='paragraph')parts[0]={...next.blocks[0],text:parts[0].text};next.blocks=parts;delete next.annexes;commit(next,{before,path:{block:parts.at(-1).id},range:{start:parts.at(-1).text.length}});editSession=null;return;
    }
    if(a!==b&&(first.kind!=='paragraph'||last.kind!=='paragraph'))throw Error('选区只覆盖了表格的一部分，请在单元格内修改；原表结构仍保留。');
    selected=first.path;const before=snapshot();before.range={start:range.start.offset,end:range.end.offset};
    const prefix=first.text.slice(0,range.start.offset),suffix=last.text.slice(range.end.offset);
    if(first.kind!=='paragraph'||softBreak){setText(next,first,prefix+text+suffix);commit(next,{before,path:first.path,range:{start:prefix.length+text.length}});return;}
    const at=next.blocks.findIndex(x=>x.id===first.path.block),end=next.blocks.findIndex(x=>x.id===last.path.block),base=next.blocks[at],lines=(prefix+text+suffix).split('\n'),preserveLast=a===b&&range.start.offset===0&&range.end.offset===0&&text.endsWith('\n'),parts=lines.map((text,i)=>(preserveLast?i===lines.length-1:i===0)?({...base,text}):paragraph(text));
    const involved=new Set(next.blocks.slice(at,end+1).map(b=>b.id));if(next.annexes?.some(v=>involved.has(v.start)||involved.has(v.title))&&(end!==at||(parts.length!==1&&parts.find(p=>p.id===base.id)?.text!==base.text)))throw Error('附件标识或标题不能从中间拆开；可在行首或行尾继续写，或先取消附件身份。');
    next.blocks.splice(at,end-at+1,...parts);const caretLine=text.split('\n').length-1;commit(next,{before,path:{block:parts[caretLine].id},range:{start:caretLine?text.split('\n').at(-1).length:prefix.length+text.length}});editSession=null;
  }
  const surface=mountContinuous({host:blocks,entries,canEdit,onError,recover:draw,settled:onSettled,unsupported:status,controls:toolbar,onBlur:()=>{toolbar.replaceChildren();contextOpen=false;formatOpen=false;},suspend:()=>onPending?.(),
    onSelect(entry){const changed=selected?.block!==entry.path.block||selected?.cell!==entry.path.cell;ensure();selected=entry.path;if(changed||!toolbar.childElementCount){contextOpen=false;formatOpen=false;renderToolbar();}},
    apply(values,meta){ensure();const next=structuredClone(getContent()),all=entries();for(const v of values){const entry=all.find(e=>e.key===v.key);if(entry)setText(next,entry,v.text);}
      const key=meta.selection?.start.key||selected?.block,now=Date.now(),fresh=!editSession||editSession.key!==key||now-editSession.time>1000||meta.beforeSelection&&!meta.beforeSelection.collapsed||/Paste|Replacement/.test(meta.inputType);const before=snapshot();if(meta.beforeSelection)before.range={start:meta.beforeSelection.start.offset,end:meta.beforeSelection.end.offset};
      if(!commit(next,{record:fresh,render:false,composing:meta.composing,before})){draw();if(selected)focus(selected);return;}editSession={key,time:now};},
    replace:replaceRange,
    split(range,soft){replaceRange(range,'\n',{softBreak:soft||range.startEntry.kind!=='paragraph'});},
    join(range,direction){ensure();const entry=range.startEntry;if(entry.kind!=='paragraph')return;selected=entry.path;const content=getContent(),i=content.blocks.findIndex(b=>b.id===selected.block),other=content.blocks[i+direction];if(!other||other.type!=='paragraph')return;const start=direction<0?other:content.blocks[i],end=direction<0?content.blocks[i]:other;replaceRange({start:{key:start.id,offset:start.text.length},end:{key:end.id,offset:0}},'');},
    undo:()=>restore(past,future),redo:()=>restore(future,past)});
  function activate(){
    if(getContent()){focus(selected);return;}
    try{const content=contentFromText(body.value);commit(content,{path:{block:content.blocks[0].id},message:'已在当前稿开启段落编辑，所有修改可撤销。'});}catch(error){onError(error.message);}
  }
  function openTable(){
    if(!canEdit())return;
    try{
      const content=getContent()?structuredClone(getContent()):contentFromText(body.value),index=getContent()?Math.max(0,content.blocks.findIndex(block=>block.id===selected?.block)):Math.min(content.blocks.length-1,body.value.slice(0,body.selectionStart).split('\n').length-1);
      const conversion=tabularContentAt(content,index)||(content.blocks[index]?.type==='paragraph'?tabularContentAt(content,index+1):null);
      request={before:snapshot(),content,index,insertOffset:inputFor(selected)?.selectionStart,body:body.value,original:JSON.stringify(getContent()),conversion};$('content-table-form').reset();$('content-table-message').textContent='';
      $('content-table-conversion').hidden=!conversion;$('content-table-convert').checked=Boolean(conversion);$('content-table-source').value=conversion?conversion.rows.map(row=>row.join('\t')).join('\n'):'';
      if(conversion){$('content-table-rows').value=conversion.rows.length;$('content-table-columns').value=conversion.rows[0].length;}
      $('content-table-dialog').showModal();$('content-table-rows').focus();
    }catch(error){onError(error.message);}
  }
  function restore(from,to){if(!canEdit()||!from.length)return;const next=from.pop();editSession=null;to.push(snapshot());onChange(next.content,next.content?contentText(next.content):next.body,{});selected=next.selected;draw();historyButtons();if(next.content)focus(selected,next.range);else{focus({block:displayContent.blocks[Math.max(0,next.plainIndex||0)]?.id||displayContent.blocks[0].id},next.range);}status('正文调整已撤销或恢复。');}
  $('content-edit').onclick=activate;$('content-add-table').onclick=openTable;$('content-undo').onclick=()=>restore(past,future);$('content-redo').onclick=()=>restore(future,past);
  $('content-table-cancel').onclick=()=>{request=null;$('content-table-dialog').close();};$('content-table-dialog').addEventListener('cancel',()=>{request=null;});
  $('content-table-form').onsubmit=event=>{
    event.preventDefault();if(!request||!canEdit())return;
    try{
      if(request.body!==body.value||request.original!==JSON.stringify(getContent()))throw Error('正文已变化，请关闭表格窗口后重新选择位置。');
      const grid=table(Number($('content-table-rows').value),Number($('content-table-columns').value),$('content-table-caption').value),next=structuredClone(request.content);
      if(request.conversion&&$('content-table-convert').checked){
        const original=request.conversion;
        if(grid.rows.length<original.rows.length||grid.rows[0].cells.length<original.rows[0].length)throw Error('所选行列不能完整容纳原文，请增加行列数，或取消转换。原内容未改变。');
        original.rows.forEach((row,i)=>row.forEach((text,j)=>grid.rows[i].cells[j].text=text));next.blocks.splice(original.start,original.count,grid);
      }else if(next.blocks.length===1&&next.blocks[0].type==='paragraph'&&!next.blocks[0].text)next.blocks=[grid];else{
        const original=next.blocks[request.index],offset=request.insertOffset;
        if(original.type==='paragraph'&&Number.isInteger(offset)&&offset<original.text.length){
          if(next.annexes?.some(a=>a.start===original.id||a.title===original.id))throw Error('请在完整附件标识或标题之后插表，原附件身份与文字保持。');
          if(offset===0)next.blocks.splice(request.index,0,grid);else next.blocks.splice(request.index,1,{...original,text:original.text.slice(0,offset)},grid,paragraph(original.text.slice(offset)));
        }else next.blocks.splice(request.index+1,0,grid);
      }
      if(next.blocks.at(-1)?.type==='table')next.blocks.push(paragraph());
      if(commit(next,{before:request.before,path:null,message:'表格已加入当前稿，可直接填写单元格或调整行列。'})){request=null;$('content-table-dialog').close();$('content-table-message').textContent='';focus({block:grid.id,row:grid.rows[0].id,cell:grid.rows[0].cells[0].id});}
    }catch(error){$('content-table-message').textContent=error.message;}
  };

  blocks.addEventListener('keydown',event=>{if(event.altKey&&!event.isComposing&&['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();if(selected&&canEdit())move(event.key==='ArrowUp'?-1:1);}});
  const scroll=document.querySelector('.form-scroll');if(scroll)new ResizeObserver(fitControls).observe(scroll);
  return {
    set(value){past=[];future=[];selected=null;editSession=null;contextOpen=false;draw();},
    focusSource(path,original){path ||= {block:displayContent.blocks[0].id};const input=inputFor(path);if(!input)return false;input.focus({preventScroll:true});const lines=input.value.split('\n'),part=Number.isInteger(path.line)?path.line:null,offset=part===null?0:lines.slice(0,part).reduce((n,line)=>n+line.length+1,0),text=part===null?input.value:lines[part]||'',start=original?text.indexOf(original):-1;input.setSelectionRange(offset+(start>=0?start:0),offset+(start>=0?start+original.length:text.length));requestAnimationFrame(()=>reveal(input));return true;},
    focusText(start=0,original){const index=body.value.slice(0,start).split('\n').length-1,block=displayContent.blocks[Math.max(0,index)]||displayContent.blocks[0],input=inputFor({block:block.id});if(!input)return false;const found=original?input.value.indexOf(original):-1;focus({block:block.id},{start:Math.max(0,found),end:found>=0?found+original.length:input.value.length});return true;},
    refresh:draw,
  };
}
