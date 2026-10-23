import {inspectFont,fontFaceBytes,fontSummary,fontAccessError} from './write-font-source.js';
export function installFontPicker({apply,canEdit}){
 const $=id=>document.getElementById(id);let available=[],pending=null,opening=false;
 const show=text=>{$('font-message').textContent=text;},clear=()=>{pending=null;$('font-candidate').hidden=true;$('font-face').replaceChildren();};
 function stage(data,postscriptName){
  const font=inspectFont(data);let index=0;
  if(postscriptName){index=font.faces.findIndex(f=>f.postscriptName===postscriptName);if(index<0)throw Error('读取的字体字节与所选字体面名称不一致，未采用。');}
  pending={font,role:$('font-role').value};const select=$('font-face');select.replaceChildren(...font.faces.map(f=>{const o=document.createElement('option');o.value=f.index;o.textContent=`${f.fullName} · ${f.postscriptName}`;return o;}));select.value=index;select.disabled=Boolean(postscriptName);$('font-candidate').hidden=false;describe();
 }
 function describe(){if(!pending)return;const index=Number($('font-face').value),f=pending.font.faces[index];$('font-face-summary').textContent=`实际：${fontSummary(pending.font,index)}。用途：${pending.role}。名称不等于该用途已符合标准；技术标志不代替使用许可。`;$('font-use').disabled=!f.pdfAllowed;show(f.pdfAllowed?'核对实际字体和使用许可后，再用于此稿。':'当前PDF会子集嵌入，此字体不适用；原配置保持。');}
 $('font-local-open').onclick=async()=>{
  if(!canEdit()||opening)return;
  if(!window.queryLocalFonts){show('此浏览器不支持直接读取本机字体；这不表示没有安装字体。可在下方选择字体文件。');return;}
  opening=true;$('font-local-open').disabled=true;show('等待浏览器授权读取本机字体列表…');
  try{available=await window.queryLocalFonts();available.sort((a,b)=>a.fullName.localeCompare(b.fullName));$('font-local-face').replaceChildren(...available.map((f,i)=>{const o=document.createElement('option');o.value=i;o.textContent=`${f.fullName} · ${f.style} · ${f.postscriptName}`;return o;}));$('font-local-list').hidden=!available.length;show(available.length?'请选择一个实际字体面，再读取该字体；尚未改变配置。':'授权返回的字体列表为空；不能据此确定系统未安装。可选择字体文件。');}catch(e){show(fontAccessError(e));}finally{opening=false;$('font-local-open').disabled=false;}
 };
 $('font-local-read').onclick=async()=>{if(!canEdit()||opening)return;opening=true;$('font-local-read').disabled=true;try{const face=available[Number($('font-local-face').value)];if(!face)throw Error('请先授权并选择本机字体。');const file=await face.blob();if(file.size>32*1024*1024)throw Error('字体超过32 MB。');stage(new Uint8Array(await file.arrayBuffer()),face.postscriptName);}catch(e){show(fontAccessError(e));}finally{opening=false;$('font-local-read').disabled=false;}};
 $('font-file').onchange=async event=>{const file=event.target.files[0];event.target.value='';if(!file||!canEdit())return;clear();try{if(file.size>32*1024*1024)throw Error('字体超过32 MB，原配置保持。');stage(new Uint8Array(await file.arrayBuffer()));}catch(e){show(e.message);}};
 $('font-face').onchange=describe;$('font-role').addEventListener('change',clear);$('font-cancel').onclick=()=>{clear();show('已取消，原字体配置保持。');};
 $('font-use').onclick=async()=>{if(!pending||!canEdit()||opening)return;opening=true;$('font-use').disabled=true;try{if(pending.role!==$('font-role').value)throw Error('字体用途已变化，请重新选择。');const bytes=fontFaceBytes(pending.font,Number($('font-face').value));await apply({size:bytes.length,arrayBuffer:async()=>bytes.buffer});clear();}catch(e){show(e.message);}finally{opening=false;if(pending)$('font-use').disabled=!pending.font.faces[Number($('font-face').value)].pdfAllowed;}};
 return {clear,async summary(data){try{const font=inspectFont(data);return fontSummary(font);}catch{return '旧配置无法核对真实身份；请重新选择，当前不宣称符合。';}}};
}
