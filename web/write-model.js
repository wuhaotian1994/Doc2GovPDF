export const DRAFT_KEY = 'gongwen-writer-v1';
export const materialNames = ['sourceMaterial','pendingMaterial'];
export const names = ['title', 'recipient', 'agency', 'reference', 'body', 'signature', 'date', 'attachments', 'copyTo', 'postscript', ...materialNames];
export const DRAFT_MAX_BYTES = 2*1024*1024;
const limits = {title:180, recipient:300, agency:120, reference:100, body:100000, signature:120, date:10, attachments:4000, copyTo:1000,postscript:4000,sourceMaterial:100000,pendingMaterial:100000};
export function blank() {
  return {title:'', recipient:'', agency:'', reference:'', body:'', signature:'', date:'', attachments:'', copyTo:'', postscript:'',sourceMaterial:'',pendingMaterial:'',letterhead:false};
}
export function validateDraft(value) {
  if (!value || value.type !== 'gongwen-form' || ![1,2,3].includes(value.version) || !value.fields || typeof value.fields !== 'object') throw Error('这不是支持的填写草稿文件，请选择本工具下载的草稿。');
  const fields = blank();
  for (const name of names) {
    const optional=value.version===1&&materialNames.includes(name)||value.version<3&&name==='postscript';
    const v = value.fields[name]===undefined&&optional?'':value.fields[name];
    if (typeof v !== 'string' || v.length > limits[name]) throw Error('草稿中的“'+name+'”无效或过长，原内容未被替换。');
    fields[name] = materialNames.includes(name)?v.replace(/\r\n?/g,'\n'):v;
  }
  if (typeof value.fields.letterhead !== 'boolean') throw Error('草稿的红头设置无效，原内容未被替换。');
  if (fields.date && !validDate(fields.date)) throw Error('草稿日期无效，原内容未被替换。');
  fields.letterhead = value.fields.letterhead;
  return {type:'gongwen-form', version:fields.postscript?3:fields.sourceMaterial||fields.pendingMaterial?2:value.version, fields, step:Number.isInteger(value.step) && value.step >= 0 && value.step <= 2 ? value.step : 0,
    ...(typeof value.id==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(value.id)?{id:value.id}:{})};
}
export function validDate(value) {
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value+'T12:00:00Z');
  return !Number.isNaN(+date) && date.toISOString().slice(0,10) === value && value >= '1900-01-01';
}
export function draft(fields, step, id) {
  return {type:'gongwen-form', version:fields.postscript?3:fields.sourceMaterial||fields.pendingMaterial?2:1, updatedAt:new Date().toISOString(), fields:{...blank(),...fields}, step,...(id?{id}:{})};
}
export function fieldsForEngine(fields, preview = false) {
  const date = fields.date ? fields.date.split('-').map(Number) : [];
  const hasLetterhead=fields.letterhead&&Boolean(fields.agency.trim());
  return {
    kind:'plain', title:fields.title.trim() || (preview?'待填写标题':''),
    body:fields.body || (preview?'正文尚未填写':''),
    // Build a single placeholder; applySignature creates the separately authored
    // lines after the engine's single-office input validation.
    agency:hasLetterhead ? fields.agency.trim() : (fields.signature.split(/\r?\n/).map(line=>line.trim()).find(Boolean)||''),
    recipient:fields.recipient.trim(), reference:fields.reference.trim(),
    date:date.length ? `${date[0]}年${date[1]}月${date[2]}日` : '',
    letterhead:hasLetterhead,
    copyTo:fields.copyTo.trim(), attachments:fields.attachments.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)
  };
}
export function applySignature(model, fields) {
  // The generic writer does not collect an issuing office or printing date.
  // Never infer them from the independently authored header/signature/date.
  model.blocks = model.blocks.filter(block => block.paragraph?.role !== 'imprint' || block.paragraph.text.startsWith('抄送：'));
  const signatures=fields.signature.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  let signatureSeen=false;
  model.blocks=model.blocks.flatMap(block=>{
    if(block.paragraph?.role!=='signature')return [block];
    if(signatureSeen)return [];signatureSeen=true;
    return signatures.map((text,index)=>({...block,paragraph:{...block.paragraph,text,...(index?{id:block.paragraph.id+'-signature-'+index,before:0}:{})}}));
  });
  if (fields.letterhead) {
    for (const block of model.blocks) {
      // PDF suppresses before-spacing on the first paragraph; match Word to it.
      if (block.paragraph?.role === 'agency') block.paragraph.before = 0;
    }
  }
  // Authored notes follow the signing/date, before any copy-to imprint. Reuse
  // the existing note role; never infer their text or merge them into a name.
  model.blocks=model.blocks.filter(block=>!(block.paragraph?.role==='note'&&/^writer-note-\d+$/.test(block.paragraph.id)));
  if(fields.postscript?.trim()){
    const notes=fields.postscript.split(/\r?\n/).map((text,index)=>({paragraph:{id:'writer-note-'+index,text,role:'note',font:'仿宋',size:16,line:10.21,align:'left',indent:11.29,before:0,after:0}}));
    const imprint=model.blocks.findIndex(block=>block.paragraph?.role==='imprint');
    model.blocks.splice(imprint<0?model.blocks.length:imprint,0,...notes);
  }
  return model;
}
export function textContent(fields) {
  const f = fieldsForEngine(fields);
  return [f.letterhead ? f.agency+'文件' : '', f.reference, f.title,
    f.recipient ? f.recipient.replace(/[：:]+$/, '')+'：' : '', f.body,
    ...f.attachments.map((s,i)=>`附件${f.attachments.length>1?i+1:''}：${s}`),
    fields.signature.trim(), f.date, fields.postscript||'', f.copyTo?'抄送：'+f.copyTo:''].filter(Boolean).join('\n\n');
}
export function safeName(title) {
  return (title.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').slice(0,60) || '未命名文档').replace(/[. ]+$/,'');
}
