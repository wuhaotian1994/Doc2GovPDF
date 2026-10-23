import {analyseMaterial,materialProposal,selectMaterialClosing} from './write-materials.js';
import {materialTables,confirmedMaterialContent} from './write-material-tables.js';
import {contentFromText,contentText,validateContent} from './write-content.js';
import {annexAt,setAnnex} from './write-annexes.js';
const office=text=>text.length>=4&&text.length<=60&&!/^(?:各|有关|相关|以上|如下|此)/.test(text)&&!/^本(?:单位|机关|部门|办公室|工作组)$/.test(text)&&!/[0-9〔〕\[\]（）()：:。！？!?;]/.test(text)&&/(?:办公室|人民政府|委员会|工作组|公司|大学|学院|中学|小学|学校|中心|机关|单位|部门|工会|协会|联合会|[局院所])$/.test(text);
const titleLike=text=>text.length<=180&&!/[。！？!?：:]$/.test(text)&&(/关于/.test(text)||/(通知|通告|公告|请示|报告|办法|方案|纪要|意见|函)$/.test(text));
let priorSource,priorAnalysis;
function analysis(source){if(source!==priorSource){priorAnalysis=analyseMaterial(source);priorSource=source;}return priorAnalysis;}
function years(source){const code=source.split('\n').filter(line=>/^[（(]?[^。；！？!?;：:]{0,45}[〔\[【［]\s*\d{4}\s*[〕\]】］][^。；！？!?;：:]{0,30}号[）)]?$/.test(line.trim())).join('\n');return [...new Set([...code.matchAll(/[〔\[【［]\s*(\d{4})\s*[〕\]】］]/g)].map(m=>m[1]))];}
function closingPrefix(section,index){let start=index;const names=[];while(start>0&&section.blocks[start-1].type==='paragraph'&&office(section.blocks[start-1].text.trim())&&names.join('\n').length+section.blocks[start-1].text.trim().length+1<=120){names.unshift(section.blocks[start-1].text.trim());start--;}return{start,names};}
function cleanClosing(closing){return Boolean(closing.signature?.indices?.length)&&closing.signature.value.split('\n').every(office);}
function conflictYear(source,date){const list=years(source);return list.length>0&&!list.includes(date.slice(0,4));}
export function assembleArticle(raw,current={}){
 const context={title:current.title||''};current=context;
 let a=analyseMaterial(raw);const selected={},changes=[];const title=a.candidates.title;
 if(title&&(titleLike(title.value)||title.value===current.title?.trim())&&(!current.title?.trim()||title.value===current.title.trim())){selected.title=true;changes.push('首行已用作标题，不在正文重复');}
 else if(current.title?.trim())selected.keepTitle=true;
 if(a.candidates.recipient&&(!current.recipient?.trim()||current.recipient.trim()===a.candidates.recipient.value)){selected.recipient=true;changes.push('收文对象已单独排在开头');}
 const safe=a.closings.map((c,i)=>({c,i})).filter(({c})=>cleanClosing(c)&&!conflictYear(a.source,c.date.value)&&(!current.signature?.trim()||current.signature.trim()===c.signature.value)&&(!current.date||current.date===c.date.value)&&(!c.postscript||c.postscript.value.length<=4000));
 if(safe.length===1){a=selectMaterialClosing(a,safe[0].i);Object.assign(selected,{date:true,signature:true,...(a.candidates.postscript?{postscript:true}:{})});changes.push('明确的署名与日期已放到文末，后续内容保持在其后');}
 const proposal=materialProposal(a,selected,false,current.title||'');if(proposal.conflicts.length)throw Error(proposal.conflicts.join(' '));
 const fields={...current,...proposal.fields,sourceMaterial:a.source,pendingMaterial:''};
 for(const name of ['title','recipient','signature','date','agency','reference','letterhead','attachments','copyTo'])if(!proposal.fields[name]&&current[name])fields[name]=current[name];
 // Explicit rectangular TSV is a lossless structural operation, not a guess
 // about table purpose. Existing blank cells, numbers and order stay intact.
 const tables=materialTables(proposal.fields);let content=confirmedMaterialContent(proposal.fields,new Set(tables.map(t=>t.key)))||contentFromText(fields.body);
 for(const section of [content,content.postscript].filter(Boolean))for(const b of section.blocks)if(b.type==='table')b.header=b.rows[0].cells.every(c=>c.text.trim()&&!/[0-9]/.test(c.text)&&c.text.trim().length<=30)&&b.rows[0].cells.some(c=>/(名称|姓名|项目|时间|数量|序号|单位|类别|备注|学校|人数|地点|人员|内容|评分|分值|规则)/.test(c.text));
 if(fields.postscript&&!content.postscript)content.postscript=contentFromText(fields.postscript);
 if(!content.blocks.some(b=>b.type==='table'||b.text.trim()))throw Error('暂排后没有正文，原输入保持；请补充要整理的内容。');
 if(tables.length)changes.push(`${tables.length}张明确原表已按原网格保留`);
 fields.body=contentText(content);fields.postscript=content.postscript?contentText(content.postscript):fields.postscript;
 return {fields,content:validateContent(content),changes};
}
export function assemblyQuestions(fields,content){
 if(!fields.sourceMaterial||!content)return [];
 const a=analysis(fields.sourceMaterial),visible=[fields.body,fields.postscript,fields.reference].filter(Boolean).join('\n'),questions=[],sections=[['body',content],['postscript',content.postscript]].filter(([,s])=>s);
 const find=text=>sections.flatMap(([field,s])=>s.blocks.filter(b=>b.type==='paragraph'&&b.text.trim()===text.trim()).map(block=>({field,block})));
 const first=a.candidates.title;
 if(first&&titleLike(first.value)&&fields.title.trim()!==first.value)for(const at of find(first.text))questions.push({...at,kind:'title',message:'已填标题与原文首行不同。首行暂留在这里，选择哪一个用于标题？',action:'用原文首行作标题',proposal:'拟用标题：'+first.value,value:first.value});
 const recipient=a.candidates.recipient;
 if(recipient&&fields.recipient.trim()!==recipient.value)for(const at of find(recipient.text))questions.push({...at,kind:'recipient',message:'这行收文对象与当前填写不同，原句暂留在这里。',action:'用这一行作收文对象',proposal:'拟发给：'+recipient.value,value:recipient.value});
 // A single contextual question near the last unresolved closing, rather than
 // asking the author to classify every date or every source line.
 const last=a.closings.at(-1);
 if(last){
  const inBody=find(last.date.text).filter(at=>at.field==='body');
  for(const at of inBody){const section=at.field==='postscript'?content.postscript:content,index=section.blocks.indexOf(at.block),near=section.blocks.slice(Math.max(0,index-3),index).filter(b=>b.type==='paragraph').map(b=>b.text).join('\n'),mixed=years(near).length>0,mismatch=conflictYear(visible,last.date.value),multiple=a.closings.length>1;
   questions.push({...at,kind:'closing',value:last.date.value,message:(mixed?'编号或引用与机关行混在一起，未自动认作联合署名。':multiple?'原文有多处日期，未自动选择成文日期。':'这里的署名或日期用途尚待核对，已保留原文。')+(mismatch?' 编号年份与这处日期不同，不会自动改年份。':''),action:'将'+last.date.text.trim()+'用于落款',proposal:'拟放在落款：'+[...closingPrefix(section,index).names,last.date.text.trim()].join(' · ')+'。之后的内容保持在日期之后，引用编号留在原文。'});
  }
 }
 if(fields.date&&conflictYear(visible,fields.date))questions.push({field:'date',kind:'year',value:fields.date,message:`编号或引用出现${years(visible).join('、')}年，当前成文日期为${fields.date}；请按原始事实核对，不会自动改值。`});
 for(const [field,s] of sections)for(const block of s.blocks)if(block.type==='paragraph'&&/^附件\s*[0-9]*$/.test(block.text.trim())&&!annexAt(s,block.id))questions.push({field,block,kind:'annex',message:'原文有附件标识，暂未替你确认它是实际随文附件。',action:'这是实际附件，另面编排'});
 return questions;
}
export function assemblyInspection(model,inspection,fields,content){
 const questions=assemblyQuestions(fields,content),issues=[];
 for(const q of questions){let p;if(q.block)p=model.blocks.flatMap(b=>b.paragraph?[b.paragraph]:[]).find(p=>p.id==='writer-content-'+q.block.id);else if(q.field==='date')p=model.blocks.map(b=>b.paragraph).find(p=>p?.role==='date');if(!p)continue;
  issues.push({id:'writer-material-'+q.kind+'-'+p.id,rule:'writer.material.'+q.kind,severity:'review',paragraphId:p.id,original:q.block?.text||fields.date,message:q.message,replacement:'',basis:'原材料与当前暂排结果的具体待核差异；不是事实或标准已确认',_assembly:q});
 }
 return {...inspection,issues:[...(inspection?.issues||[]),...issues]};
}
export function applyAssemblyQuestion(fields,content,q){
 const next=structuredClone(content),f={...fields};let section=q.field==='postscript'?next.postscript:next;
 if(!q.block||!section)throw Error('请在对应字段核对原文。');const index=section.blocks.findIndex(b=>b.id===q.block.id),block=section.blocks[index];if(!block||block.text!==q.block.text)throw Error('这处原文已变化，请核对最新内容后再操作。');
 if(q.kind==='annex'){const marked=setAnnex(section,block.id,true);if(q.field==='postscript')next.postscript=marked;else Object.assign(next,marked);}
 else if(q.kind==='title'||q.kind==='recipient'){f[q.kind]=q.value;section.blocks.splice(index,1);if(!section.blocks.length)section.blocks.push(...contentFromText('').blocks);}
 else if(q.kind==='closing'){
  if(q.field!=='body'||next.postscript||next.annexes?.length)throw Error('当前已有落款后结构或实际附件，请在当前稿直接修改字段并核对顺序；原文未移动。');
  const {start,names}=closingPrefix(section,index);
  const before=section.blocks.slice(0,start),after=section.blocks.slice(index+1);if(!before.some(b=>b.type==='table'||b.text.trim()))throw Error('不能把全部正文移作落款，内容保持。');
  f.date=q.value;if(names.length)f.signature=names.join('\n');next.blocks=before;if(after.length)next.postscript={version:1,blocks:after};
 }
 const checked=validateContent(next);f.body=contentText(checked);f.postscript=checked.postscript?contentText(checked.postscript):'';return{fields:f,content:checked};
}
