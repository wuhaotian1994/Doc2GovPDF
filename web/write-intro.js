export function installIntro({onStart,onRecovery}){
  const $=id=>document.getElementById(id);let starting=false;
  const recovery=document.createElement('button');recovery.id='welcome-recovery';recovery.type='button';recovery.className='secondary';recovery.textContent='保存与恢复选项';recovery.hidden=true;$('welcome-copy-status').after(recovery);recovery.onclick=()=>{$('welcome-dialog').close();onRecovery();};
  function openWelcome(){if(!$('welcome-dialog').open){$('welcome-copy-status').textContent='';recovery.hidden=true;$('welcome-dialog').showModal();$('welcome-heading').focus({preventScroll:true});}}
  $('about-open').onclick=()=>$('about-dialog').showModal();
  $('welcome-start').onclick=async()=>{
    if(starting)return;starting=true;$('welcome-start').disabled=true;
    try{await onStart();$('welcome-dialog').close();$('title').focus();}
    catch(error){$('welcome-copy-status').textContent=error.message;recovery.hidden=false;}
    finally{starting=false;$('welcome-start').disabled=false;}
  };
  const welcome=$('welcome-dialog');let gesture=null;
  welcome.addEventListener('pointerdown',event=>{gesture={x:event.clientX,y:event.clientY,dragged:false};});
  welcome.addEventListener('pointermove',event=>{if(gesture&&Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>4)gesture.dragged=true;});
  welcome.addEventListener('pointercancel',()=>{gesture=null;});
  welcome.addEventListener('click',event=>{
    const dragged=gesture?.dragged;gesture=null;
    if(event.target.closest('button')||dragged)return;
    const selection=window.getSelection();
    if(selection&&!selection.isCollapsed&&welcome.contains(selection.anchorNode)&&welcome.contains(selection.focusNode))return;
    welcome.close();
  });
  return {showOnOpen:openWelcome};
}
