import {blank, draft, validateDraft} from './write-model.js';

export const lineRoles = {title:'标题',agency:'部门',signer:'签发人',recipient:'收文对象',reference:'文号',body:'正文',signature:'落款',attachments:'附件说明',copyTo:'抄送',postscript:'附注'};

export function markedDraft(text, marks) {
  if (!text.trim()) throw Error('请先粘贴文章。');
  if (text.length > 100000) throw Error('文章超过 100000 字符，请分篇整理。');
  const fields=blank(), groups={};
  text.split('\n').forEach((line,i)=>{const role=marks[i]||'body';(groups[role]??=[]).push(line);});
  for(const [role,lines] of Object.entries(groups)) fields[role]=lines.join('\n');
  fields.sourceMaterial=text;
  fields.letterhead=Boolean(fields.agency.trim());
  return validateDraft(draft(fields,1));
}

// Keep annotations only on unchanged lines when text is edited or pasted again.
export function reconcileMarks(before, after, marks) {
  const a=before.split('\n'),b=after.split('\n'),next={};let start=0,end=0;
  while(start<Math.min(a.length,b.length)&&a[start]===b[start]){if(marks[start])next[start]=marks[start];start++;}
  while(end<a.length-start&&end<b.length-start&&a[a.length-1-end]===b[b.length-1-end]){if(marks[a.length-1-end])next[b.length-1-end]=marks[a.length-1-end];end++;}
  return next;
}

export function installLinePaste({apply,initial}) {
  const dialog=document.createElement('dialog');dialog.id='line-paste-dialog';dialog.setAttribute('aria-labelledby','line-paste-heading');
  dialog.innerHTML=`<header class="dialog-heading"><h2 id="line-paste-heading">粘贴文章</h2><button type="button" class="quiet" data-dismiss>关闭</button></header>
    <p class="line-paste-help" id="line-paste-help">粘贴全文，将光标放在某行或选中多行，再标记用途。未标记的文字按正文保留。</p>
    <div class="line-paste-scroll"><div class="line-paste-paper"><div class="line-paste-mirror" aria-hidden="true"></div><textarea id="line-paste-text" aria-label="粘贴文章全文" aria-describedby="line-paste-help" spellcheck="false" placeholder="在这里粘贴文章……"></textarea></div></div>
    <div class="line-paste-toolbar" role="group" aria-label="标记所选行" hidden><span>标记为</span>${Object.entries(lineRoles).map(([role,label])=>`<button type="button" data-role="${role}">${label}</button>`).join('')}<button type="button" data-role="">取消标记</button></div>
    <footer class="line-paste-footer"><p id="line-paste-status" role="status">原稿会保留，可在“我的文档”恢复。</p><button type="button" class="secondary" data-dismiss>取消</button><button type="button" class="primary" id="line-paste-confirm">确定</button></footer>`;
  document.body.append(dialog);
  const input=dialog.querySelector('textarea'),mirror=dialog.querySelector('.line-paste-mirror'),toolbar=dialog.querySelector('.line-paste-toolbar'),scroll=dialog.querySelector('.line-paste-scroll'),status=dialog.querySelector('[role=status]');
  let text='',marks={},selection=[0,0],opened=false,showTools=false;
  function range(){const start=input.selectionStart,end=input.selectionEnd;return [input.value.slice(0,start).split('\n').length-1,input.value.slice(0,end>start&&input.value[end-1]==='\n'?end-1:end).split('\n').length-1];}
  function position(){
    if(!dialog.open)return;
    const row=mirror.children[selection[0]],rect=row?.getBoundingClientRect(),bounds=dialog.getBoundingClientRect(),viewport=scroll.getBoundingClientRect();
    toolbar.hidden=!showTools||!input.value.trim()||!rect||rect.bottom<viewport.top||rect.top>viewport.bottom;
    if(toolbar.hidden)return;
    toolbar.style.left='24px';toolbar.style.right='24px';
    const height=toolbar.offsetHeight;
    const y=rect.top-height-8>=viewport.top?rect.top-height-8:Math.min(rect.bottom+8,viewport.bottom-height-8);
    toolbar.style.top=Math.max(viewport.top,y)-bounds.top+'px';
  }
  function render(){
    mirror.replaceChildren(...input.value.split('\n').map((line,i)=>{
      const row=document.createElement('div');row.className='line-paste-row';row.textContent=line||'\u200b';
      if(marks[i]){row.dataset.role=marks[i];row.dataset.label=lineRoles[marks[i]];}return row;
    }));
    input.style.height=mirror.offsetHeight+'px';position();
  }
  function select(event){const next=range();if(event&&['select','selectionchange'].includes(event.type)&&next[0]===selection[0]&&next[1]===selection[1])return;showTools=true;selection=next;position();}
  input.addEventListener('input',()=>{marks=reconcileMarks(text,input.value,marks);text=input.value;showTools=true;selection=range();render();status.textContent='修改过的行需要重新标记；未标记文字按正文保留。';});
  input.addEventListener('paste',event=>{const pasted=event.clipboardData?.getData('text/plain')||'';if(input.value.length-(input.selectionEnd-input.selectionStart)+pasted.replace(/\r\n?/g,'\n').length>100000){event.preventDefault();status.textContent='文章超过 100000 字符，未替换输入，请分篇整理。';}});
  for(const name of ['click','keyup','select'])input.addEventListener(name,select);
  document.addEventListener('selectionchange',event=>{if(dialog.open&&document.activeElement===input)select(event);});
  toolbar.addEventListener('pointerdown',event=>event.preventDefault());
  toolbar.addEventListener('click',event=>{
    const button=event.target.closest('[data-role]');if(!button)return;
    const role=button.dataset.role;
    for(let i=selection[0];i<=selection[1];i++){if(role)marks[i]=role;else delete marks[i];}
    showTools=false;render();status.textContent=`第 ${selection[0]+1}${selection[1]>selection[0]?'–'+(selection[1]+1):''} 行${role?'已标记为'+lineRoles[role]:'已取消标记'}。`;
  });
  scroll.addEventListener('scroll',position);
  new ResizeObserver(()=>{if(dialog.open){input.style.height=mirror.offsetHeight+'px';position();}}).observe(mirror);
  dialog.querySelectorAll('[data-dismiss]').forEach(button=>button.onclick=()=>dialog.close());
  dialog.querySelector('#line-paste-confirm').onclick=()=>{
    try{const next=markedDraft(input.value,marks);if(apply(next)){dialog.close();opened=false;text='';marks={};input.value='';}else status.textContent='未替换当前稿。请关闭弹窗查看页面提示，文章与标记仍保留。';}
    catch(error){status.textContent=error.message;}
  };
  return ()=>{if(!opened){input.value=initial()||'';text=input.value;marks={};opened=true;}dialog.showModal();render();input.focus();select();};
}
