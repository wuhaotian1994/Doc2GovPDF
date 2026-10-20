export const DRAFT_KEY = 'gongwen-writer-v1';
export const names = ['title', 'recipient', 'agency', 'reference', 'body', 'signature', 'date', 'attachments', 'copyTo'];
const limits = {title:180, recipient:300, agency:120, reference:100, body:100000, signature:120, date:10, attachments:4000, copyTo:1000};
export function blank() {
  return {title:'', recipient:'', agency:'', reference:'', body:'', signature:'', date:'', attachments:'', copyTo:'', letterhead:false};
}
export function validateDraft(value) {
  if (!value || value.type !== 'gongwen-form' || value.version !== 1 || !value.fields || typeof value.fields !== 'object') throw Error('这不是支持的填写草稿文件，请选择本工具下载的草稿。');
  const fields = blank();
  for (const name of names) {
    const v = value.fields[name];
    if (typeof v !== 'string' || v.length > limits[name]) throw Error('草稿中的“'+name+'”无效或过长，原内容未被替换。');
    fields[name] = v;
  }
  if (typeof value.fields.letterhead !== 'boolean') throw Error('草稿的红头设置无效，原内容未被替换。');
  if (fields.date && !validDate(fields.date)) throw Error('草稿日期无效，原内容未被替换。');
  fields.letterhead = value.fields.letterhead;
  return {type:'gongwen-form', version:1, fields, step:Number.isInteger(value.step) && value.step >= 0 && value.step <= 2 ? value.step : 0,
    ...(typeof value.id==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(value.id)?{id:value.id}:{})};
}
export function validDate(value) {
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value+'T12:00:00Z');
  return !Number.isNaN(+date) && date.toISOString().slice(0,10) === value && value >= '1900-01-01';
}
export function draft(fields, step, id) {
  return {type:'gongwen-form', version:1, updatedAt:new Date().toISOString(), fields:{...fields}, step,...(id?{id}:{})};
}
export function fieldsForEngine(fields, preview = false) {
  const date = fields.date ? fields.date.split('-').map(Number) : [];
  return {
    kind:'plain', title:fields.title.trim() || (preview?'待填写标题':''),
    body:fields.body || (preview?'正文尚未填写':''),
    agency:fields.letterhead ? fields.agency.trim() : fields.signature.trim(),
    recipient:fields.recipient.trim(), reference:fields.reference.trim(),
    date:date.length ? `${date[0]}年${date[1]}月${date[2]}日` : '',
    letterhead:fields.letterhead && Boolean(fields.agency.trim()),
    copyTo:fields.copyTo.trim(), attachments:fields.attachments.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)
  };
}
export function applySignature(model, fields) {
  // The generic writer does not collect an issuing office or printing date.
  // Never infer them from the independently authored header/signature/date.
  model.blocks = model.blocks.filter(block => block.paragraph?.role !== 'imprint' || block.paragraph.text.startsWith('抄送：'));
  if (fields.letterhead) {
    model.blocks = model.blocks.filter(block => block.paragraph?.role !== 'signature' || fields.signature.trim());
    for (const block of model.blocks) {
      if (block.paragraph?.role === 'signature') block.paragraph.text = fields.signature.trim();
      // PDF suppresses before-spacing on the first paragraph; match Word to it.
      if (block.paragraph?.role === 'agency') block.paragraph.before = 0;
    }
  }
  return model;
}
export function textContent(fields) {
  const f = fieldsForEngine(fields);
  return [f.letterhead ? f.agency+'文件' : '', f.reference, f.title,
    f.recipient ? f.recipient.replace(/[：:]+$/, '')+'：' : '', f.body,
    ...f.attachments.map((s,i)=>`附件${f.attachments.length>1?i+1:''}：${s}`),
    fields.signature.trim(), f.date, f.copyTo?'抄送：'+f.copyTo:''].filter(Boolean).join('\n\n');
}
export function safeName(title) {
  return (title.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').slice(0,60) || '未命名文档').replace(/[. ]+$/,'');
}
