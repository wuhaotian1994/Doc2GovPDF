// Contextual notices live beside their source, outside editable text. They are
// derived from retained original material; no private parser questionnaire state.
export function installAssemblyView({entries,ready,kept,keep,apply,undo,hasOriginal,canUndo}){
 const $=id=>document.getElementById(id);
 function render(){
  document.querySelectorAll('[data-assembly-note]').forEach(n=>n.remove());const active=hasOriginal();$('assembly-status').hidden=!active;if(!active)return;
  const list=entries(),pending=list.filter(e=>!kept(e));$('assembly-summary').textContent=pending.length?`已暂排为可编辑草稿，${pending.length}处具体内容待核对。原文完整保留，可先继续编辑。`:'原文完整保留；标题、收文对象和落款可直接修改，正文与表格可继续编辑。';$('assembly-undo').disabled=!canUndo();
  for(const entry of list){
   const q=entry.issue._assembly,path=entry.source?.content;let target=path?document.querySelector(`[data-editor-key="${path.block}"]`)?.parentElement:$(q.field)?.closest('.field');if(!target)target=$('assembly-notes');
   const note=document.createElement('aside');note.dataset.assemblyNote='true';note.dataset.assemblyKind=q.kind;note.contentEditable='false';note.className='assembly-note';note.setAttribute('role','note');
   if(kept(entry)){const p=document.createElement('p');p.textContent='已按原文保留此处判断。';note.append(p);const button=document.createElement('button');button.type='button';button.className='quiet';button.textContent='重新核对';button.onclick=()=>{keep(entry,false);render();};note.append(button);}
   else{
    const p=document.createElement('p');p.textContent=q.message;note.append(p);if(q.proposal){const result=document.createElement('p');result.textContent=q.proposal;note.append(result);}const actions=document.createElement('div');actions.className='dialog-actions';
    if(q.action){const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=q.action;button.disabled=!ready();button.onclick=()=>apply(entry);actions.append(button);}
    const retain=document.createElement('button');retain.type='button';retain.className='quiet';retain.textContent=q.kind==='year'?'年份按原文保留':'保留在这里';retain.disabled=!ready();retain.onclick=()=>{keep(entry,true);render();};actions.append(retain);note.append(actions);
    const detail=document.createElement('details'),summary=document.createElement('summary');summary.textContent='原文与核对说明';const quote=document.createElement('blockquote');quote.textContent=entry.issue.original;const basis=document.createElement('p');basis.textContent=entry.issue.basis;detail.append(summary,quote,basis);note.append(detail);
    if(!ready()){const waiting=document.createElement('p');waiting.className='hint';waiting.textContent='正在核对当前预览，可继续编辑正文。';note.append(waiting);}
   }
   target.append(note);
  }
 }
 $('assembly-undo').onclick=undo;return{render};
}
