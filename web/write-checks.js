import {assemblyInspection} from './write-assembly.js';
import {blankTableState,validBlankState,groupBlankTables} from './write-table-blanks.js';
import {hasAnnexes} from './write-annexes.js';
// Review identity belongs to the source and the decision, never to the engine's
// document-digest ID. Export still uses the latest engine IDs.
import {resolveContentSource,paragraphContentSources} from './write-content.js';
const bodyRoles = new Set(['body','article','heading','heading2','heading3','heading4']);
const documentFields=(fields,content)=>({...Object.fromEntries(Object.entries(fields).filter(([key])=>!['sourceMaterial','pendingMaterial'].includes(key))),...(hasAnnexes(content)||[...(content?.blocks||[]),...(content?.postscript?.blocks||[])].some(block=>block.type==='table'||['role','align','indent','before','after'].some(key=>block[key]!=='auto'))?{bodyContent:content}:{})});
export const fieldLabels = {title:'标题',body:'正文',recipient:'收文对象',agency:'发文单位',reference:'发文字号',signature:'落款',date:'日期',attachments:'附件名称',copyTo:'抄送单位',postscript:'落款后内容'};

export function sourceLines(value) {
  let start=0;
  return value.split(/\r?\n/).map((text,index)=>{
    const line={text,start,end:start+text.length,line:index+1};
    start+=text.length+(value.slice(line.end,line.end+2)==='\r\n'?2:1);
    return line;
  });
}
function anchor(field, line, fields) {
  const lines=sourceLines(fields[field]);
  const count=lines.filter(p=>p.text===line.text).length;
  return {field,text:line.text,occurrence:lines.slice(0,line.line).filter(p=>p.text===line.text).length,count,
    ...(count>1?{before:lines[line.line-2]?.text ?? null,after:lines[line.line]?.text ?? null}:{})};
}
export function resolveSource(source, fields, content=null) {
  if(!source || typeof fields[source.field]!=='string')return null;
  if(source.content)return resolveContentSource(source,content);
  const lines=sourceLines(fields[source.field]),matches=lines.filter(line=>line.text===source.text);
  // Changed duplicate counts are ambiguous: recheck instead of transferring a
  // decision from one identical paragraph to another.
  const line=matches.length===source.count?matches[source.occurrence-1]:null;
  if(!line || source.count>1&&((lines[line.line-2]?.text ?? null)!==source.before || (lines[line.line]?.text ?? null)!==source.after))return null;
  return line;
}
function paragraphSources(model,fields) {
  const result=new Map(Object.entries(model._writerSources||{})),body=sourceLines(fields.body),attachments=sourceLines(fields.attachments).filter(line=>line.text.trim());
  const signatures=sourceLines(fields.signature).filter(line=>line.text.trim());
  const notes=sourceLines(fields.postscript||'');
  let bodyIndex=0,attachmentIndex=0,signatureIndex=0,noteIndex=0;
  for(const block of model.blocks || []) {
    const p=block.paragraph;if(!p)continue;
    if(result.has(p.id))continue;
    let field=p.role,line;
    if(bodyRoles.has(p.role)){field='body';line=body[bodyIndex++];}
    else if(p.role==='attachment-description'){field='attachments';line=attachments[attachmentIndex++];}
    else if(p.role==='signature')line=signatures[signatureIndex++];
    else if(p.role==='note'){field='postscript';line=notes[noteIndex++];}
    else if(p.role==='imprint'&&p.text.startsWith('抄送：'))field='copyTo';
    if(!fieldLabels[field])continue;
    line ||= {text:fields[field],line:1};
    if(line)result.set(p.id,anchor(field,line,fields));
  }
  return result;
}
function localRule(rule) {
  // Unknown and cross-paragraph rules conservatively depend on the whole draft.
  return /^(word\.|date\.|reference\.|punctuation\.|writer\.material\.)/.test(rule) ||
    ['number.unit-space','number.range-unit','number.bare-decimal','number.short-year','number.fullwidth','number.mixed-place',
      'style.word','style.self-reference','style.modal-stack','style.latin','style.tool-marker','style.nominalization'].includes(rule);
}
export function reviewItems(model,inspection,fields,documentId,content=null) {
  inspection=assemblyInspection(model,inspection,fields,content);
  const sources=paragraphSources(model,fields);
  const entries=(inspection?.issues || []).map(issue=>{
    const source=sources.get(issue.paragraphId) || null;
    const p=model.blocks?.flatMap(block=>block.paragraph?[block.paragraph]:[...(block.table?.caption?[block.table.caption]:[]),...(block.table?.rows||[]).flatMap(row=>row.cells.flatMap(cell=>cell.paragraphs))]).find(p=>p.id===issue.paragraphId);
    const {id,...format}=p || {};
    const scope=source&&localRule(issue.rule)?'paragraph':'document';
    const {content:sourcePath,contentStyle,...identity}=source||{};
    const dependencies=scope==='paragraph'?(sourcePath&&!sourcePath.cell&&!sourcePath.caption?identity:source):documentFields(fields,content);
    const key=JSON.stringify([documentId,inspection.version,issue.rule,issue.severity,issue.message,issue.original,issue.replacement || '',issue.basis,dependencies,format,scope==='document'?model.page:null,scope]);
    return {issue,source,scope,key,documentId,fields:scope==='document'?JSON.stringify(documentFields(fields,content)):null};
  });
  return groupBlankTables(entries,model,inspection,content,documentId);
}
function receiptFromKey(key,documentId,anchor){
  if(typeof key!=='string')return null;
  let parts;try{parts=JSON.parse(key);}catch{return null;}
  if(!Array.isArray(parts)||parts.length!==12||parts[0]!==documentId||!(parts[3]==='review'||parts[3]==='suggestion'&&parts[2]==='writer.table-blank-range'&&parts[11]==='table-blanks')||typeof parts[1]!=='string'||typeof parts[2]!=='string')return null;
  const scope=parts[11];let source=parts[8];
  if(!source||Array.isArray(source)||typeof source!=='object')return null;
  if(scope==='table-blanks'){if(parts[2]!=='writer.table-blank-range'||parts[3]!=='suggestion'||anchor||!validBlankState(source))return null;return {key,documentId,scope,blankState:source,source:null,issue:{rule:parts[2],severity:'suggestion'}};}
  if(scope==='paragraph'){
    if(!Object.hasOwn(fieldLabels,source.field)||typeof source.text!=='string'||!Number.isInteger(source.count)||!Number.isInteger(source.occurrence)||source.occurrence<1||source.occurrence>source.count)return null;
  }else if(scope!=='document')return null;
  if(anchor){
    const {content,contentStyle,...identity}=anchor;
    if(scope!=='paragraph'||!['body','postscript'].includes(source.field)||!content||typeof content.block!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(content.block)||content.cell||content.caption||!contentStyle||typeof contentStyle!=='object'||Array.isArray(contentStyle)||JSON.stringify(identity)!==JSON.stringify(source))return null;
    source={...identity,content:{block:content.block},contentStyle:structuredClone(contentStyle)};
  }
  return {key,documentId,scope,source:scope==='paragraph'?source:null,fields:scope==='document'?JSON.stringify(source):null,issue:{rule:parts[2],severity:'review'}};
}
// Optional draft metadata is never allowed to make authored text unreadable.
// Exact keys must match a newly generated inspection before export uses them.
export function validateReviewState(value,documentId){
  if(!documentId||!value||value.version!==1||value.documentId!==documentId||!Array.isArray(value.keys)||!value.keys.every(key=>receiptFromKey(key,documentId)))return undefined;
  const keys=[...new Set(value.keys)],anchors=[];
  if(value.anchors!==undefined){
    if(!Array.isArray(value.anchors))return undefined;const used=new Set();
    for(const item of value.anchors){if(!item?.source||used.has(item.key)||!keys.includes(item.key))return undefined;const receipt=receiptFromKey(item.key,documentId,item.source);if(!receipt)return undefined;used.add(item.key);anchors.push({key:item.key,source:receipt.source});}
  }
  const blankRechecks=Array.isArray(value.blankRechecks)&&value.blankRechecks.length<=1000?value.blankRechecks.filter(id=>typeof id==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(id)):[];
  return {version:1,documentId,keys,...(anchors.length?{anchors}:{}),...(blankRechecks.length?{blankRechecks}: {})};
}
export class ReviewDecisions {
  forgetField(field,documentId,rule){for(const [key,item] of this.receipts)if(item.documentId===documentId&&item.source?.field===field&&item.issue.rule===rule)this.receipts.delete(key);}
  constructor(){this.receipts=new Map();this.blankRechecks=new Set();}
  snapshot(documentId){const items=[...this.receipts].filter(([,item])=>item.documentId===documentId&&(item.issue.severity==='review'||item.scope==='table-blanks')),keys=items.map(([key])=>key),anchors=items.filter(([,item])=>item.scope==='paragraph'&&item.source?.content&&!item.source.content.cell&&!item.source.content.caption).map(([key,item])=>({key,source:item.source}));return keys.length||this.blankRechecks.size?{version:1,documentId,keys,...(anchors.length?{anchors}:{}),...(this.blankRechecks.size?{blankRechecks:[...this.blankRechecks]}:{})}:undefined;}
  bindContent(fields,documentId,content){
    const sources=paragraphContentSources(content);
    for(const [key,item] of this.receipts){
      if(item.documentId!==documentId||item.scope!=='paragraph'||!['body','postscript'].includes(item.source?.field))continue;
      if((item.source.field==='postscript'?content?.postscript:content)&&!item.source.content){const match=sources.find(source=>{const {content,contentStyle,...identity}=source;return JSON.stringify(identity)===JSON.stringify(item.source);});if(match)this.receipts.set(key,{...item,source:match});}
      else if(!(item.source.field==='postscript'?content?.postscript:content)&&item.source.content&&!item.source.content.cell&&!item.source.content.caption){const {content,contentStyle,...identity}=item.source;if(resolveSource(identity,fields))this.receipts.set(key,{...item,source:identity});}
    }
  }
  restore(value,fields,documentId,content=null){
    this.receipts.clear();this.blankRechecks.clear();
    const state=validateReviewState(value,documentId),anchors=new Map((state?.anchors||[]).map(item=>[item.key,item.source]));
    for(const id of state?.blankRechecks||[])this.blankRechecks.add(id);
    for(const key of state?.keys||[])this.receipts.set(key,receiptFromKey(key,documentId,anchors.get(key)));
    this.bindContent(fields,documentId,content);
    this.retain(fields,documentId,content);
  }
  set(item,checked){if(item.blankState)this.blankRechecks.delete(item.blankState.table.id);if(checked)this.receipts.set(item.key,item);else this.receipts.delete(item.key);}
  has(item){return this.receipts.has(item.key);}
  retain(fields,documentId,content=null) {
    for(const [key,item] of this.receipts) {
      if(item.scope==='table-blanks'){const id=item.blankState.table.id;if(item.documentId!==documentId||JSON.stringify(blankTableState(content,id))!==JSON.stringify(item.blankState)){this.receipts.delete(key);if(item.documentId===documentId&&blankTableState(content,id))this.blankRechecks.add(id);}continue;}
      if(item.documentId!==documentId || (item.scope==='paragraph'?!resolveSource(item.source,fields,content):item.fields!==JSON.stringify(documentFields(fields,content))))this.receipts.delete(key);
    }
  }
  reconcile(items){
    const present=new Set(items.map(item=>item.key));
    for(const [key,old] of this.receipts)if(!present.has(key)){if(old.scope==='table-blanks'&&items.some(item=>item.blankState?.table.id===old.blankState.table.id))this.blankRechecks.add(old.blankState.table.id);this.receipts.delete(key);}
    for(const item of items)if(this.receipts.has(item.key))this.receipts.set(item.key,item);
    return new Set(items.filter(item=>this.has(item)&&item.issue.severity==='review'&&!item.issue.rule.startsWith('writer.material.')).map(item=>item.issue.id));
  }
}
