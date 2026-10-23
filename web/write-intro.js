export function installIntro({onStart,onRecovery}){
  const $=id=>document.getElementById(id);let starting=false;
  const recovery=document.createElement('button');recovery.id='welcome-recovery';recovery.type='button';recovery.className='secondary';recovery.textContent='保存与恢复选项';recovery.hidden=true;$('welcome-copy-status').after(recovery);recovery.onclick=()=>{$('welcome-dialog').close();onRecovery();};
  function openWelcome(){if(!$('welcome-dialog').open){$('welcome-copy-status').textContent='';recovery.hidden=true;$('welcome-dialog').showModal();}}
  $('about-open').onclick=()=>$('about-dialog').showModal();
  $('welcome-again').onclick=()=>{$('about-dialog').close();openWelcome();};
  $('welcome-start').onclick=async()=>{
    if(starting)return;starting=true;$('welcome-start').disabled=true;
    try{await onStart();$('welcome-dialog').close();$('title').focus();}
    catch(error){$('welcome-copy-status').textContent=error.message;recovery.hidden=false;}
    finally{starting=false;$('welcome-start').disabled=false;}
  };
  $('welcome-copy').onclick=async()=>{try{await navigator.clipboard.writeText('https://msmdm.cn');$('welcome-copy-status').textContent='网址已复制';}catch{$('welcome-copy-status').textContent='请复制上方网址：msmdm.cn';}};
  return {showOnOpen:openWelcome};
}
