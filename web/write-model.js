import {hasAnnexes} from './write-annexes.js';
import {validateReviewState} from './write-checks.js';
import {validateContent,contentText,contentBodyForEngine} from './write-content.js';
export const DRAFT_KEY = 'gongwen-writer-v1';
export const materialNames = ['sourceMaterial','pendingMaterial'];
export const metadataNames = ['signer','issuer','issueDate'];
export const names = ['title', 'recipient', 'agency', 'reference', 'body', 'signature', 'date', 'attachments', 'copyTo', 'postscript', ...materialNames, ...metadataNames];
export const DRAFT_MAX_BYTES = 2*1024*1024;
export const SIGNER_MAX_LENGTH = 240;
export const SIGNER_MAX_COUNT = 12;
export const SIGNER_NAME_MAX_LENGTH = 60;
const limits = {title:180, recipient:300, agency:120, reference:100, body:100000, signature:120, date:10, attachments:4000, copyTo:1000,postscript:4000,sourceMaterial:100000,pendingMaterial:100000,signer:SIGNER_MAX_LENGTH,issuer:120,issueDate:10};
export function blank() {
  return {title:'', recipient:'', agency:'', reference:'', body:'', signature:'', date:'', attachments:'', copyTo:'', postscript:'',sourceMaterial:'',pendingMaterial:'',letterhead:false,signer:'',issuer:'',issueDate:''};
}
export function validateDraft(value) {
  if (!value || value.type !== 'gongwen-form' || ![1,2,3,4,5,6,7].includes(value.version) || !value.fields || typeof value.fields !== 'object') throw Error('这不是支持的填写草稿文件，请选择本工具下载的草稿。');
  const fields = blank();
  for (const name of names) {
    const optional=value.version===1&&materialNames.includes(name)||value.version<3&&name==='postscript'||value.version<7&&metadataNames.includes(name);
    const v = value.fields[name]===undefined&&optional?'':value.fields[name];
    if (typeof v !== 'string' || v.length > limits[name]) throw Error('草稿中的“'+name+'”无效或过长，原内容未被替换。');
    fields[name] = materialNames.includes(name)?v.replace(/\r\n?/g,'\n'):v;
  }
  if (typeof value.fields.letterhead !== 'boolean') throw Error('草稿的红头设置无效，原内容未被替换。');
  if (fields.date && !validDate(fields.date)) throw Error('草稿日期无效，原内容未被替换。');
  if (fields.issueDate && !validDate(fields.issueDate)) throw Error('草稿印发日期无效，原内容未被替换。');
  fields.letterhead = value.fields.letterhead;
  const id=typeof value.id==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(value.id)?value.id:null;
  const review=validateReviewState(value.review,id);
  const content=value.version>=4&&(value.version<7||value.content!==undefined)?validateContent(value.content):null;
  if(content&&contentText(content)!==fields.body)throw Error('正文结构与文字记录不一致，原始数据已保留。请先下载恢复数据。');
  if(content?.postscript&&contentText(content.postscript)!==fields.postscript)throw Error('附注结构与文字记录不一致，原始数据已保留。请先下载恢复数据。');
  return {type:'gongwen-form', version:hasIssuance(fields)?7:hasAnnexes(content)?6:content?.postscript?5:content?4:fields.postscript?3:fields.sourceMaterial||fields.pendingMaterial?2:value.version===7?1:value.version, fields,...(content?{content}:{}),step:Number.isInteger(value.step) && value.step >= 0 && value.step <= 2 ? value.step : 0,
    ...(id?{id,...(review?{review}:{})}:{})};
}
export function validDate(value) {
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value+'T12:00:00Z');
  return !Number.isNaN(+date) && date.toISOString().slice(0,10) === value && value >= '1900-01-01';
}
// These are independently authored facts, never inferred from closing metadata.
export function hasIssuance(fields) {
  return metadataNames.some(name=>typeof fields[name]==='string'&&fields[name]!=='');
}
export function formatDate(value) {
  if(!value||!validDate(value))return '';
  const [year,month,day]=value.split('-').map(Number);
  return `${year}年${month}月${day}日`;
}
// Explicit author lines, not punctuation-based name guessing. Offsets address
// the unchanged raw textarea/draft string; duplicates retain distinct line IDs.
export function signerLines(value) {
  if(typeof value!=='string')return [];
  let start=0;
  return value.split(/\r?\n/).map((text,index)=>{
    const end=start+text.length,line={text,start,end,line:index+1,name:text.trim()};
    start=end+(value.slice(end,end+2)==='\r\n'?2:1);
    return line;
  }).filter(line=>line.name);
}
export function metadataProblems(fields) {
  const problems=[];
  const signer=typeof fields.signer==='string'?fields.signer:'',people=signerLines(signer);
  if(/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]|\r(?!\n)/.test(signer))problems.push(['signer','签发人不能含制表符、控制字符或单独回车；请按原机关顺序每行一人，原输入已保留。']);
  else if(people.length>SIGNER_MAX_COUNT)problems.push(['signer','签发人最多 '+SIGNER_MAX_COUNT+' 位，请核对每行一人的原名单；原输入已保留，不会删除人员。']);
  else if(people.some(line=>line.name.length>SIGNER_NAME_MAX_LENGTH))problems.push(['signer','每位签发人最多 '+SIGNER_NAME_MAX_LENGTH+' 字符；多人请每行一人，原输入已保留。']);
  else if(signer.length>SIGNER_MAX_LENGTH)problems.push(['signer','签发人名单合计最多 '+SIGNER_MAX_LENGTH+' 字符；原输入已保留，请核对。']);
  if(fields.issuer||fields.issueDate){
    if(!fields.issuer?.trim())problems.push(['issuer','请明确填写独立印发机关，不会使用落款单位代替。']);
    else if(/[\r\n\t]/.test(fields.issuer))problems.push(['issuer','印发机关请填写在单独一行，不能含换行或制表符。']);
    if(!fields.issueDate)problems.push(['issueDate','请明确填写独立印发日期，不会使用成文日期代替。']);
    else if(!validDate(fields.issueDate))problems.push(['issueDate','请核对有效的完整印发日期；来源日期冲突时请先核实，不会自动选择。']);
  }
  return problems;
}
function completeImprint(fields) {
  return Boolean(fields.issuer?.trim()&&fields.issueDate)&&!metadataProblems(fields).some(([field])=>field==='issuer'||field==='issueDate');
}
export function draft(fields, step, id, review, content) {
  const checkedReview=validateReviewState(review,id);
  const checkedContent=content?validateContent(content):null;
  return {type:'gongwen-form', version:hasIssuance(fields)?7:hasAnnexes(checkedContent)?6:checkedContent?.postscript?5:checkedContent?4:fields.postscript?3:fields.sourceMaterial||fields.pendingMaterial?2:1, updatedAt:new Date().toISOString(), fields:{...blank(),...fields,...(checkedContent?{body:contentText(checkedContent),...(checkedContent.postscript?{postscript:contentText(checkedContent.postscript)}:{})}:{})},...(checkedContent?{content:checkedContent}:{}),step,...(id?{id,...(checkedReview?{review:checkedReview}:{})}:{})};
}
export function fieldsForEngine(fields, preview = false, content = null) {
  const hasLetterhead=fields.letterhead&&Boolean(fields.agency.trim()),people=signerLines(fields.signer).map(line=>line.name);
  return {
    kind:'plain', title:fields.title.trim() || (preview?'待填写标题':''),
    body:content?contentBodyForEngine(content):fields.body || (preview?'正文尚未填写':''),
    // Build a single placeholder; applySignature creates the separately authored
    // lines after the engine's single-office input validation.
    agency:hasLetterhead ? fields.agency.trim() : (fields.signature.split(/\r?\n/).map(line=>line.trim()).find(Boolean)||''),
    recipient:fields.recipient.trim(), reference:fields.reference.trim(),
    date:formatDate(fields.date),
    letterhead:hasLetterhead,
    copyTo:fields.copyTo.trim(), attachments:fields.attachments.split(/\r?\n/).map(s=>s.trim()).filter(Boolean),
    ...(hasIssuance(fields)?{signer:people[0]||'',issuer:fields.issuer?.trim()||'',issueDate:formatDate(fields.issueDate),...(people.length>1?{signers:people}:{})}:{})
  };
}
export function applySignature(model, fields) {
  // Retain printing facts and their rules only for a complete explicit pair.
  // Otherwise preserve the existing copy-to-only path; never borrow the closing.
  if(!completeImprint(fields))model.blocks = model.blocks.filter(block => block.paragraph?.role !== 'imprint' || block.paragraph.text.startsWith('抄送：'));
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
export function textContent(fields, content=null) {
  const f = fieldsForEngine(fields);
  const split=section=>{if(!section)return ['', ''];const at=section.annexes?.length?section.blocks.findIndex(b=>b.id===section.annexes[0].start):-1;return at<0?[contentText(section),'']:[contentText({blocks:section.blocks.slice(0,at)}),contentText({blocks:section.blocks.slice(at)})];};
  const [body,bodyAnnex]=content?split(content):[f.body,''],[notes,noteAnnex]=content?.postscript?split(content.postscript):[fields.postscript||'',''];
  let signingReference=f.signer?[f.reference,'签发人：'+f.signer].filter(Boolean).join('\t'):'';
  if(f.signers?.length>1){
    const rows=[];
    for(let i=0;i<f.signers.length;i+=2){
      const people=f.signers.slice(i,i+2).join('　　'),reference=i+2>=f.signers.length?f.reference:'';
      rows.push([reference,(i===0?'签发人：':'')+people].filter(Boolean).join('\t'));
    }
    signingReference=rows.join('\n');
  }
  const heading=f.signer?[signingReference,f.title]:[f.reference,f.title];
  return [f.letterhead ? f.agency+'文件' : '', ...heading,
    f.recipient ? f.recipient.replace(/[：:]+$/, '')+'：' : '', body,
    ...f.attachments.map((s,i)=>`附件${f.attachments.length>1?i+1:''}：${s}`),
    fields.signature.trim(), f.date, notes,bodyAnnex,noteAnnex, f.copyTo?'抄送：'+f.copyTo:'',completeImprint(fields)?f.issuer+'\t'+f.issueDate+'印发':''].filter(Boolean).join('\n\n');
}
export function safeName(title) {
  return (title.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').slice(0,60) || '未命名文档').replace(/[. ]+$/,'');
}
