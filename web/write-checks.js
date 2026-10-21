// Review identity belongs to the source and the decision, never to the engine's
// document-digest ID. Export still uses the latest engine IDs.
const bodyRoles = new Set(['body','article','heading','heading2','heading3','heading4']);
const documentFields=fields=>Object.fromEntries(Object.entries(fields).filter(([key])=>!['sourceMaterial','pendingMaterial'].includes(key)));
export const fieldLabels = {title:'标题',body:'正文',recipient:'收文对象',agency:'发文单位',reference:'发文字号',signature:'落款',date:'日期',attachments:'附件名称',copyTo:'抄送单位',postscript:'落款后附注'};

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
export function resolveSource(source, fields) {
  if(!source || typeof fields[source.field]!=='string')return null;
  const lines=sourceLines(fields[source.field]),matches=lines.filter(line=>line.text===source.text);
  // Changed duplicate counts are ambiguous: recheck instead of transferring a
  // decision from one identical paragraph to another.
  const line=matches.length===source.count?matches[source.occurrence-1]:null;
  if(!line || source.count>1&&((lines[line.line-2]?.text ?? null)!==source.before || (lines[line.line]?.text ?? null)!==source.after))return null;
  return line;
}
function paragraphSources(model,fields) {
  const result=new Map(),body=sourceLines(fields.body),attachments=sourceLines(fields.attachments).filter(line=>line.text.trim());
  const signatures=sourceLines(fields.signature).filter(line=>line.text.trim());
  const notes=sourceLines(fields.postscript||'');
  let bodyIndex=0,attachmentIndex=0,signatureIndex=0,noteIndex=0;
  for(const block of model.blocks || []) {
    const p=block.paragraph;if(!p)continue;
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
  return /^(word\.|date\.|reference\.|punctuation\.)/.test(rule) ||
    ['number.unit-space','number.range-unit','number.bare-decimal','number.short-year','number.fullwidth','number.mixed-place',
      'style.word','style.self-reference','style.modal-stack','style.latin','style.tool-marker','style.nominalization'].includes(rule);
}
export function reviewItems(model,inspection,fields,documentId) {
  const sources=paragraphSources(model,fields);
  return (inspection?.issues || []).map(issue=>{
    const source=sources.get(issue.paragraphId) || null;
    const p=model.blocks?.find(block=>block.paragraph?.id===issue.paragraphId)?.paragraph;
    const {id,...format}=p || {};
    const scope=source&&localRule(issue.rule)?'paragraph':'document';
    const dependencies=scope==='paragraph'?source:documentFields(fields);
    const key=JSON.stringify([documentId,inspection.version,issue.rule,issue.severity,issue.message,issue.original,issue.replacement || '',issue.basis,dependencies,format,scope==='document'?model.page:null]);
    return {issue,source,scope,key,documentId,fields:scope==='document'?JSON.stringify(documentFields(fields)):null};
  });
}
export class ReviewDecisions {
  constructor(){this.receipts=new Map();}
  set(item,checked){if(checked)this.receipts.set(item.key,item);else this.receipts.delete(item.key);}
  has(item){return this.receipts.has(item.key);}
  retain(fields,documentId) {
    for(const [key,item] of this.receipts) {
      if(item.documentId!==documentId || (item.scope==='paragraph'?!resolveSource(item.source,fields):item.fields!==JSON.stringify(documentFields(fields))))this.receipts.delete(key);
    }
  }
  reconcile(items){
    const present=new Set(items.map(item=>item.key));
    for(const key of this.receipts.keys())if(!present.has(key))this.receipts.delete(key);
    return new Set(items.filter(item=>this.has(item)).map(item=>item.issue.id));
  }
}
