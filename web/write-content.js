import {validateAnnexes,compileAnnexes,annexAt} from './write-annexes.js';
import {tableColumnWidths,isSummaryRow} from './write-table-layout.js';
// Canonical body content for the normal writer. It belongs to the same draft;
// the plain-text body is a derived representation, never a second document.
export const contentRoles=['auto','body','title','heading','heading2','heading3','heading4','article','signature','date'];
const alignments=['auto','left','center','right','both'],indents=['auto','none','two'],spaces=['auto','none','half','one'];
const bodyRoles=new Set(['body','article','heading','heading2','heading3','heading4']);
const uid=()=>crypto.randomUUID();
export function paragraph(text='',id=uid()){
  return {type:'paragraph',id,text,role:'auto',align:'auto',indent:'auto',before:'auto',after:'auto'};
}
export function table(rows=3,columns=3,caption='',idFactory=uid){
  if(!Number.isInteger(rows)||rows<1||rows>100||!Number.isInteger(columns)||columns<1||columns>10)throw Error('表格支持 1–100 行、1–10 列。');
  return {type:'table',id:idFactory(),caption,header:true,rows:Array.from({length:rows},()=>({id:idFactory(),cells:Array.from({length:columns},()=>({id:idFactory(),text:''}))}))};
}
export function contentFromText(text,idFactory=uid){
  return validateContent({version:1,blocks:text.replace(/\r\n?/g,'\n').split('\n').map(line=>paragraph(line,idFactory()))});
}
export function contentText(value){
  return value.blocks.map(block=>block.type==='paragraph'?block.text:[...(block.caption?[block.caption]:[]),...block.rows.map(row=>row.cells.map(cell=>cell.text).join('\t'))].join('\n')).join('\n');
}
export function hasContent(value){return Boolean(value?.blocks.some(block=>block.type==='table'||block.text.trim()));}
export function contentBodyForEngine(value){
  if(!value)return null;const text=value.blocks.filter(block=>block.type==='paragraph').map(block=>block.text).join('\n');return text.trim()?text:'_table_';
}
export function validateContent(value,{ids=new Set(),postscript=false}={}){
  if(!value||value.version!==1||!Array.isArray(value.blocks)||!value.blocks.length||value.blocks.length>1000)throw Error('正文结构无效或超过 1000 段，原稿未改变。');
  const id=value=>{if(typeof value!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(value)||ids.has(value))throw Error('正文定位信息无效，原稿未改变。');ids.add(value);return value;};
  const text=(value,max)=>{if(typeof value!=='string'||value.length>max)throw Error('正文或单元格内容过长，原稿未改变。');return value.replace(/\r\n?/g,'\n');};
  const checked={version:1,blocks:value.blocks.map(block=>{
    if(!block||typeof block!=='object')throw Error('正文结构无法读取，原稿未改变。');
    if(block.type==='paragraph'){
      const result={type:'paragraph',id:id(block.id),text:text(block.text,100000),role:block.role??'auto',align:block.align??'auto',indent:block.indent??'auto',before:block.before??'auto',after:block.after??'auto'};
      if(result.text.includes('\n')||!contentRoles.includes(result.role)||!alignments.includes(result.align)||!indents.includes(result.indent)||!spaces.includes(result.before)||!spaces.includes(result.after))throw Error('段落设置无效，原稿未改变。');
      return result;
    }
    if(block.type!=='table'||!Array.isArray(block.rows)||!block.rows.length||block.rows.length>100||typeof block.header!=='boolean')throw Error('表格结构无效，原稿未改变。');
    const result={type:'table',id:id(block.id),caption:text(block.caption??'',150),header:block.header,rows:[]};
    const columns=block.rows[0]?.cells?.length;
    if(!Number.isInteger(columns)||columns<1||columns>10)throw Error('表格最多支持 10 列，原稿未改变。');
    result.rows=block.rows.map(row=>{
      if(!Array.isArray(row?.cells)||row.cells.length!==columns)throw Error('表格各行列数应一致，原稿未改变。');
      return {id:id(row.id),cells:row.cells.map(cell=>({id:id(cell?.id),text:text(cell?.text,10000)}))};
    });
    return result;
  })};
  const annexes=validateAnnexes(value.annexes,checked.blocks);if(annexes.length)checked.annexes=annexes;
  if(contentText(checked).length>(postscript?4000:100000))throw Error(postscript?'落款后内容及表格文字合计最多 4000 字符，原稿未改变。':'正文及表格文字合计最多 100000 字符，原稿未改变。');
  if(value.postscript!==undefined){if(postscript)throw Error('落款后内容结构无效，原稿未改变。');checked.postscript=validateContent(value.postscript,{ids,postscript:true});}
  return checked;
}
// Offer only explicit tab-separated cells; prose and following unequal-width
// lines are not inferred into the table. The caller asks for confirmation.
export function tabularContentAt(content,index){
  const first=content.blocks[index];if(first?.type!=='paragraph'||!first.text.includes('\t'))return null;
  const columns=first.text.split('\t').length;if(columns<2||columns>10)return null;
  const rows=[];
  for(let i=index;i<content.blocks.length;i++){
    const block=content.blocks[i];if(block.type!=='paragraph'||!block.text.includes('\t'))break;
    const cells=block.text.split('\t');if(cells.length!==columns)break;rows.push(cells);
  }
  return rows.length<=100?{start:index,count:rows.length,rows}:null;
}
export function paragraphStyle(block){return {role:block.role,align:block.align,indent:block.indent,before:block.before,after:block.after};}
function paragraphIdentity(block,content,field='body'){
  const index=content.blocks.findIndex(item=>item.id===block.id),matches=content.blocks.filter(item=>item.type==='paragraph'&&item.text===block.text),count=matches.length;
  const neighbour=item=>!item?null:item.type==='paragraph'?item.text:'\ufff0table:'+item.id;
  return {field,text:block.text,occurrence:matches.findIndex(item=>item.id===block.id)+1,count,...(count>1?{before:neighbour(content.blocks[index-1]),after:neighbour(content.blocks[index+1])}:{})};
}
function sourceStyle(block,path,section){const style=block.type==='paragraph'?paragraphStyle(block):{header:path.caption?block.header:block.header&&block.rows[0].id===path.row,columns:block.rows[0].cells.length};const annex=section?annexAt(section,block.id):null;return annex?{...style,annex:{...annex,part:block.id===annex.start?'label':block.id===annex.title?'title':'content'}}:style;}
function source(block,path,text,content,field='body'){return {...(block.type==='paragraph'?paragraphIdentity(block,content,field):{field,text,occurrence:1,count:1}),content:{block:block.id,...path},contentStyle:sourceStyle(block,path,content)};}
export function paragraphContentSources(value){return value?[...value.blocks.filter(block=>block.type==='paragraph').map(block=>source(block,{},block.text,value)),...(value.postscript?.blocks||[]).filter(block=>block.type==='paragraph').map(block=>source(block,{},block.text,value.postscript,'postscript'))]:[];}
export function resolveContentSource(anchor,value){
  if(!value||!anchor?.content)return null;
  if(anchor.field==='postscript')value=value.postscript;
  if(!value)return null;
  const index=value.blocks.findIndex(block=>block.id===anchor.content.block),block=value.blocks[index];if(!block)return null;
  let text,start=0,tableRow,tableColumn;
  if(block.type==='paragraph'){
    text=block.text;const identity=paragraphIdentity(block,value,anchor.field);
    if(identity.count!==anchor.count||identity.occurrence!==anchor.occurrence||identity.before!==anchor.before||identity.after!==anchor.after)return null;
  }
  else if(anchor.content.caption)text=block.caption;
  else{
    const row=block.rows.find(row=>row.id===anchor.content.row),cell=row?.cells.find(cell=>cell.id===anchor.content.cell);if(!cell)return null;
    tableRow=block.rows.indexOf(row)+1;tableColumn=row.cells.indexOf(cell)+1;
    const lines=cell.text.split('\n'),part=anchor.content.line;
    if(!Number.isInteger(part)||part<0||part>=lines.length)return null;
    text=lines[part];start=lines.slice(0,part).reduce((n,line)=>n+line.length+1,0);
  }
  const style=sourceStyle(block,anchor.content,value);
  if(text!==anchor.text||JSON.stringify(style)!==JSON.stringify(anchor.contentStyle))return null;
  return {text,line:index+1,start,end:start+text.length,content:anchor.content,...(tableRow?{row:tableRow,column:tableColumn}:{})};
}
function formatParagraph(base,block){
  let p={...(base||{role:'body',text:block.text,font:'仿宋',size:16,line:10.21,align:'both',indent:11.29,before:0,after:0}),id:'writer-content-'+block.id};
  if(!base||base.text==='_table_'&&!block.text.trim())p.text=block.text;
  if(block.role!=='auto'){
    p={...p,text:block.text,role:block.role,font:'仿宋',size:16,line:10.21,align:'both',indent:11.29,keepNext:false,prefix:'',prefixFont:'',autoNumbered:false,outlineLevel:0,leftIndent:0,rightIndent:0,hanging:0};
    if(block.role==='title')Object.assign(p,{font:'方正小标宋简体',size:22,align:'center',indent:0,keepNext:true});
    else if(block.role==='heading')Object.assign(p,{font:'黑体',keepNext:true});
    else if(block.role==='heading2')Object.assign(p,{font:'楷体',keepNext:true});
    else if(['heading3','heading4'].includes(block.role))p.keepNext=true;
    else if(['signature','date'].includes(block.role))Object.assign(p,{align:'right',indent:0});
  }
  if(block.align!=='auto')p.align=block.align;
  if(block.indent!=='auto')p.indent=block.indent==='two'?11.29:0;
  for(const side of ['before','after'])if(block[side]!=='auto')p[side]={none:0,half:5.105,one:10.21}[block[side]];
  return p;
}
export function applyBodyContent(model,value){
  if(!value)return model;
  const content=validateContent(value),original=model.blocks.filter(block=>bodyRoles.has(block.paragraph?.role)).map(block=>block.paragraph),sources={};
  const compile=(section,original,field)=>{let at=0;const compiled=section.blocks.map(block=>{
    if(block.type==='paragraph'){
      const base=field==='postscript'?{...(original[0]||{role:'note',font:'仿宋',size:16,line:10.21,align:'left',indent:11.29,before:0,after:0}),text:block.text}:original[at++];
      const p=formatParagraph(base,block);sources[p.id]=source(block,{},block.text,section,field);return {paragraph:p};
    }
    const widths=tableColumnWidths(block,model.page.width-model.page.left-model.page.right);
    const result={widths,borders:true,borderStyle:'grid',rows:block.rows.map((row,index)=>({header:index===0&&block.header,cells:row.cells.map(cell=>({span:1,paragraphs:cell.text.split('\n').map((text,line)=>{
      const p={id:'writer-cell-'+cell.id+'-'+line,text,role:'body',font:'仿宋',size:14,line:8,indent:0,align:'left',before:0,after:0};sources[p.id]=source(block,{row:row.id,cell:cell.id,line},text,section,field);return p;
    })}))}))};
    for(const [index,row] of result.rows.entries())if(row.header||index===result.rows.length-2&&isSummaryRow(block.rows.at(-1)))for(const cell of row.cells)for(const p of cell.paragraphs)p.keepNext=true;
    if(block.caption){result.caption={id:'writer-caption-'+block.id,text:block.caption,role:'caption',font:'黑体',size:14,line:8,align:'center',indent:0,before:0,after:2,keepNext:true};sources[result.caption.id]=source(block,{caption:true},block.caption,section,field);}
    return {table:result};
  });
  for(let i=0;i<compiled.length;i++)if(compiled[i].table){
    let labels=0;for(let j=i-1;j>=0&&labels<2;j--){const p=compiled[j].paragraph;if(!p||['signature','date'].includes(p.role))break;const text=p.text.trim();if(!text){p.keepNext=true;continue;}if(text.length>60||/[。！？!?]/.test(text))break;p.keepNext=true;labels++;}
  }
  return compileAnnexes(section,compiled,model.page.width-model.page.left-model.page.right);};
  const allBody=compile(content,original,'body'),annexIndex=allBody.findIndex(b=>b.paragraph?.role==='attachment-label'),body=annexIndex<0?allBody:allBody.slice(0,annexIndex),bodyAnnex=annexIndex<0?[]:allBody.slice(annexIndex);
  const blocks=[];let inserted=false;
  for(const block of model.blocks){if(bodyRoles.has(block.paragraph?.role)){if(!inserted){blocks.push(...body);inserted=true;}}else blocks.push(block);}
  if(!inserted){let index=blocks.findIndex(block=>['attachment-description','signature','date','note','imprint'].includes(block.paragraph?.role));if(index<0)index=blocks.length;blocks.splice(index,0,...body);}
  if(content.postscript){
    const isNote=block=>block.paragraph?.role==='note'&&/^writer-note-\d+$/.test(block.paragraph.id);
    const original=blocks.filter(isNote).map(block=>block.paragraph),notes=compile(content.postscript,original,'postscript');
    const first=blocks.findIndex(isNote);
    const kept=blocks.filter(block=>!isNote(block));
    let index=first<0?kept.findIndex(block=>block.paragraph?.role==='imprint'):first;if(index<0)index=kept.length;
    kept.splice(index,0,...notes);blocks.splice(0,blocks.length,...kept);
  }
  if(bodyAnnex.length){let at=blocks.findIndex(b=>b.paragraph?.role==='attachment-label'||b.paragraph?.role==='imprint');if(at<0)at=blocks.length;blocks.splice(at,0,...bodyAnnex);}
  return {...model,blocks,_writerSources:sources};
}
export function splitContentParagraph(value,id,position,idFactory=uid){
  const next=structuredClone(value),index=next.blocks.findIndex(block=>block.id===id),block=next.blocks[index];
  if(block?.type!=='paragraph'||!Number.isInteger(position)||position<0||position>block.text.length)throw Error('请先选中需要拆分的段落。');
  if(position>0&&position<block.text.length&&/[\uD800-\uDBFF]/.test(block.text[position-1])&&/[\uDC00-\uDFFF]/.test(block.text[position]))position++;
  next.blocks.splice(index,1,{...block,text:block.text.slice(0,position)},{...block,id:idFactory(),text:block.text.slice(position)});return validateContent(next);
}
export function mergeContentParagraph(value,id){
  const next=structuredClone(value),index=next.blocks.findIndex(block=>block.id===id),block=next.blocks[index],previous=next.blocks[index-1];
  if(block?.type!=='paragraph'||previous?.type!=='paragraph')throw Error('只能与紧邻的上一段文字合并，表格不会被合并或删除。');
  const separator=/[A-Za-z0-9]$/.test(previous.text)&&/^[A-Za-z0-9]/.test(block.text)?' ':'';
  previous.text+=separator+block.text;next.blocks.splice(index,1);return validateContent(next);
}
export function moveContentBlock(value,id,direction){
  const next=structuredClone(value),index=next.blocks.findIndex(block=>block.id===id),target=index+direction;
  if(index<0||![-1,1].includes(direction)||target<0||target>=next.blocks.length)throw Error('已经到达正文边界。');
  [next.blocks[index],next.blocks[target]]=[next.blocks[target],next.blocks[index]];return validateContent(next);
}
