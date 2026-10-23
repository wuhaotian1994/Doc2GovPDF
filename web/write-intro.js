export function installIntro({onStart,onRecovery}){
  const $=id=>document.getElementById(id);let starting=false;
  const recovery=document.createElement('button');recovery.id='welcome-recovery';recovery.type='button';recovery.className='secondary';recovery.textContent='保存与恢复选项';recovery.hidden=true;$('welcome-copy-status').after(recovery);recovery.onclick=()=>{$('welcome-dialog').close();onRecovery();};
  function openWelcome(){if(!$('welcome-dialog').open){$('welcome-copy-status').textContent='';recovery.hidden=true;$('welcome-dialog').showModal();}}
  $('about-open').onclick=()=>$('about-dialog').showModal();
  $('welcome-start').onclick=async()=>{
    if(starting)return;starting=true;$('welcome-start').disabled=true;
    try{await onStart();$('welcome-dialog').close();$('title').focus();}
    catch(error){$('welcome-copy-status').textContent=error.message;recovery.hidden=false;}
    finally{starting=false;$('welcome-start').disabled=false;}
  };
  $('welcome-dialog').addEventListener('click',event=>{if(!event.target.closest('button'))$('welcome-dialog').close();});
  return {showOnOpen:openWelcome};
}
