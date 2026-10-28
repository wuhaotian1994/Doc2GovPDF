// Read only user-selected SFNT bytes. A role is not evidence of font identity.
const limit=32*1024*1024,decoder=new TextDecoder('utf-16be');
export function inspectFont(source){
 const bytes=source instanceof Uint8Array?source:new Uint8Array(source);
 if(!bytes.length||bytes.length>limit)throw Error('字体须为32 MB以内的TTF或TTC，原配置保持。');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),span=(p,n)=>{if(!Number.isSafeInteger(p)||p<0||n<0||p+n>bytes.length)throw Error('字体表越界或损坏，原配置保持。');},u16=p=>{span(p,2);return view.getUint16(p);},u32=p=>{span(p,4);return view.getUint32(p);},tag=p=>{span(p,4);return String.fromCharCode(...bytes.subarray(p,p+4));};
 const collection=tag(0)==='ttcf',count=collection?u32(8):1;
 if(count<1||count>128)throw Error('字体集合数量无效，原配置保持。');if(collection)span(12,count*4);
 const faces=[];
 for(let index=0;index<count;index++){
  const start=collection?u32(12+4*index):0,version=u32(start);if(version!==0x00010000&&tag(start)!=='true')throw Error('此字体轮廓尚不支持；请选择TrueType TTF或TTC，原配置保持。');
  const n=u16(start+4);if(n<1||n>256)throw Error('字体表数量无效。');span(start+12,n*16);const tables=new Map();
  for(let i=0;i<n;i++){const p=start+12+i*16,name=tag(p),offset=u32(p+8),length=u32(p+12);span(offset,length);if(tables.has(name))throw Error('字体包含重复表。');tables.set(name,{offset,length,record:p});}
  if(!tables.has('glyf')||!tables.has('head')||tables.get('head').length<12)throw Error('此字体不含支持的TrueType轮廓。');
  const names=tables.get('name'),values=new Map();
  if(names){if(names.length<6)throw Error('字体名称表损坏。');const p=names.offset,total=u16(p+2),strings=u16(p+4);if(6+total*12>names.length||strings>names.length)throw Error('字体名称表损坏。');
   for(let i=0;i<total;i++){const q=p+6+i*12,platform=u16(q),encoding=u16(q+2),language=u16(q+4),id=u16(q+6),length=u16(q+8),offset=u16(q+10);if(strings+offset+length>names.length)throw Error('字体名称内容损坏。');if(![1,2,4,6,16,17].includes(id)||!(platform===0||platform===3&&[0,1,10].includes(encoding)))continue;const data=bytes.subarray(p+strings+offset,p+strings+offset+length);if(length%2)continue;const value=decoder.decode(data).replace(/\0/g,'').trim();if(value.length>300)continue;const rank=platform===3?(language===0x804?4:language===0x409?3:2):1;if(value&&(!values.has(id)||values.get(id).rank<rank))values.set(id,{value,rank});}
  }
  const name=id=>values.get(id)?.value||'',family=name(16)||name(1),style=name(17)||name(2),fullName=name(4)||[family,style].filter(Boolean).join(' '),postscriptName=name(6);
  if(!fullName||!postscriptName)throw Error('无法识别真实字体名称，原配置保持。');
  const os=tables.get('OS/2'),fsType=os&&os.length>=10?u16(os.offset+8):null;
  // The existing PDF engine subsets TrueType fonts. Refuse restricted, bitmap,
  // no-subsetting and unknown technical embedding flags before registration.
  const pdfAllowed=fsType!==null&&[0,4,8].includes(fsType);
  const embedding=fsType===null?'未声明可核嵌入标志':fsType&2?'受限嵌入':fsType&0x200?'仅位图嵌入':fsType&0x100?'不允许子集嵌入':fsType===8?'可编辑嵌入标志':fsType===4?'仅预览打印嵌入标志':fsType===0?'可安装嵌入标志':'未支持的嵌入标志';
  faces.push({index,family,style,fullName,postscriptName,fsType,pdfAllowed,embedding,tables,start});
 }
 return {bytes,collection,faces};
}
export function fontFaceBytes(font,index){
 const face=font.faces[index];if(!face)throw Error('请选择有效字体面。');if(!face.pdfAllowed)throw Error('该字体的技术嵌入标志不适用于当前PDF子集输出，原配置保持。');
 if(!font.collection)return font.bytes.slice();
 const records=[...face.tables.values()],size=12+records.length*16+records.reduce((n,t)=>n+Math.ceil(t.length/4)*4,0),out=size<=limit?new Uint8Array(size):null;if(!out)throw Error('提取后的字体超过32 MB，原配置保持。');const view=new DataView(out.buffer);out.set(font.bytes.subarray(face.start,face.start+12+records.length*16));let at=12+records.length*16,head=0;
 records.forEach((t,i)=>{out.set(font.bytes.subarray(t.offset,t.offset+t.length),at);view.setUint32(12+i*16+8,at);if(String.fromCharCode(...out.subarray(12+i*16,16+i*16))==='head')head=at;at+=Math.ceil(t.length/4)*4;});
 if(!head||head+12>out.length)throw Error('字体head表损坏。');view.setUint32(head+8,0);let sum=0;for(let i=0;i<out.length;i+=4)sum=(sum+view.getUint32(i))>>>0;view.setUint32(head+8,(0xb1b0afba-sum)>>>0);return out;
}
export function fontSummary(font,index=0){const f=font.faces[index];return `${f.fullName} · ${f.postscriptName} · ${f.embedding}`;}
export function fontAccessError(error){return error?.name==='NotAllowedError'?'未获得本机字体读取权限；这不表示没有安装字体。可重试授权，或选择有权使用的字体文件。':error?.name==='SecurityError'?'当前页面的安全策略不允许读取本机字体，可选择字体文件。':`本机字体读取失败：${error?.message||'未知原因'}。原配置保持，可选择字体文件。`;}
