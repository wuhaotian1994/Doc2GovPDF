import {validateContent} from './write-content.js';
export function blankTableState(content,id){
 const table=[...(content?.blocks||[]),...(content?.postscript?.blocks||[])].find(b=>b.id===id&&b.type==='table');
 return table?{kind:'table-blank-range',table:structuredClone(table)}:null;
}
export function validBlankState(value){
 try{if(value?.kind!=='table-blank-range')return false;const checked=validateContent({version:1,blocks:[value.table]});return checked.blocks[0].type==='table'&&JSON.stringify(checked.blocks[0])===JSON.stringify(value.table);}catch{return false;}
}
// Only group the existing non-blocking empty-cell rule. Errors, facts and other
// suggestions keep their original individual inspection entries.
export function groupBlankTables(entries,model,inspection,content,documentId){
 if(!content)return entries;
 const pending=new Map(),groups=new Map();
 for(const entry of entries){const id=entry.source?.content?.block;if(entry.issue.rule==='table.empty-cell'&&entry.issue.severity==='suggestion'&&id&&blankTableState(content,id)){pending.set(entry.issue.id,entry);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(entry);}}
 const output=entries.filter(e=>!pending.has(e.issue.id));
 for(const [id,items] of groups){
  const state=blankTableState(content,id),table=state.table;const field=items[0].source.field,region=field==='postscript'?content.postscript:content,index=region.blocks.filter(b=>b.type==='table').findIndex(b=>b.id===id)+1;
  const cells=items.map(entry=>{const row=table.rows.find(r=>r.id===entry.source.content.row),cell=row?.cells.find(c=>c.id===entry.source.content.cell);return {row:table.rows.indexOf(row)+1,column:row?.cells.indexOf(cell)+1,entry};});
  if(cells.some(c=>c.row<1||c.column<1)){output.push(...items);continue;}
  const issue={id:'writer-blank-range-'+id,rule:'writer.table-blank-range',severity:'suggestion',message:`此表有${cells.length}处空白，请核对是待填写范围还是遗漏。`,original:'',replacement:'',basis:'表格完整性建议；空白不等于0，不自动补字或横线'};
  const rules=[...new Set(items.map(e=>JSON.stringify([e.issue.rule,e.issue.message,e.issue.basis,e.issue.replacement||''])))].sort();
  const key=JSON.stringify([documentId,inspection.version,issue.rule,issue.severity,issue.message,issue.original,'',issue.basis,state,rules,null,'table-blanks']);
  output.push({issue,key,documentId,scope:'table-blanks',blankState:state,source:items[0].source,group:{index,field,caption:table.caption,rows:table.rows.length,columns:table.rows[0].cells.length,cells}});
 }
 return output;
}
