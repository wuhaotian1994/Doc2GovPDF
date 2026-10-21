import {paragraph,table,contentFromText,contentText,validateContent,splitContentParagraph,mergeContentParagraph,moveContentBlock,tabularContentAt} from './write-content.js';
const labels={auto:'自动识别',body:'正文',title:'标题',heading:'一级标题',heading2:'二级标题',heading3:'三级标题',heading4:'四级标题',article:'条文正文',signature:'署名',date:'日期'};
export function installContentEditor({getContent,onChange,onError,canEdit,onSettled,region='body'}){
  const $=id=>document.getElementById(region==='body'?id:id.startsWith('content-')?'postscript-'+id:id.replace(/^body/,'postscript')),root=$('content-workspace'),blocks=$('content-blocks'),toolbar=$('content-toolbar'),body=$('body');
  root.setAttribute('aria-describedby',region==='body'?'body-hint body-error':'postscript-hint postscript-error');
  let selected=null,past=[],future=[],request=null,formatOpen=false,editSession=null;
  const snapshot=()=>{const input=inputFor(selected)||body;return {content:getContent()?structuredClone(getContent()):null,body:body.value,selected:selected?{...selected}:null,range:{start:input.selectionStart,end:input.selectionEnd}};};
  const status=text=>{$('content-status').textContent=text;};
  const button=(text,action,disabled=false)=>{const node=document.createElement('button');node.type='button';node.className='secondary';node.textContent=text;node.disabled=disabled;node.onclick=()=>{if(canEdit())action();};return node;};
  const select=(label,values,current,change)=>{const wrap=document.createElement('label');wrap.textContent=label;const input=document.createElement('select');input.setAttribute('aria-label',label);for(const [value,text] of values){const option=document.createElement('option');option.value=value;option.textContent=text;input.append(option);}input.value=current;input.onchange=()=>{change(input.value);requestAnimationFrame(()=>{const updated=[...toolbar.querySelectorAll('select')].find(node=>node.getAttribute('aria-label')===label);updated?.focus({preventScroll:true});updated?.scrollIntoView({block:'nearest'});});};wrap.append(input);return wrap;};
  const current=()=>getContent()?.blocks.find(block=>block.id===selected?.block);
  const inputFor=path=>{
    if(!path)return null;
    if(Number.isInteger(path.rowIndex)){
      const block=getContent()?.blocks.find(block=>block.id===path.block);
      if(block?.type==='table'){const row=block.rows[Math.min(path.rowIndex,block.rows.length-1)];path={block:block.id,row:row.id,cell:row.cells[Math.min(path.columnIndex,row.cells.length-1)].id};}
    }
    const candidates=blocks.querySelectorAll('textarea');
    return [...candidates].find(input=>input.dataset.block===path.block&&(path.cell?input.dataset.cell===path.cell:path.caption?input.dataset.caption==='true':input.dataset.kind==='paragraph'))||[...candidates].find(input=>input.dataset.block===path.block&&input.dataset.kind==='cell')||null;
  };
  function reveal(input){
    if(!input?.isConnected||!input.getClientRects().length)return;
    input.scrollIntoView({block:'nearest',inline:'nearest'});
    const scroll=document.querySelector('.form-scroll');if(!scroll)return;
    const pane=scroll.getBoundingClientRect(),bar=toolbar.getBoundingClientRect(),rect=input.getBoundingClientRect(),top=Math.max(pane.top,bar.bottom>pane.top&&bar.top<pane.bottom?bar.bottom:pane.top)+6,bottom=pane.bottom-6;
    if(rect.height<=bottom-top){if(rect.top<top)scroll.scrollTop-=top-rect.top;else if(rect.bottom>bottom)scroll.scrollTop+=rect.bottom-bottom;}
  }
  function focus(path,range){const input=inputFor(path);if(!input)return;input.focus({preventScroll:true});if(range)input.setSelectionRange(range.start,range.end??range.start);requestAnimationFrame(()=>reveal(input));}
  function historyButtons(){$('content-undo').hidden=!past.length;$('content-redo').hidden=!future.length;}
  function fitControls(){const scroll=document.querySelector('.form-scroll');if(!scroll)return;const height=scroll.clientHeight;toolbar.style.maxHeight=Math.max(64,height/2)+'px';root.style.setProperty('--content-input-max',Math.max(52,height/2-16)+'px');}
  function commit(next,{record=true,render=true,path=selected,range,message='',composing=false,before}={}){
    if(!canEdit())return false;
    try{
      const checked=next?validateContent(next,{postscript:region==='postscript'}):null;
      if(checked&&JSON.stringify(checked)===JSON.stringify(getContent())){if(!composing)onSettled?.();return true;}
      if(record){past.push(before||snapshot());if(past.length>40)past.shift();future=[];}
      onChange(checked,checked?contentText(checked):before?.body??body.value,{composing});
      if(render){draw();if(path)focus(path,range);}historyButtons();if(message)status(message);return true;
    }catch(error){onError(error.message);return false;}
  }
  function mutate(action,options={}){try{const next=structuredClone(getContent());action(next);return commit(next,options);}catch(error){onError(error.message);return false;}}
  function updateBlock(values){mutate(next=>Object.assign(next.blocks.find(block=>block.id===selected.block),values),{message:'段落设置已更新，可撤销。'});}
  function removeBlock(){mutate(next=>{next.blocks=next.blocks.filter(block=>block.id!==selected.block);if(!next.blocks.length)next.blocks.push(paragraph());},{path:null,message:'已移除，可撤销。'});}
  function move(direction){try{commit(moveContentBlock(getContent(),selected.block,direction),{message:'顺序已调整，可撤销。'});}catch(error){onError(error.message);}}
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
    },{path:{block:block.id,rowIndex,columnIndex},message:'表格已调整，可撤销。'});
  }
  function renderToolbar(){
    const open=toolbar.querySelector('details');if(open)formatOpen=open.open;
    const block=current();toolbar.replaceChildren();if(!block)return;fitControls();
    const index=getContent().blocks.indexOf(block),actions=document.createElement('div');actions.className='content-actions';
    if(block.type==='paragraph'){
      actions.append(select('段落类型',Object.entries(labels),block.role,value=>updateBlock({role:value})),button('拆分段落',split),button('与上一段合并',merge,index===0||getContent().blocks[index-1].type!=='paragraph'));
    }else{
      const rowIndex=block.rows.findIndex(row=>row.id===selected?.row),columnIndex=rowIndex<0?-1:block.rows[rowIndex].cells.findIndex(cell=>cell.id===selected?.cell);
      const caption=document.createElement('strong');caption.textContent=`表格 · ${block.rows.length} 行 ${block.rows[0].cells.length} 列`+(rowIndex>=0&&columnIndex>=0?`；当前第 ${rowIndex+1} 行，第 ${columnIndex+1} 列`:'');actions.append(caption,button('下方加一行',()=>tableChange('add-row'),block.rows.length>=100),button('右侧加一列',()=>tableChange('add-column'),block.rows[0].cells.length>=10),button('删除当前行',()=>tableChange('remove-row'),block.rows.length<=1),button('删除当前列',()=>tableChange('remove-column'),block.rows[0].cells.length<=1));
      const header=document.createElement('label');header.className='check';const input=document.createElement('input');input.type='checkbox';input.checked=block.header;input.onchange=()=>mutate(next=>next.blocks.find(item=>item.id===block.id).header=input.checked,{message:'表头设置已更新，可撤销。'});header.append(input,document.createTextNode('第一行为表头'));actions.append(header);
    }
    actions.append(button('上移',()=>move(-1),index===0),button('下移',()=>move(1),index===getContent().blocks.length-1),button(block.type==='table'?'移除表格':'删除本段',removeBlock));toolbar.append(actions);
    if(block.type==='paragraph'){
      const details=document.createElement('details');details.className='content-format';const summary=document.createElement('summary');summary.textContent='对齐、缩进与段间距';details.append(summary);details.open=formatOpen;details.ontoggle=()=>{formatOpen=details.open;};
      const settings=document.createElement('div');settings.className='content-format-fields';
      settings.append(select('对齐',[['auto','随段落类型'],['left','左对齐'],['center','居中'],['right','右对齐'],['both','两端对齐']],block.align,value=>updateBlock({align:value})),select('首行缩进',[['auto','随段落类型'],['none','不缩进'],['two','两个字']],block.indent,value=>updateBlock({indent:value})),select('段前间距',[['auto','随段落类型'],['none','不留空'],['half','半行'],['one','一行']],block.before,value=>updateBlock({before:value})),select('段后间距',[['auto','随段落类型'],['none','不留空'],['half','半行'],['one','一行']],block.after,value=>updateBlock({after:value})));details.append(settings);toolbar.append(details);
    }
  }
  function field(block,path,value,label,kind){
    const wrap=document.createElement('label');wrap.className='content-field';const title=document.createElement('span');title.textContent=label;const input=document.createElement('textarea');input.value=value;input.rows=kind==='cell'?2:Math.max(2,Math.min(8,Math.ceil(value.length/40)));input.maxLength=kind==='cell'?10000:kind==='caption'?150:100000;input.dataset.block=block.id;input.dataset.kind=kind;if(path.cell)input.dataset.cell=path.cell;if(path.row)input.dataset.row=path.row;if(path.caption)input.dataset.caption='true';
    input.onfocus=()=>{selected={block:block.id,...path};editSession={input,before:snapshot(),recorded:false};for(const node of blocks.querySelectorAll('[data-content-block]'))node.classList.toggle('selected',node.dataset.contentBlock===block.id);renderToolbar();requestAnimationFrame(()=>reveal(input));};
    const apply=event=>{
      if(!canEdit())return;
      const next=structuredClone(getContent()),target=next.blocks.find(item=>item.id===block.id);let nextPath=selected,range;
      const priorValue=kind==='paragraph'?target.text:kind==='caption'?target.caption:target.rows.find(row=>row.id===path.row).cells.find(cell=>cell.id===path.cell).text;
      if(kind==='paragraph'&&input.value.includes('\n')&&!event.isComposing){
        const lines=input.value.split('\n'),at=next.blocks.indexOf(target),paragraphs=lines.map((text,i)=>({...target,id:i?crypto.randomUUID():target.id,text}));next.blocks.splice(at,1,...paragraphs);nextPath={block:paragraphs.at(-1).id};range={start:paragraphs.at(-1).text.length};
      }else if(kind==='paragraph')target.text=input.value;
      else if(kind==='caption')target.caption=input.value;
      else target.rows.find(row=>row.id===path.row).cells.find(cell=>cell.id===path.cell).text=input.value;
      const session=editSession?.input===input?editSession:{before:snapshot(),recorded:false};
      const success=commit(next,{record:!session.recorded,before:session.before,render:Boolean(range),path:nextPath,range,composing:event.isComposing});
      if(success)session.recorded=true;else input.value=priorValue;editSession=session;
    };
    input.oninput=apply;input.addEventListener('compositionend',event=>apply({isComposing:false}));
    if(kind==='paragraph')input.onkeydown=event=>{if(event.key==='Enter'&&!event.isComposing&&!event.shiftKey){event.preventDefault();selected={block:block.id};split();}};
    wrap.append(title,input);return wrap;
  }
  function draw(){
    const content=getContent();root.hidden=!content;body.hidden=Boolean(content);body.readOnly=Boolean(content);$('content-edit').hidden=Boolean(content);if(content)$('body-label').removeAttribute('for');else $('body-label').setAttribute('for','body');blocks.replaceChildren();
    if(!content){selected=null;toolbar.replaceChildren();historyButtons();return;}
    if(!content.blocks.some(block=>block.id===selected?.block))selected={block:content.blocks[0].id};
    content.blocks.forEach((block,index)=>{
      const section=document.createElement('section');section.className='content-block';section.dataset.contentBlock=block.id;section.classList.toggle('selected',selected?.block===block.id);
      if(block.type==='paragraph')section.append(field(block,{},block.text,`第 ${index+1} 段 · ${labels[block.role]}`,'paragraph'));
      else{
        section.append(field(block,{caption:true},block.caption,'表格标题（选填）','caption'));
        const scroll=document.createElement('div');scroll.className='content-table-scroll';const grid=document.createElement('table');grid.className='content-table';grid.style.minWidth=block.rows[0].cells.length*120+'px';
        block.rows.forEach((row,i)=>{const tr=document.createElement('tr');row.cells.forEach((cell,j)=>{const td=document.createElement(i===0&&block.header?'th':'td');td.append(field(block,{row:row.id,cell:cell.id},cell.text,`第 ${i+1} 行，第 ${j+1} 列`,'cell'));tr.append(td);});grid.append(tr);});scroll.append(grid);section.append(scroll);
      }
      blocks.append(section);
    });renderToolbar();historyButtons();
  }
  function activate(){
    if(getContent()){focus(selected);return;}
    try{const content=contentFromText(body.value);commit(content,{path:{block:content.blocks[0].id},message:'已在当前稿开启段落编辑，所有修改可撤销。'});}catch(error){onError(error.message);}
  }
  function openTable(){
    if(!canEdit())return;
    try{
      const content=getContent()?structuredClone(getContent()):contentFromText(body.value),index=getContent()?Math.max(0,content.blocks.findIndex(block=>block.id===selected?.block)):Math.min(content.blocks.length-1,body.value.slice(0,body.selectionStart).split('\n').length-1);
      const conversion=tabularContentAt(content,index)||(content.blocks[index]?.type==='paragraph'?tabularContentAt(content,index+1):null);
      request={before:snapshot(),content,index,body:body.value,original:JSON.stringify(getContent()),conversion};$('content-table-form').reset();$('content-table-message').textContent='';
      $('content-table-conversion').hidden=!conversion;$('content-table-convert').checked=Boolean(conversion);$('content-table-source').value=conversion?conversion.rows.map(row=>row.join('\t')).join('\n'):'';
      if(conversion){$('content-table-rows').value=conversion.rows.length;$('content-table-columns').value=conversion.rows[0].length;}
      $('content-table-dialog').showModal();$('content-table-rows').focus();
    }catch(error){onError(error.message);}
  }
  function restore(from,to){if(!canEdit()||!from.length)return;const next=from.pop();to.push(snapshot());onChange(next.content,next.content?contentText(next.content):next.body,{});selected=next.selected;draw();historyButtons();if(next.content)focus(selected,next.range);else{body.focus({preventScroll:true});body.setSelectionRange(next.range?.start??body.value.length,next.range?.end??body.value.length);}status('正文调整已撤销或恢复。');}
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
      }else if(next.blocks.length===1&&next.blocks[0].type==='paragraph'&&!next.blocks[0].text)next.blocks=[grid];else next.blocks.splice(request.index+1,0,grid);
      if(commit(next,{before:request.before,path:null,message:'表格已加入当前稿，可直接填写单元格或调整行列。'})){request=null;$('content-table-dialog').close();$('content-table-message').textContent='';focus({block:grid.id,row:grid.rows[0].id,cell:grid.rows[0].cells[0].id});}
    }catch(error){$('content-table-message').textContent=error.message;}
  };
  root.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&!event.isComposing){event.preventDefault();event.shiftKey?restore(future,past):restore(past,future);}});
  const scroll=document.querySelector('.form-scroll');if(scroll)new ResizeObserver(fitControls).observe(scroll);
  return {
    set(value){past=[];future=[];selected=null;editSession=null;draw();},
    focusSource(path,original){const input=inputFor(path);if(!input)return false;input.focus({preventScroll:true});const lines=input.value.split('\n'),part=Number.isInteger(path.line)?path.line:null,offset=part===null?0:lines.slice(0,part).reduce((n,line)=>n+line.length+1,0),text=part===null?input.value:lines[part]||'',start=original?text.indexOf(original):-1;input.setSelectionRange(offset+(start>=0?start:0),offset+(start>=0?start+original.length:text.length));requestAnimationFrame(()=>reveal(input));return true;},
    refresh:draw,
  };
}
