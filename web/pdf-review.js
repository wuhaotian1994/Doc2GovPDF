import * as pdfjs from './vendor/pdfjs/pdf.mjs';
const $=id=>document.getElementById(id);
export function installPDFReview({api,onBusy,onError}){
 let current=null,task=null,pdf=null,page=1,token=0,renderTask=null;
 const dialog=$('pdf-review-dialog');
 async function showPage(number){
  if(!pdf)return;page=Math.max(1,Math.min(number,pdf.numPages));const request=++token;
  $('pdf-review-prev').disabled=page===1;$('pdf-review-next').disabled=page===pdf.numPages;$('pdf-review-page').textContent=`第 ${page} 页 / 共 ${pdf.numPages} 页`;
  renderTask?.cancel();const sheet=await pdf.getPage(page);if(request!==token)return;const viewport=sheet.getViewport({scale:1.5}),canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;renderTask=sheet.render({canvasContext:canvas.getContext('2d'),viewport});
  try{await renderTask.promise;if(request===token)$('pdf-review-canvas').replaceChildren(canvas)}catch(e){if(e.name!=='RenderingCancelledException')throw e;}
 }
 function showFindings(result){
  $('pdf-review-summary').textContent=result.issues.length?`${result.issues.length} 处需要核对，可点击定位页面。`:'在可识别的字体和分页范围内未发现待处理项。';
  $('pdf-review-fonts').textContent=result.fonts.length?result.fonts.join('、'):'未能提取字体，不能据此认定字体正确。';
  const fragment=document.createDocumentFragment();for(const issue of result.issues){const section=document.createElement('section');section.className='issue-card';const button=document.createElement('button');button.type='button';button.className='link';button.textContent=`定位第 ${issue.page} 页`;button.onclick=()=>showPage(issue.page).catch(onError);const text=document.createElement('p');text.textContent=issue.message;section.append(button,text);fragment.append(section)}$('pdf-review-issues').replaceChildren(fragment);
 }
 $('review-pdf').onclick=async()=>{
  if($('review-pdf').disabled)return;onBusy(true);
  try{const result=await api.ReviewPDFFile();if(!result.pdf)return;current=result;$('pdf-review-name').textContent=result.name;$('pdf-review-allow').value='';showFindings(result.inspection);dialog.showModal();$('pdf-review-page').textContent='正在打开页面…';task=pdfjs.getDocument({data:Uint8Array.from(atob(result.pdf),c=>c.charCodeAt(0)),isEvalSupported:false,useSystemFonts:false});const pending=task;pdf=await task.promise;if(pending!==task)return;await showPage(1)}catch(e){onError(e)}finally{onBusy(false)}
 };
 $('pdf-review-prev').onclick=()=>showPage(page-1).catch(onError);$('pdf-review-next').onclick=()=>showPage(page+1).catch(onError);
 $('pdf-review-form').onsubmit=e=>e.preventDefault();$('pdf-review-close').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{token++;renderTask?.cancel();const old=task;task=null;pdf=null;current=null;old?.destroy().catch(()=>{});$('pdf-review-canvas').replaceChildren();$('review-pdf').focus();});
 $('pdf-review-recheck').onclick=async()=>{
  if(!current||$('pdf-review-recheck').disabled)return;const item=current;const button=$('pdf-review-recheck');button.disabled=true;button.textContent='正在核对…';
  try{const result=await api.RecheckPDF(item.pdf,$('pdf-review-allow').value.split(/[,，\n]/).map(s=>s.trim()).filter(Boolean));if(current===item)showFindings(result)}catch(e){if(current===item)onError(e)}finally{button.disabled=false;button.textContent='重新核对'}
 };
}
