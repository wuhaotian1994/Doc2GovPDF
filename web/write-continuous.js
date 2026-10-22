// Continuous editing events shared by authored content and protected Word source.
// The canonical document stays outside the DOM; clipboard HTML is never trusted.
const cursorCache=new WeakMap();
export function editorText(node){
  let value='';
  for(const child of node.childNodes){
    if(child.nodeType===3)value+=child.data;
    else if(child.nodeType===1){if(child.tagName==='BR')value+='\n';else{if(['P','DIV'].includes(child.tagName)&&value&&!value.endsWith('\n'))value+='\n';value+=editorText(child);}}
  }
  return node.childNodes.length===1&&node.firstChild?.nodeName==='BR'?'':value;
}
function offsetAt(node,container,offset){const probe=document.createRange();probe.selectNodeContents(node);try{probe.setEnd(container,offset);return editorText(probe.cloneContents()).length;}catch{return 0;}}
function textPoint(node,offset){
  const walk=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let text,last;
  while(text=walk.nextNode()){last=text;if(offset<=text.length)return[text,offset];offset-=text.length;}
  if(last)return[last,last.length];const empty=document.createTextNode('');node.append(empty);return[empty,0];
}
export function editorCaret(node,start=0,end=start){
  const selection=getSelection(),range=document.createRange(),a=textPoint(node,start),b=textPoint(node,end);range.setStart(...a);range.setEnd(...b);selection.removeAllRanges();selection.addRange(range);cursorCache.set(node,{start,end});
}
export function editorRange(node){
  const selection=getSelection();if(selection?.rangeCount){const range=selection.getRangeAt(0);if(node.contains(range.startContainer)&&node.contains(range.endContainer)){const result={start:offsetAt(node,range.startContainer,range.startOffset),end:offsetAt(node,range.endContainer,range.endOffset)};cursorCache.set(node,result);return result;}}
  return cursorCache.get(node)||{start:0,end:0};
}
export function continuousField(value,key,{label='',readonly=false,className='writing-line',tag='p'}={}){
  const node=document.createElement(tag);node.className=className;node.dataset.editorKey=key;node.textContent=value;node.tabIndex=-1;
  if(label)node.setAttribute('aria-label',label);
  if(readonly){node.contentEditable='false';node.dataset.readonly='true';node.setAttribute('aria-readonly','true');}
  Object.defineProperties(node,{value:{get:()=>editorText(node),set:value=>node.textContent=value},selectionStart:{get:()=>editorRange(node).start},selectionEnd:{get:()=>editorRange(node).end}});
  node.setSelectionRange=(start,end=start)=>editorCaret(node,start,end);return node;
}
export function mountContinuous({host,entries,apply,replace,split,join,undo,redo,onSelect,onError,canEdit,settled,recover,suspend,controls,onBlur,unsupported}){
  host.contentEditable='true';host.tabIndex=0;host.setAttribute('role','textbox');host.setAttribute('aria-multiline','true');host.spellcheck=false;host.classList.add('continuous-editor');
  let beforeSelection=null,compositionRange=null,pendingComposition=null,trailingComposition=null;
  const fields=()=>[...host.querySelectorAll('[data-editor-key]')];
  function point(container,offset,end){
    const element=container.nodeType===1?container:container.parentElement,field=element.closest?.('[data-editor-key]');
    if(field&&host.contains(field))return {key:field.dataset.editorKey,offset:offsetAt(field,container,offset)};
    if(element===host||host.contains(element)){
      const children=[...container.childNodes],candidate=end?children[offset-1]:children[offset];
      const target=candidate?.nodeType===1?(candidate.matches('[data-editor-key]')?candidate:(end?[...candidate.querySelectorAll('[data-editor-key]')].at(-1):candidate.querySelector('[data-editor-key]'))):null;
      const fallback=end?fields().at(-1):fields()[0],node=target||fallback;if(node)return {key:node.dataset.editorKey,offset:end?editorText(node).length:0};
    }
    return null;
  }
  function selection(){const s=getSelection();if(!s?.rangeCount)return null;const r=s.getRangeAt(0);if(!host.contains(r.startContainer)||!host.contains(r.endContainer))return null;const start=point(r.startContainer,r.startOffset,false),end=point(r.endContainer,r.endOffset,true);return start&&end?{start,end,collapsed:r.collapsed}:null;}
  function current(){const range=selection();if(!range)return null;const all=entries();return {...range,startEntry:all.find(e=>e.key===range.start.key),endEntry:all.find(e=>e.key===range.end.key)};}
  function notify(){const active=document.activeElement;if(!host.contains(active)&&active!==host&&!controls?.contains(active))return;const range=current();if(range?.startEntry){const node=fields().find(n=>n.dataset.editorKey===range.start.key);if(node)cursorCache.set(node,{start:range.start.offset,end:range.start.key===range.end.key?range.end.offset:range.start.offset});onSelect?.(range.startEntry,range);}}
  document.addEventListener('selectionchange',notify);host.addEventListener('focusin',notify);host.addEventListener('pointerup',notify);
  // Do not collapse a toolbar between pointer-down and click: scroll anchoring
  // could move the intended insert/save control before its click is delivered.
  let pointerInteraction=false,blurPending=false;
  function checkBlur(){const active=document.activeElement;if(!host.contains(active)&&!controls?.contains(active)){onBlur?.();if(active?.matches('input,textarea,select')&&active.closest('form'))active.scrollIntoView({block:'nearest'});}}
  document.addEventListener('pointerdown',()=>pointerInteraction=true,true);
  document.addEventListener('click',()=>{pointerInteraction=false;if(blurPending){blurPending=false;checkBlur();}});
  document.addEventListener('pointercancel',()=>{pointerInteraction=false;if(blurPending){blurPending=false;checkBlur();}});
  host.addEventListener('focusout',()=>{if(pointerInteraction)blurPending=true;else queueMicrotask(checkBlur);});
  function guard(action,rollback=false){try{if(!canEdit())return;action();}catch(error){if(rollback)recover?.();onError(error.message);}}
  function consistent(){const all=entries(),nodes=fields();return all.length===nodes.length&&all.every(e=>nodes.some(n=>n.dataset.editorKey===e.key));}
  function compositionText(event){
    if(typeof event.data==='string')return event.data;
    const range=compositionRange||beforeSelection,node=fields().find(n=>n.dataset.editorKey===range?.start.key),entry=entries().find(e=>e.key===range?.start.key);
    if(node&&entry&&range.start.key===range.end.key){const text=editorText(node),prefix=entry.text.slice(0,range.start.offset),suffix=entry.text.slice(range.end.offset);if(text.startsWith(prefix)&&text.endsWith(suffix))return text.slice(prefix.length,text.length-suffix.length);}
    return pendingComposition?.text||'';
  }
  function finishComposition(text){
    const range=pendingComposition?.range||compositionRange||beforeSelection;pendingComposition=null;compositionRange=null;beforeSelection=null;
    if(range){if(text)guard(()=>{replace(range,text,{inputType:'insertCompositionText'});if(!consistent()){recover?.();focusKey(range.start.key,range.start.offset+text.length);}},true);else recover?.();}settled?.();
  }
  const unsupportedFormat=type=>/^(format|insertOrderedList|insertUnorderedList|insertHorizontalRule)/.test(type||'');
  const formatBoundary=()=>{const message='此处按文稿段落排版，任意行内加粗、斜体或下划线未提供；字号和对齐等可在“段落与排版”中调整。';unsupported?unsupported(message):onError(message);};
  function read(event){
    if(unsupportedFormat(event.inputType)){recover?.();formatBoundary();return;}
    if(trailingComposition&&event.inputType==='insertCompositionText'&&!event.isComposing&&event.data===trailingComposition.text){const caret=trailingComposition.caret;trailingComposition=null;const all=entries();if(!consistent()||fields().some(n=>all.find(e=>e.key===n.dataset.editorKey)?.text!==editorText(n))){recover?.();if(caret)focusKey(caret.end.key,caret.end.offset);}settled?.();return;}
    trailingComposition=null;
    if(pendingComposition||event.isComposing||event.inputType==='insertCompositionText'){
      compositionRange ||= beforeSelection||current();if(!compositionRange)return;const text=compositionText(event);if(!pendingComposition)suspend?.();pendingComposition={range:compositionRange,text};
      if(!event.isComposing)finishComposition(text);return;
    }
    guard(()=>{if(!consistent())throw Error('这次操作会改变原有结构，内容未替换。请使用文稿中的表格或段落操作。');apply(fields().map(n=>({key:n.dataset.editorKey,text:editorText(n)})),{composing:false,inputType:event.inputType||'insertText',selection:current(),beforeSelection});},true);beforeSelection=null;
  }
  host.addEventListener('compositionstart',()=>{trailingComposition=null;compositionRange=current();if(compositionRange)suspend?.();});host.addEventListener('input',read);
  host.addEventListener('compositionend',event=>{if(pendingComposition||compositionRange){const text=compositionText(event);finishComposition(text);trailingComposition={text,caret:current()};}else{read({isComposing:false,inputType:'compositionend'});settled?.();}});
  host.addEventListener('beforeinput',event=>{
    if(!canEdit()){event.preventDefault();return;}
    const range=current(),type=event.inputType||'';if(unsupportedFormat(type)){event.preventDefault();formatBoundary();return;}beforeSelection=range;if(!range?.startEntry)return;
    const all=entries(),from=all.findIndex(e=>e.key===range.start.key),to=all.findIndex(e=>e.key===range.end.key);if(range.startEntry.readonly||range.endEntry?.readonly||all.slice(from,to+1).some(e=>e.readonly)){event.preventDefault();onError('此处含原有对象或修订，保留原文且只读。');return;}
    if(event.isComposing){compositionRange ||= range;return;}
    if((type==='insertText'||type==='insertReplacementText')&&event.data?.includes('\n')){event.preventDefault();guard(()=>replace(range,event.data,{inputType:type}));return;}
    if(type==='historyUndo'||type==='historyRedo'){event.preventDefault();type==='historyUndo'?undo():redo();return;}
    if(type==='insertParagraph'||type==='insertLineBreak'){event.preventDefault();guard(()=>split(range,type==='insertLineBreak'));return;}
    if(range.start.key!==range.end.key&&/^(insertText|insertReplacementText|delete)/.test(type)){event.preventDefault();guard(()=>replace(range,type.startsWith('delete')?'':event.data||'',{inputType:type}));return;}
    if(range.collapsed&&type.startsWith('delete')&&((type.includes('Backward')&&range.start.offset===0)||(type.includes('Forward')&&range.end.offset===range.startEntry.text.length))){event.preventDefault();guard(()=>join(range,type.includes('Backward')?-1:1));}
  });
  host.addEventListener('paste',event=>{event.preventDefault();const text=event.clipboardData?.getData('text/plain');if(!text){if(event.clipboardData?.types?.length){const message='剪贴板没有可用文字，原选区保持；当前只接收文字粘贴。';unsupported?unsupported(message):onError(message);}return;}const range=current();if(range)guard(()=>replace(range,text.replace(/\r\n?/g,'\n'),{inputType:'insertFromPaste'}));});
  host.addEventListener('copy',event=>{const range=current();if(!range||range.collapsed)return;const all=entries(),a=all.findIndex(e=>e.key===range.start.key),b=all.findIndex(e=>e.key===range.end.key);if(a<0||b<a)return;event.preventDefault();event.clipboardData?.setData('text/plain',all.slice(a,b+1).map((e,i)=>e.text.slice(i?0:range.start.offset,i===b-a?range.end.offset:undefined)).join('\n'));});
  host.addEventListener('cut',event=>{const range=current();if(!range||range.collapsed)return;event.preventDefault();guard(()=>{const all=entries(),a=all.findIndex(e=>e.key===range.start.key),b=all.findIndex(e=>e.key===range.end.key),text=all.slice(a,b+1).map((e,i)=>e.text.slice(i?0:range.start.offset,i===b-a?range.end.offset:undefined)).join('\n');event.clipboardData?.setData('text/plain',text);replace(range,'',{inputType:'deleteByCut'});});});
  host.addEventListener('drop',event=>event.preventDefault());
  host.addEventListener('keydown',event=>{
    if(event.isComposing)return;
    if((event.ctrlKey||event.metaKey)&&!event.altKey&&['b','i','u'].includes(event.key.toLowerCase())){event.preventDefault();formatBoundary();return;}
    if(event.key==='Tab'&&!event.ctrlKey&&!event.metaKey){const range=current(),all=entries();if(range?.startEntry.kind==='cell'){const index=all.findIndex(e=>e.key===range.start.key),direction=event.shiftKey?-1:1;let next=index+direction;while(all[next]?.readonly)next+=direction;if(all[next]){event.preventDefault();focusKey(all[next].key);return;}}}
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();guard(()=>event.shiftKey?redo():undo());}
    else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){event.preventDefault();guard(redo);}
    else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='a'){event.preventDefault();host.focus();const r=document.createRange();r.selectNodeContents(host);const s=getSelection();s.removeAllRanges();s.addRange(r);}
  });
  function focusKey(key,start=0,end=start){const node=fields().find(n=>n.dataset.editorKey===key);if(node){host.focus({preventScroll:true});editorCaret(node,start,end);node.scrollIntoView({block:'nearest',inline:'nearest'});return true;}return false;}
  return {selection:current,focus:focusKey};
}
