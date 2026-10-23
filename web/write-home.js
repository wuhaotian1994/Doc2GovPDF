export function installHome({list,create,open,save,canEdit,onError}) {
  const $=id=>document.getElementById(id),root=$('article-home'),grid=$('article-grid');
  let items=[],page=0,ready=false,busy=false,run=0;
  const capacity=()=>Math.max(1,(innerWidth>=1150?3:innerWidth>=760?2:1)*(innerHeight>=760?2:1)-1);
  function render(){
    const count=capacity(),pages=Math.max(1,Math.ceil(items.length/count));page=Math.min(page,pages-1);
    grid.replaceChildren();
    const add=document.createElement('button');add.type='button';add.className='article-card article-new';add.id='home-new';add.disabled=!ready||busy||!canEdit();
    add.innerHTML='<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 8v24M8 20h24"/></svg><strong>新建文章</strong><span>从基本信息开始填写</span>';
    add.onclick=()=>act(create);grid.append(add);
    for(const item of items.slice(page*count,(page+1)*count)){
      const card=document.createElement('button');card.type='button';card.className='article-card';card.dataset.articleId=item.id;card.disabled=busy||!canEdit();
      const title=document.createElement('h2');title.textContent=item.title||'未命名文章';
      const excerpt=document.createElement('p');excerpt.className='article-excerpt';excerpt.textContent=item.body||'尚未填写正文';
      const meta=document.createElement('span');meta.className='article-meta';
      const date=new Date(item.savedAt);meta.textContent=(item.kind==='word'?'Word 工作稿 · ':'')+(Number.isFinite(+date)?new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric'}).format(date):'本地文章');
      card.append(title,excerpt,meta);card.onclick=()=>act(()=>open(item));grid.append(card);
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
  render();return {show,enter,get active(){return !root.hidden;}};
}
