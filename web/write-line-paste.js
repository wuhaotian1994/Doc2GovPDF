import {blank, draft, validateDraft, validDate} from './write-model.js';

export const lineRoles = {title:'标题',agency:'部门',signer:'签发人',date:'日期',recipient:'收文对象',reference:'文号',body:'正文',signature:'落款',attachments:'附件说明',copyTo:'抄送',postscript:'附注'};

export function parseLineDate(text) {
  let value=text.trim().replace(/^(?:成文日期|日期)[：:]\s*/, '');
  const digits='〇一二三四五六七八九';
  value=value.replace(/[零〇一二三四五六七八九]{4}(?=年)/g,s=>[...s].map(c=>c==='零'?0:digits.indexOf(c)).join(''));
  const number=s=>s.includes('十')?(s[0]==='十'?10:digits.indexOf(s[0])*10)+(s.endsWith('十')?0:digits.indexOf(s.at(-1))):digits.indexOf(s);
  value=value.replace(/[一二三四五六七八九十]{1,3}(?=[月日])/g,s=>String(number(s)));
  const match=value.match(/^(\d{4})\s*[-年/.]\s*(\d{1,2})\s*[-月/.]\s*(\d{1,2})\s*日?$/);
  if(!match)return null;
  const date=`${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`;
  return validDate(date)?date:null;
}

export function guessLineRoles(text) {
  const lines=text.split('\n'), marks={},meaningful=lines.map((line,index)=>({text:line.trim(),index})).filter(line=>line.text);
  const dates=meaningful.filter(line=>parseLineDate(line.text));
  const organization=/^.{2,100}(?:人民政府|委员会|办公室|办公厅|公司|学校|中心|局|厅|部|处|科|院|所)$/;
  let title=false;
  for(const [position,line] of meaningful.entries()) {
    const t=line.text;let role='body';
    if(parseLineDate(t)){role=dates.length===1?'date':'body';}
    else if(/^签发人\s*[：:]\s*\S/.test(t))role='signer';
    else if(/^抄送\s*[：:]/.test(t))role='copyTo';
    else if(/^附件\s*[：:]/.test(t))role='attachments';
    else if(/^附注\s*[：:]/.test(t))role='postscript';
    else if(/^.{1,30}[〔\[（(]\d{4}[〕\]）)]\s*\d+\s*号$/.test(t))role='reference';
    else if(/^[^。！？；]{1,100}[：:]$/.test(t)&&(/^(各|全体|有关|相关)/.test(t)||/(单位|部门|政府|委员会|局|厅|处)[：:]$/.test(t)))role='recipient';
    else if(organization.test(t)&&!/[，。；：、]/.test(t))role=dates.length===1&&line.index===meaningful[meaningful.findIndex(d=>d.index===dates[0].index)-1]?.index?'signature':position<3?'agency':'body';
    else if(!title&&position<3&&t.length<=180&&!/[。！？；：:]$/.test(t)){role='title';title=true;}
    marks[line.index]=role;
  }
  return marks;
}

export function markedDraft(text, marks) {
  if (!text.trim()) throw Error('请先粘贴文章。');
  if (text.length > 100000) throw Error('文章超过 100000 字符，请分篇整理。');
  const fields=blank(), groups={};
  text.split('\n').forEach((line,i)=>{const role=marks[i]||'body';(groups[role]??=[]).push(line);});
  for(const [role,lines] of Object.entries(groups)) {
    if(role==='date'){
      const values=lines.filter(line=>line.trim());
      if(values.length!==1||!parseLineDate(values[0]))throw Error('请只标记一个有效日期，例如 2026年10月23日；其他日期可改为正文。');
      fields.date=parseLineDate(values[0]);
    }else fields[role]=lines.map(line=>['signer','attachments','copyTo','postscript'].includes(role)?line.replace(new RegExp('^\\s*'+({signer:'签发人',attachments:'附件',copyTo:'抄送',postscript:'附注'}[role])+'\\s*[：:]\\s*'),''):line).join('\n');
  }
  fields.letterhead=Boolean(fields.agency.trim());
  return validateDraft(draft(fields,1));
}

// Keep annotations only on unchanged lines when text is edited or pasted again.
export function reconcileMarks(before, after, marks) {
  const a=before.split('\n'),b=after.split('\n'),next={};let start=0,end=0;
  while(start<Math.min(a.length,b.length)&&a[start]===b[start]){if(Object.hasOwn(marks,start))next[start]=marks[start];start++;}
  while(end<a.length-start&&end<b.length-start&&a[a.length-1-end]===b[b.length-1-end]){if(Object.hasOwn(marks,a.length-1-end))next[b.length-1-end]=marks[a.length-1-end];end++;}
  return next;
}

export function installLinePaste({apply,initial}) {
  const dialog=document.createElement('dialog');dialog.id='line-paste-dialog';dialog.setAttribute('aria-labelledby','line-paste-heading');
  dialog.innerHTML=`<header class="dialog-heading"><h2 id="line-paste-heading">从已有文字开始</h2><button type="button" class="quiet" data-dismiss>关闭</button></header>
    <p class="line-paste-help" id="line-paste-help">粘贴全文后会预选每行用途。请核对左侧标记，点击某行或选中多行即可修改。</p>
    <div class="line-paste-scroll"><div class="line-paste-paper"><div class="line-paste-mirror" aria-hidden="true"></div><textarea id="line-paste-text" aria-label="粘贴文章全文" aria-describedby="line-paste-help" spellcheck="false" placeholder="在这里粘贴文章……"></textarea></div></div>
    <div class="line-paste-toolbar" role="group" aria-label="标记所选行" hidden><span>标记为</span>${Object.entries(lineRoles).map(([role,label])=>`<button type="button" data-role="${role}">${label}</button>`).join('')}<button type="button" data-role="">取消标记</button></div>
    <footer class="line-paste-footer"><p id="line-paste-status" role="status"></p><button type="button" class="secondary" data-dismiss>取消</button><button type="button" class="primary" id="line-paste-confirm">确定</button></footer>`;
  document.body.append(dialog);
  const input=dialog.querySelector('textarea'),mirror=dialog.querySelector('.line-paste-mirror'),toolbar=dialog.querySelector('.line-paste-toolbar'),scroll=dialog.querySelector('.line-paste-scroll'),status=dialog.querySelector('[role=status]');
  let text='',marks={},selection=[0,0],opened=false,showTools=false;
  function range(){const start=input.selectionStart,end=input.selectionEnd;return [input.value.slice(0,start).split('\n').length-1,input.value.slice(0,end>start&&input.value[end-1]==='\n'?end-1:end).split('\n').length-1];}
  function position(){
    if(!dialog.open)return;
    const row=mirror.querySelector(`[data-line="${selection[0]}"]`),rect=row?.getBoundingClientRect(),bounds=dialog.getBoundingClientRect(),viewport=scroll.getBoundingClientRect();
    toolbar.hidden=!showTools||!input.value.trim()||!rect||rect.bottom<viewport.top||rect.top>viewport.bottom;
    if(toolbar.hidden)return;
    toolbar.querySelectorAll('[data-role]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.role===(marks[selection[0]]||''))));
    toolbar.style.left='24px';toolbar.style.right='24px';
    const height=toolbar.offsetHeight;
    const y=rect.top-height-8>=viewport.top?rect.top-height-8:Math.min(rect.bottom+8,viewport.bottom-height-8);
    toolbar.style.top=Math.max(viewport.top,y)-bounds.top+'px';
  }
  function render(){
    const groups=[];let group,previousRole;
    input.value.split('\n').forEach((line,i)=>{
      const role=Object.hasOwn(marks,i)?marks[i]:(input.value?'body':'');
      if(!group||role!==previousRole){group=document.createElement('div');group.className='line-paste-group';if(role){group.dataset.role=role;group.dataset.label=lineRoles[role];}groups.push(group);previousRole=role;}
      const row=document.createElement('div');row.className='line-paste-row';row.textContent=line||'\u200b';
      row.dataset.line=i;if(role)row.dataset.role=role;group.append(row);
    });
    mirror.replaceChildren(...groups);
    input.style.height=mirror.offsetHeight+'px';position();
  }
  function select(event){const next=range();if(event&&['select','selectionchange'].includes(event.type)&&next[0]===selection[0]&&next[1]===selection[1])return;showTools=true;selection=next;position();}
  input.addEventListener('input',()=>{marks={...guessLineRoles(input.value),...reconcileMarks(text,input.value,marks)};text=input.value;showTools=false;selection=range();render();status.textContent='';});
  input.addEventListener('paste',event=>{const pasted=event.clipboardData?.getData('text/plain')||'';if(input.value.length-(input.selectionEnd-input.selectionStart)+pasted.replace(/\r\n?/g,'\n').length>100000){event.preventDefault();status.textContent='文章超过 100000 字符，未替换输入，请分篇整理。';}});
  for(const name of ['click','keyup','select'])input.addEventListener(name,select);
  document.addEventListener('selectionchange',event=>{if(dialog.open&&document.activeElement===input)select(event);});
  toolbar.addEventListener('pointerdown',event=>event.preventDefault());
  toolbar.addEventListener('click',event=>{
    const button=event.target.closest('[data-role]');if(!button)return;
    const role=button.dataset.role;
    for(let i=selection[0];i<=selection[1];i++)marks[i]=role;
    showTools=false;render();status.textContent=`第 ${selection[0]+1}${selection[1]>selection[0]?'–'+(selection[1]+1):''} 行${role?'已标记为'+lineRoles[role]:'已取消标记'}。`;
  });
  scroll.addEventListener('scroll',position);
  scroll.addEventListener('click',event=>{if(event.target!==input&&!event.target.closest('button')){input.focus();input.setSelectionRange(input.value.length,input.value.length);select();}});
  new ResizeObserver(()=>{if(dialog.open){input.style.height=mirror.offsetHeight+'px';position();}}).observe(mirror);
  dialog.querySelectorAll('[data-dismiss]').forEach(button=>button.onclick=()=>dialog.close());
  dialog.querySelector('#line-paste-confirm').onclick=()=>{
    try{const next=markedDraft(input.value,marks);if(apply(next)){dialog.close();opened=false;text='';marks={};input.value='';}else status.textContent='未替换当前稿。请关闭弹窗查看页面提示，文章与标记仍保留。';}
    catch(error){status.textContent=error.message;}
  };
  return (raw)=>{if(typeof raw==='string'||!opened){input.value=typeof raw==='string'?raw:initial()||'';text=input.value;marks=guessLineRoles(text);opened=true;}status.textContent='';dialog.showModal();showTools=false;selection=range();render();input.focus();};
}
