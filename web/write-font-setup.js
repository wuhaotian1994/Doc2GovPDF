import {inspectFont,fontFaceBytes} from './write-font-source.js';

export const requiredFonts=[
  {role:'方正小标宋简体',label:'标题',name:'小标宋',aliases:['FZXiaoBiaoSong-B05S','FZXiaoBiaoSong','方正小标宋简体','方正小标宋_GBK']},
  {role:'仿宋',label:'正文',name:'仿宋',aliases:['FangSong','FangSong_GB2312','STFangsong','仿宋','仿宋_GB2312','华文仿宋']},
  {role:'黑体',label:'一级标题',name:'黑体',aliases:['SimHei','Heiti SC','STHeiti','黑体','黑体-简']},
  {role:'楷体',label:'二级标题',name:'楷体',aliases:['KaiTi','KaiTi_GB2312','STKaiti','Kaiti SC','楷体','楷体_GB2312','楷体-简','华文楷体']},
  {role:'宋体',label:'页码等',name:'宋体',aliases:['SimSun','Songti SC','STSong','宋体','宋体-简','华文宋体']}
];
const key=value=>String(value||'').toLowerCase().replace(/[\s_-]/g,'');
export function matchesRequiredFont(face,requirement){return [face.family,face.fullName,face.postscriptName].some(value=>requirement.aliases.map(key).includes(key(value)))&&!/bold|italic|oblique|粗体|斜体/i.test(face.style||'');}
export function matchFontFiles(fonts){
  const entries={};
  for(const requirement of requiredFonts)for(const font of fonts){const face=font.faces.find(face=>face.pdfAllowed&&matchesRequiredFont(face,requirement));if(face){entries[requirement.role]=fontFaceBytes(font,face.index);break;}}
  return entries;
}
export function installFontSetup({saved,decode,apply,canEdit,reading}){
  const $=id=>document.getElementById(id),cache=new Map();let busy=false;
  function status(){return requiredFonts.map(requirement=>{
    const data=saved()[requirement.role],old=cache.get(requirement.role);if(old&&old.data===data)return old.value;
    let face;try{if(data)face=inspectFont(decode(data)).faces[0];}catch{}
    const value={...requirement,ready:Boolean(face?.pdfAllowed&&matchesRequiredFont(face,requirement)),actual:face?.fullName};cache.set(requirement.role,{data,value});return value;
  });}
  function refresh(){
    const values=status(),missing=values.filter(value=>!value.ready);
    $('layout-font-state').textContent=missing.length?'排版字体还需补齐':'排版字体已就绪';
    $('layout-font-description').textContent=missing.length?`还缺${missing.map(value=>value.label+'用字').join('、')}。点击下方按钮，自动查找这台电脑上的对应字体。`:'已匹配标题、正文、小标题和页码用字。字号与行距由系统处理，无需逐项设置。';
    $('layout-font-details').replaceChildren(...values.map(value=>{const row=document.createElement('p');row.textContent=`${value.label}：${value.ready?value.actual:'需补充'+value.name}`;return row;}));
    $('layout-font-auto').disabled=busy||!canEdit();$('layout-font-file-open').disabled=busy||!canEdit();
    return missing.length===0;
  }
  async function run(load){
    if(busy||!canEdit())return;busy=true;reading(true);refresh();$('layout-font-message').textContent='正在检查可用的排版字体…';
    try{const entries=await load();if(!Object.keys(entries).length)throw Error('没有找到可用的对应字体。可以让单位提供字体文件，再点击“补充字体文件”。');await apply(entries);const complete=refresh();$('layout-font-message').textContent=complete?'配置已保存，以后自动使用。':'已保存找到的字体；缺少的部分仍需补充，备用字体仅用于草拟。';}
    catch(error){$('layout-font-message').textContent=error.name==='NotAllowedError'?'未获得读取权限。可重新点击允许读取，或补充单位提供的字体文件。':error.message;}
    finally{busy=false;reading(false);refresh();}
  }
  const configure=()=>run(async()=>{
    if(!window.queryLocalFonts)throw Error('这个浏览器不支持自动读取。请点击“补充字体文件”，系统会自动匹配用途。');
    const faces=await window.queryLocalFonts(),entries={},loaded=new Map();
    for(const requirement of requiredFonts){
      const face=faces.find(face=>matchesRequiredFont(face,requirement));if(!face)continue;
      if(!loaded.has(face.postscriptName)){const blob=await face.blob();if(blob.size>32*1024*1024)throw Error('单个字体文件超过32 MB，请使用较小的文件。');loaded.set(face.postscriptName,inspectFont(new Uint8Array(await blob.arrayBuffer())));}
      const font=loaded.get(face.postscriptName),actual=font.faces.find(item=>item.postscriptName===face.postscriptName&&item.pdfAllowed&&matchesRequiredFont(item,requirement));
      if(!actual)continue;entries[requirement.role]=fontFaceBytes(font,actual.index);
    }return entries;
  });
  $('layout-font-auto').onclick=configure;
  $('layout-font-file-open').onclick=()=>$('layout-font-files').click();
  $('layout-font-files').onchange=event=>{const files=[...event.target.files];event.target.value='';if(!files.length)return;run(async()=>{if(files.length>20||files.reduce((sum,file)=>sum+file.size,0)>128*1024*1024)throw Error('一次最多选择20个文件、合计128 MB，请分批添加。');const fonts=[];for(const file of files){if(file.size>32*1024*1024)throw Error('单个字体文件超过32 MB。');fonts.push(inspectFont(new Uint8Array(await file.arrayBuffer())));}return matchFontFiles(fonts);});};
  return {refresh,configure,isReady:()=>status().every(value=>value.ready)};
}
