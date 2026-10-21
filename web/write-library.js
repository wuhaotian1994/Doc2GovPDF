import {blank, draft, validateDraft} from './write-model.js';
import {hasContent} from './write-content.js';

export const COMMON_KEY='gongwen-writer-common-v1';
export const LIBRARY_KEY='gongwen-writer-library-v1';
export const MAX_DOCUMENTS=20;
const reusable=['recipient','agency','signature','copyTo','letterhead'];
export function defaultCommon() {
  return {version:1,fields:{recipient:'',agency:'',signature:'',copyTo:'',letterhead:false},format:'docx'};
}
export function validateCommon(value) {
  if(!value || value.version!==1 || !['docx','pdf','txt'].includes(value.format) || !value.fields || Array.isArray(value.fields) || typeof value.fields!=='object' || reusable.some(key=>typeof value.fields[key] !== (key==='letterhead'?'boolean':'string')))throw Error('常用信息无法读取，原数据已保留。可在常用设置中重新保存。');
  const fields=validateDraft(draft({...blank(),...value.fields},0)).fields;
  return {version:1,fields:Object.fromEntries(reusable.map(key=>[key,fields[key]])),format:value.format};
}
export function commonFrom(fields,format='docx') {
  return validateCommon({version:1,fields:Object.fromEntries(reusable.map(key=>[key,fields[key]])),format});
}
export function freshFields(common) {
  return {...blank(),...validateCommon(common).fields};
}
export function copyFields(fields) {
  return {...fields,date:'',reference:''};
}
export function validateLibrary(value) {
  if(!value || value.version!==1 || !Array.isArray(value.items) || value.items.length>MAX_DOCUMENTS)throw Error('最近文档列表无法读取，原始数据已保留。请先下载恢复数据。');
  const ids=new Set();
  return {version:1,items:value.items.map(item=>{
    if(!item || typeof item.id!=='string' || !/^[a-zA-Z0-9-]{1,80}$/.test(item.id) || ids.has(item.id) || typeof item.savedAt!=='string' || !Number.isFinite(Date.parse(item.savedAt)))throw Error('最近文档列表损坏，原始数据已保留。');
    ids.add(item.id);
    return {id:item.id,savedAt:item.savedAt,document:validateDraft(item.document)};
  })};
}
export function archiveDocument(library,id,document,now=new Date().toISOString()) {
  const checked=validateDraft(document);
  if(!Object.values(checked.fields).some(value=>typeof value==='string'?value.trim():value)&&!hasContent(checked.content))return library;
  const items=library.items.filter(item=>item.id!==id);
  if(items.length>=MAX_DOCUMENTS)throw Error(`已保存 ${MAX_DOCUMENTS} 份文档。请在“我的文档”下载并删除不再需要的旧稿，再新建。当前内容仍保留。`);
  return validateLibrary({version:1,items:[{id,savedAt:now,document:checked},...items]});
}
