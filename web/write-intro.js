export function installIntro(){
  const $=id=>document.getElementById(id),key='gongwen-welcome-v1';
  function openWelcome(){if(!$('welcome-dialog').open)$('welcome-dialog').showModal();}
  $('about-open').onclick=()=>$('about-dialog').showModal();
  $('welcome-again').onclick=()=>{$('about-dialog').close();openWelcome();};
  $('welcome-start').onclick=()=>$('welcome-dialog').close();
  $('welcome-dialog').addEventListener('close',()=>{try{localStorage.setItem(key,'seen');}catch{}});
  $('welcome-copy').onclick=async()=>{try{await navigator.clipboard.writeText('https://msmdm.cn');$('welcome-copy-status').textContent='网址已复制';}catch{$('welcome-copy-status').textContent='请复制上方网址：msmdm.cn';}};
  return {firstVisit(){try{if(localStorage.getItem(key)==='seen')return;}catch{}openWelcome();}};
}
