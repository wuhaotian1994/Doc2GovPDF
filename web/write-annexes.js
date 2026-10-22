import {tableColumnWidths} from './write-table-layout.js';
const labelPattern=/^附件\s*([0-9]*)$/;
const plain=value=>value.replace(/[\s\u3000]/g,'');
export function hasAnnexes(value){return Boolean(value?.annexes?.length||value?.postscript?.annexes?.length);}
export function annexAt(section,id){const i=section?.blocks.findIndex(b=>b.id===id);return (section?.annexes||[]).filter(a=>section.blocks.findIndex(b=>b.id===a.start)<=i).at(-1)||null;}
export function validateAnnexes(values,blocks){
 if(values===undefined)return [];if(!Array.isArray(values)||values.length>30)throw Error('附件身份记录无法读取，原稿未改变。');
 let previous=-1;return values.map(a=>{const start=blocks.findIndex(b=>b.id===a?.start),title=blocks.findIndex(b=>b.id===a?.title);
  if(start<=previous||title<=start||title>start+2||blocks[start]?.type!=='paragraph'||!labelPattern.test(blocks[start].text.trim())||blocks[title]?.type!=='paragraph'||!blocks[title].text.trim()||blocks[title].text.includes('\t')||blocks.slice(start+1,title).some(b=>b.type!=='paragraph'||b.text.trim()))throw Error('附件标识和标题的关系已改变。请先取消这处附件身份，再调整段落；原稿未改变。');
  previous=start;return {start:blocks[start].id,title:blocks[title].id};
 });
}
export function setAnnex(section,start,enabled=true){
 const next=structuredClone(section),index=next.blocks.findIndex(b=>b.id===start);next.annexes=(next.annexes||[]).filter(a=>a.start!==start);
 if(enabled){const label=next.blocks[index];if(label?.type!=='paragraph'||!labelPattern.test(label.text.trim()))throw Error('请先选中原文中单独一行的“附件”或“附件1”等标识。');let title=index+1;while(title<next.blocks.length&&next.blocks[title].type==='paragraph'&&!next.blocks[title].text.trim())title++;if(title>index+2||next.blocks[title]?.type!=='paragraph'||!next.blocks[title].text.trim()||next.blocks[title].text.includes('\t'))throw Error('附件标识后需要已有的标题段落，最多空一行；不会猜补标题。');next.annexes.push({start,title:next.blocks[title].id});next.annexes.sort((a,b)=>next.blocks.findIndex(p=>p.id===a.start)-next.blocks.findIndex(p=>p.id===b.start));}
 next.annexes=validateAnnexes(next.annexes,next.blocks);if(!next.annexes.length)delete next.annexes;return next;
}
export function annexCandidates(fields){
 const result=[],counts=new Map();for(const region of ['body','postscript']){const lines=(fields[region]||'').split('\n');for(let start=0;start<lines.length;start++){if(!labelPattern.test(lines[start].trim()))continue;let title=start+1;while(title<lines.length&&!lines[title].trim())title++;if(title>start+2||!lines[title]?.trim()||lines[title].includes('\t'))continue;const identity=JSON.stringify([lines[start],lines[title]]),occurrence=(counts.get(identity)||0)+1;counts.set(identity,occurrence);result.push({region,start,title,label:lines[start],name:lines[title],identity,occurrence});}}
 return result.map(a=>({...a,key:a.identity+'\0'+a.occurrence+'\0'+counts.get(a.identity)}));
}
export function applyAnnexChoices(content,fields,keys){
 if(!keys.size)return content;const next=structuredClone(content),matches=annexCandidates(fields).filter(a=>keys.has(a.key));
 for(const a of matches){const section=a.region==='body'?next:next.postscript;if(!section)throw Error('附件所在内容尚未形成工作稿，请重新核对。');
  const candidates=section.blocks.filter(b=>b.type==='paragraph'&&b.text===a.label),wanted=annexCandidates(fields).filter(c=>c.region===a.region&&c.identity===a.identity&&c.start<=a.start).length;let chosen,seen=0;for(const start of candidates){const index=section.blocks.indexOf(start),title=section.blocks.slice(index+1,index+3).find(b=>b.type==='paragraph'&&b.text.trim());if(title?.text===a.name&&++seen===wanted){chosen=start;break;}}
  if(!chosen)throw Error('附件原文范围已改变，请重新确认附件标识及标题。');const marked=setAnnex(section,chosen.id);Object.assign(section,marked);
 }return next;
}
export function compileAnnexes(section,compiled,availableWidth){
 for(const a of section.annexes||[]){const start=section.blocks.findIndex(b=>b.id===a.start),title=section.blocks.findIndex(b=>b.id===a.title),label=compiled[start].paragraph,heading=compiled[title].paragraph;
  Object.assign(label,{role:'attachment-label',font:'黑体',size:16,line:10.21,align:'left',indent:0,leftIndent:0,rightIndent:0,hanging:0,before:0,after:title===start+1?10.21:0,pageBreak:true,keepNext:true,prefix:''});
  Object.assign(heading,{role:'attachment-title',font:'方正小标宋简体',size:22,line:10.21,align:'center',indent:0,leftIndent:0,rightIndent:0,hanging:0,before:0,after:10.21,pageBreak:false,keepNext:true,prefix:''});
  for(let i=start+1;i<title;i++)compiled[i].paragraph.keepNext=true;
  const nextStart=(section.annexes||[]).map(item=>section.blocks.findIndex(b=>b.id===item.start)).find(i=>i>start)??compiled.length;
  for(let i=title+1;i<nextStart;i++)if(compiled[i].table){const table=compiled[i].table;table.widths=tableColumnWidths(section.blocks[i],availableWidth,16);for(const row of table.rows)for(const cell of row.cells)for(const p of cell.paragraphs)Object.assign(p,{font:'仿宋',size:16,line:10.21});if(table.caption)Object.assign(table.caption,{font:'黑体',size:16,line:10.21});}

 }
 return compiled;
}
export function attachmentSummary(content){return [...(content?.annexes||[]).map(a=>({region:'body',...a})),...(content?.postscript?.annexes||[]).map(a=>({region:'postscript',...a}))].map(a=>{const section=a.region==='body'?content:content.postscript;return {label:section.blocks.find(b=>b.id===a.start).text,title:section.blocks.find(b=>b.id===a.title).text};});}
