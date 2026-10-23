export function installHome({list,create,open,rename,remove,save,canEdit,onError}) {
  const $=id=>document.getElementById(id),root=$('article-home'),grid=$('article-grid');
  let items=[],page=0,ready=false,busy=false,run=0;
  const columns=()=>innerWidth>=1200?4:innerWidth>=950?3:innerWidth>=650?2:1;
  const capacity=()=>Math.max(1,columns()*Math.max(1,Math.floor((grid.clientHeight+16)/216))-1);
  const dialog=document.createElement('dialog');dialog.id='article-action-dialog';dialog.setAttribute('aria-labelledby','article-action-heading');
  dialog.innerHTML='<form id="article-action-form"><h2 id="article-action-heading"></h2><p id="article-action-description"></p><label for="article-name">文章名称</label><input id="article-name" maxlength="180" autocomplete="off"><p id="article-action-error" class="field-error" role="alert"></p><div class="dialog-actions"><button type="button" class="secondary" id="article-action-cancel">取消</button><button type="submit" class="primary" id="article-action-confirm">保存名称</button></div></form>';
  document.body.append(dialog);let selected=null,actionKind='';
  function editAction(item,kind){
    selected=item;actionKind=kind;const deleting=kind==='delete';
    $('article-action-heading').textContent=deleting?'删除这篇文章？':'重命名文章';
    $('article-action-description').textContent=deleting?`“${item.title||'未命名文章'}”将从本浏览器删除，已下载的文件不受影响。`:'';
    $('article-action-description').hidden=!deleting;$('article-name').hidden=deleting;dialog.querySelector('label').hidden=deleting;
    $('article-name').value=item.title||'';$('article-name').maxLength=item.kind==='word'?220:180;
    $('article-action-confirm').textContent=deleting?'确认删除':'保存名称';$('article-action-error').textContent='';dialog.showModal();
    if(deleting)$('article-action-cancel').focus();else{$('article-name').focus();$('article-name').select();}
  }
  $('article-action-cancel').onclick=()=>dialog.close();
  $('article-action-form').onsubmit=async event=>{
    event.preventDefault();if(busy||!selected)return;
    const title=$('article-name').value.trim();if(actionKind==='rename'&&!title){$('article-action-error').textContent='请输入文章名称。';$('article-name').focus();return;}
    busy=true;dialog.querySelectorAll('button').forEach(button=>button.disabled=true);
    try{if(actionKind==='delete')await remove(selected);else await rename(selected,title);items=await list();dialog.close();render();$('home-heading').focus();}
    catch(error){$('article-action-error').textContent=error.message;}
    finally{busy=false;dialog.querySelectorAll('button').forEach(button=>button.disabled=false);render();}
  };
  function render(){
    grid.style.setProperty('--article-columns',columns());
    const count=capacity(),pages=Math.max(1,Math.ceil(items.length/count));page=Math.min(page,pages-1);
    grid.replaceChildren();
    const add=document.createElement('button');add.type='button';add.className='article-card article-new';add.id='home-new';add.disabled=!ready||busy||!canEdit();
    add.innerHTML='<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 8v24M8 20h24"/></svg><strong>新建文章</strong><span>从基本信息开始填写</span>';
    add.onclick=()=>act(create);grid.append(add);
    for(const item of items.slice(page*count,(page+1)*count)){
      const card=document.createElement('article');card.className='article-card';card.dataset.articleId=item.id;
      const openButton=document.createElement('button');openButton.type='button';openButton.className='article-open';openButton.disabled=busy||!canEdit();
      const title=document.createElement('h2');title.textContent=item.title||'未命名文章';
      const excerpt=document.createElement('p');excerpt.className='article-excerpt';excerpt.textContent=item.body?.replace(/\s+/g,' ').trim()||'尚未填写正文';
      const meta=document.createElement('span');meta.className='article-meta';
      const date=new Date(item.savedAt);meta.textContent=(item.kind==='word'?'Word 工作稿 · ':'')+(Number.isFinite(+date)?new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric'}).format(date):'本地文章');
      openButton.append(title,excerpt);openButton.onclick=()=>act(()=>open(item));
      const actions=document.createElement('div');actions.className='article-actions';actions.append(meta);
      for(const [label,kind] of [['重命名','rename'],['删除','delete']]){const button=document.createElement('button');button.type='button';button.className='quiet';button.textContent=label;button.dataset.articleAction=kind;button.disabled=busy||!canEdit();button.onclick=()=>editAction(item,kind);actions.append(button);}
      card.append(openButton,actions);card.onclick=event=>{if(!event.target.closest('button'))act(()=>open(item));};grid.append(card);
    }
    $('home-empty').hidden=items.length>0;
    $('home-count').textContent=ready?(items.length?`${items.length} 篇文章，仅保存在此浏览器`:'还没有文章，从新建开始'):'正在读取本地文章…';
    $('home-page').textContent=`${page+1} / ${pages}`;$('home-prev').disabled=page===0||busy;$('home-next').disabled=page+1>=pages||busy;
    $('home-pagination').hidden=pages<=1;
    $('material-open').disabled=!ready||busy||!canEdit();
  }
  async function act(action){if(busy||!ready)return;busy=true;render();try{await action();}catch(error){onError(error.message);}finally{busy=false;render();}}
  async function show({persist=true,push=true}={}) {
    if(persist&&ready){try{await save();}catch(error){onError(error.message);return false;}}
    document.body.classList.add('home-mode');root.hidden=false;document.querySelector('.app-main').hidden=true;
    if(push&&location.hash!=='#home')history.pushState({home:true},'','#home');
    ready=false;render();
    const token=++run;
    try{const next=await list();if(token!==run)return;items=next;ready=true;render();$('home-heading').focus({preventScroll:true});}catch(error){onError(error.message);ready=true;render();}
    return true;
  }
  function enter(){run++;document.body.classList.remove('home-mode');root.hidden=true;document.querySelector('.app-main').hidden=false;}
  $('home-prev').onclick=()=>{page--;render();};$('home-next').onclick=()=>{page++;render();};
  $('back-home').onclick=()=>show();
  document.querySelector('.brand').onclick=event=>{event.preventDefault();show();};
  window.addEventListener('resize',render);
  new ResizeObserver(()=>{if(!root.hidden)render();}).observe(grid);
  render();return {show,enter,get active(){return !root.hidden;}};
}
