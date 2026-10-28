import {validateContent,paragraph,table} from './write-content.js';
import {annexAt} from './write-annexes.js';

// This module only organizes author-selected complete paragraphs. It neither
// infers columns nor claims to recover geometry from a plain-text source.
const idPattern=/^[a-zA-Z0-9-]{1,80}$/;
const fail=message=>{throw Error(message+' 原稿未改变。');};
const clone=value=>structuredClone(value);

function context(value,{region='body',sectionOnly=false}={}){
 if(!['body','postscript'].includes(region)||typeof sectionOnly!=='boolean'||sectionOnly&&region!=='postscript')fail('文字所在区域无效。');
 const content=validateContent(value,{postscript:sectionOnly});
 const section=region==='postscript'&&!sectionOnly?content.postscript:content;
 if(!section)fail('请先选中已有的落款后文字。');
 return {content,section,region,sectionOnly};
}

function endpoints(section,range){
 if(!range||typeof range!=='object')fail('请先选择需要组织的完整段落。');
 let start,end;
 if(Array.isArray(range.ids)){
  if(!range.ids.length||new Set(range.ids).size!==range.ids.length)fail('所选段落范围无效。');
  start=section.blocks.findIndex(block=>block.id===range.ids[0]);end=start+range.ids.length-1;
  if(start<0||range.ids.some((id,i)=>section.blocks[start+i]?.id!==id))fail('请选择连续的完整段落，不能跨过原有表格或未选范围。');
 }else if(range.start&&range.end){
  start=section.blocks.findIndex(block=>block.id===range.start.block);end=section.blocks.findIndex(block=>block.id===range.end.block);
  if(start<0||end<start||!Number.isInteger(range.start.offset)||!Number.isInteger(range.end.offset))fail('所选文字范围已失效。');
  if(end>start&&range.end.offset===0)end--;
  else if(range.end.offset!==section.blocks[end]?.text?.length)fail('请选完整段落，不会扩大原选区。');
  if(range.start.offset!==0)fail('请选完整段落，不会扩大原选区。');
 }else{
  start=range.startIndex;end=range.endIndex;
 }
 if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||end>=section.blocks.length)fail('请选择有效的完整段落范围。');
 return {start,end};
}

function selectedSource(section,start,end){
 if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||end>=section.blocks.length)fail('所选段落范围已失效，请重新选择。');
 const blocks=section.blocks.slice(start,end+1);
 if(blocks.some(block=>block.type!=='paragraph'))fail('选区跨过已有表格，请分开选择表外文字。');
 for(const a of section.annexes||[]){
  const mark=section.blocks.findIndex(block=>block.id===a.start),title=section.blocks.findIndex(block=>block.id===a.title);
  if(start<=title&&end>=mark)fail('附件标识、标题和中间空行需保留，请只选择附件内的普通文字。');
 }
 if(new Set(blocks.map(block=>annexAt(section,block.id)?.start||'')).size>1)fail('所选文字跨越附件范围，请分开组织。');
 return blocks.map((block,i)=>({id:block.id,index:start+i,text:block.text}));
}

// Indices are zero-based and inclusive. DOM endpoints must cover complete
// paragraphs; an endpoint at the next block's offset zero excludes that block.
// sectionOnly is for an existing suffix editor that supplies its section alone.
export function captureTextTableSelection(value,range,settings={}){
 const {content,section,region,sectionOnly}=context(value,settings),{start,end}=endpoints(section,range),source=selectedSource(section,start,end);
 return {version:1,region,sectionOnly,startIndex:start,endIndex:end,ids:source.map(item=>item.id),source,snapshot:JSON.stringify(content)};
}

function currentSelection(value,selection){
 if(selection?.version!==1)fail('文字选择已失效，请重新选择。');
 const result=context(value,selection);
 if(JSON.stringify(result.content)!==selection.snapshot)fail('稿件在预览后已有变化，请重新选择并预览。');
 const source=selectedSource(result.section,selection.startIndex,selection.endIndex);
 if(JSON.stringify(source)!==JSON.stringify(selection.source)||JSON.stringify(source.map(item=>item.id))!==JSON.stringify(selection.ids))fail('所选段落的依据已变化，请重新选择并预览。');
 return {...result,source};
}

function choices(source,options){
 if(!options||!['rows','header'].includes(options.mode))fail('请选择按原文组织表格，或新建待填写回执。');
 if(options.mode==='rows'&&(!Number.isInteger(options.columns)||options.columns<1||options.columns>10))fail('请明确填写1至10列。');
 if(options.mode==='rows'&&typeof options.header!=='boolean')fail('请明确第一行是否作为表头。');
 if(options.mode==='header'&&(!Number.isInteger(options.blankRows)||options.blankRows<1||options.blankRows>99))fail('请明确新建1至99行待填写空白。');
 const include=options.includeIDs===undefined?source.map(item=>item.id):options.includeIDs;
 if(!Array.isArray(include)||new Set(include).size!==include.length||include.some(id=>!source.some(item=>item.id===id)))fail('勾选的原文范围无效。');
 const columns=options.mode==='header'?include.length:options.columns;
 if(options.mode==='header'&&(columns>10||options.columns!==undefined&&options.columns!==columns))fail('每个所选完整段落作为一个表头字段，最多支持10个字段。');
 return {mode:options.mode,columns,header:options.mode==='header'?true:options.header,...(options.mode==='header'?{blankRows:options.blankRows}:{}),includeIDs:source.filter(item=>include.includes(item.id)).map(item=>item.id)};
}

function idsIn(content){
 const ids=new Set();
 const collect=section=>{for(const block of section.blocks){ids.add(block.id);if(block.type==='table')for(const row of block.rows){ids.add(row.id);for(const cell of row.cells)ids.add(cell.id);}}if(section.postscript)collect(section.postscript);};
 collect(content);return ids;
}

function materialize(ctx,plan,idFactory){
 const next=clone(ctx.content),section=ctx.region==='postscript'&&!ctx.sectionOnly?next.postscript:next,existing=idsIn(next);
 const id=()=>{const value=idFactory();if(typeof value!=='string'||!idPattern.test(value)||existing.has(value))fail('新表的定位信息无法安全建立。');existing.add(value);return value;};
 const start=new Map(plan.tables.map(value=>[value.startIndex,value])),used=new Set(plan.usedIDs),blocks=[];
 for(let i=0;i<section.blocks.length;i++){
  const group=start.get(i);
  if(group){const grid=table(group.rows.length,plan.options.columns,'',id);grid.header=group.header;grid.rows.forEach((row,ri)=>row.cells.forEach((cell,ci)=>cell.text=group.rows[ri][ci]));blocks.push(grid);}
  if(!used.has(section.blocks[i].id))blocks.push(section.blocks[i]);
 }
 if(plan.addedTrailingParagraph&&blocks.at(-1)?.type==='table')blocks.push(paragraph('',id()));
 section.blocks=blocks;
 return validateContent(next,{postscript:ctx.sectionOnly});
}

// rows: explicit columns + header boolean; header: each selected paragraph is
// an author-declared field, so its count supplies columns, with explicit blankRows.
// includeIDs can leave text untouched. Row runs never cross retained prose;
// explicitly selected header fields may span only excluded whitespace paragraphs.
export function previewTextTable(value,selection,options){
 const ctx=currentSelection(value,selection),settings=choices(ctx.source,options),included=new Set(settings.includeIDs),runs=[];
 for(const item of ctx.source){if(!included.has(item.id))continue;const last=runs.at(-1);if(last&&last.at(-1).index===item.index-1)last.push(item);else runs.push([item]);}
 const tables=[],usedIDs=[],warnings=[],headerGaps=new Set();
 if(settings.mode==='header'){
  if(included.size&&included.size!==settings.columns)fail('所选表头字段数必须与明确填写的列数一致。');
  const fields=ctx.source.filter(item=>included.has(item.id));
  if(fields.length){
   const gaps=ctx.source.filter(item=>item.index>fields[0].index&&item.index<fields.at(-1).index&&!included.has(item.id)),blocking=gaps.find(item=>item.text.trim()!=='');
   if(blocking)fail(`原第 ${blocking.index+1} 段是未选的非空文字，位于所选表头字段之间。请取消它一侧的字段、分开组织；若该段本来也是字段，请明确勾选。不能跨过未选正文。`);
   for(const item of gaps)headerGaps.add(item.id);
   tables.push({startIndex:fields[0].index,sourceIDs:fields.map(item=>item.id),header:true,rows:[fields.map(item=>item.text),...Array.from({length:settings.blankRows},()=>Array(settings.columns).fill(''))]});usedIDs.push(...fields.map(item=>item.id));warnings.push(`新建${settings.blankRows}行待填写空白；这不是恢复原表几何。`);
   if(gaps.length)warnings.push(`字段间的${gaps.length}段未选空白不进入单元格，原字符串和段落标识按顺序保留为表外段，显示在新表之后；未删除空白。`);
  }
 }else{
  for(const run of runs){
   const complete=Math.floor(run.length/settings.columns)*settings.columns,rows=[];
   for(let i=0;i<complete;i+=settings.columns)rows.push(run.slice(i,i+settings.columns).map(item=>item.text));
   if(rows.length>100)fail('组织后的表格超过100行，请缩小选择范围。');
   if(rows.length){const used=run.slice(0,complete);tables.push({startIndex:run[0].index,sourceIDs:used.map(item=>item.id),header:settings.header,rows});usedIDs.push(...used.map(item=>item.id));}
  }
 }
 const used=new Set(usedIDs),retainedOriginal=ctx.source.filter(item=>!used.has(item.id)).map(item=>({...item,reason:headerGaps.has(item.id)?'header-gap':included.has(item.id)?'remainder':'excluded'}));
 const remainder=retainedOriginal.filter(item=>item.reason==='remainder').length;
 if(remainder)warnings.push(`${remainder}段不足以组成完整一行，仍在原处保留，未补造单元格。`);
 if(tables.length>1)warnings.push('跳过的原文仍在原处；已按连续范围分别组织表格，未跨过这些文字搬动顺序。');
 if(!tables.length)warnings.push('尚无完整的可用范围，原文保持不变。');
 const addedTrailingParagraph=Boolean(tables.length&&used.has(ctx.section.blocks.at(-1).id));
 if(addedTrailingParagraph)warnings.push('表后保留一个空白段落，方便继续写正文。');
 const plan={version:1,mode:settings.mode,source:clone(ctx.source),selection:clone(selection),options:settings,tables,rows:tables.length===1?clone(tables[0].rows):[],usedIDs,retainedOriginal,warnings,addedTrailingParagraph,canApply:tables.length>0};
 // Capacity is checked against a complete virtual result before confirmation.
 // Preview IDs never escape into a saved draft or consume random identities.
 if(plan.canApply){let n=0;const existing=idsIn(ctx.content);materialize(ctx,plan,()=>{let id;do{id='text-table-preview-'+ ++n;}while(existing.has(id));return id;});}
 return plan;
}

export function applyTextTable(value,preview,idFactory=()=>crypto.randomUUID()){
 if(preview?.version!==1||!preview.canApply)fail('请先查看可应用的二维预览。');
 const ctx=currentSelection(value,preview.selection),expected=previewTextTable(value,preview.selection,preview.options);
 if(JSON.stringify(preview)!==JSON.stringify(expected))fail('表格预览已变化，请重新核对后确认。');
 return materialize(ctx,expected,idFactory);
}
