import {inspectFont,fontFaceBytes,fontAccessError} from './write-font-source.js';

export const fontRoles=['仿宋','黑体','楷体','宋体','方正小标宋简体'];
const aliases={仿宋:['FangSong','STFangsong','仿宋','华文仿宋'],黑体:['SimHei','Heiti SC','STHeiti','黑体','黑体-简'],楷体:['KaiTi','STKaiti','Kaiti SC','楷体','楷体-简','华文楷体'],宋体:['SimSun','Songti SC','STSong','宋体','宋体-简','华文宋体'],方正小标宋简体:['FZXiaoBiaoSong-B05S','FZXiaoBiaoSong','方正小标宋简体','方正小标宋_GBK']};
const key=value=>String(value||'').toLowerCase().replace(/[\s_-]/g,'');
export function recommendFace(faces,role){
  const names=aliases[role].map(key);
  const candidates=faces.map((face,index)=>({face,index})).filter(({face})=>[face.family,face.fullName,face.postscriptName].some(value=>names.includes(key(value))));
  candidates.sort((a,b)=>Number(!/regular|normal|常规|标准/i.test(a.face.style||''))-Number(!/regular|normal|常规|标准/i.test(b.face.style||'')));
  if(candidates.length)return candidates[0].index;
  // A clearly named drafting substitute, confirmed alongside its actual face.
  if(role==='方正小标宋简体')return recommendFace(faces,'黑体');
  return -1;
}

export function installLocalFonts({apply,canEdit,saved,done,reading}){
  const $=id=>document.getElementById(id);let faces=[],busy=false;
  const message=text=>{$('font-batch-message').textContent=text;};
  function describe(){
    const missing=fontRoles.filter(role=>!saved()[role]&&Number(document.querySelector(`[data-font-role="${role}"]`)?.value??-1)<0);
    message(missing.length?'未选用途仍需备用字体：'+missing.join('、')+'。可修改下方选择。':'所选字体覆盖文字时，无需下载备用字库。请核对实际名称；替代字体仅供草拟。');
  }
  async function open(){
    if(busy||!canEdit())return;
    $('settings-dialog').close();if(!$('local-font-dialog').open)$('local-font-dialog').showModal();
    $('font-batch').hidden=false;
    if(!window.queryLocalFonts){message('此浏览器不支持直接读取本机字体，可使用下方的字体文件入口。');return;}
    busy=true;$('font-batch-open').disabled=true;$('font-batch-use').disabled=true;message('请在浏览器提示中允许读取本机字体。');
    try{
      faces=await window.queryLocalFonts();faces.sort((a,b)=>a.fullName.localeCompare(b.fullName));
      const rows=fontRoles.map(role=>{
        const label=document.createElement('label');label.textContent=role==='方正小标宋简体'?'标题 · 小标宋（缺少时建议黑体草拟）':role;
        const select=document.createElement('select');select.dataset.fontRole=role;
        const keep=document.createElement('option');keep.value=-1;keep.textContent=saved()[role]?'保留已保存的字体':'使用备用字体';select.append(keep);
        faces.forEach((face,index)=>{const option=document.createElement('option');option.value=index;option.textContent=`${face.fullName} · ${face.style}`;select.append(option);});
        select.value=saved()[role]?-1:recommendFace(faces,role);select.onchange=describe;label.append(select);return label;
      });
      $('font-batch-roles').replaceChildren(...rows);$('font-batch-use').disabled=!faces.length;
      if(faces.length)describe();else message('浏览器返回的字体列表为空，可选择字体文件或使用备用字体。');
    }catch(error){message(fontAccessError(error));}finally{busy=false;$('font-batch-open').disabled=false;}
  }
  $('font-batch-open').onclick=open;
  $('font-batch-use').onclick=async()=>{
    if(busy||!canEdit())return;
    busy=true;$('font-batch-use').disabled=true;$('font-batch-open').disabled=true;
    reading(true);
    for(const select of $('font-batch-roles').querySelectorAll('select'))select.disabled=true;
    message('正在读取所选字体并核对实际身份…');
    try{
      const loaded=new Map(),entries={};
      for(const select of $('font-batch-roles').querySelectorAll('select')){
        const face=faces[Number(select.value)];if(!face)continue;
        if(!loaded.has(face.postscriptName)){
          const blob=await face.blob();if(blob.size>32*1024*1024)throw Error('字体超过32 MB，请选择其他字体。');
          const font=inspectFont(new Uint8Array(await blob.arrayBuffer()));const index=font.faces.findIndex(item=>item.postscriptName===face.postscriptName);
          if(index<0)throw Error('字体列表与实际字体身份不一致，未改变原配置。');
          if(!font.faces[index].pdfAllowed)throw Error(font.faces[index].fullName+' 不适用于当前 PDF 嵌入，请选择其他字体。');
          loaded.set(face.postscriptName,fontFaceBytes(font,index));
        }
        entries[select.dataset.fontRole]=loaded.get(face.postscriptName);
      }
      if(!Object.keys(entries).length)throw Error('请至少选择一个本机字体；也可关闭设置并使用备用字体预览。');
      await apply(entries);message('已保存并优先使用所选本机字体；下次自动复用。');done();
    }catch(error){message(error.message);}finally{
      busy=false;$('font-batch-use').disabled=!faces.length;$('font-batch-open').disabled=false;
      reading(false);
      for(const select of $('font-batch-roles').querySelectorAll('select'))select.disabled=false;
    }
  };
  return {open};
}
