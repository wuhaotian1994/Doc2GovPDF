import test from 'node:test';
import assert from 'node:assert/strict';
import {blank,draft,validateDraft} from '../web/write-model.js';
import {defaultCommon,commonFrom,freshFields,copyFields,archiveDocument,validateLibrary,validateCommon,MAX_DOCUMENTS} from '../web/write-library.js';

test('common information never carries document-specific facts into new work',()=>{
  const original={...blank(),title:'上次标题',body:'旧正文',reference:'发〔2026〕8号',date:'2026-10-20',attachments:'旧附件',agency:'甲单位',signature:'办公室',recipient:'各部门',copyTo:'乙单位',letterhead:true};
  const common=commonFrom(original,'pdf');
  assert.deepEqual(freshFields(common),{...blank(),agency:'甲单位',signature:'办公室',recipient:'各部门',copyTo:'乙单位',letterhead:true});
  assert.equal(common.format,'pdf');
  assert.equal(copyFields(original).date,'');assert.equal(copyFields(original).reference,'');
  assert.equal(copyFields(original).body,'旧正文');assert.equal(copyFields(original).attachments,'旧附件');
});
test('library upserts the same document, keeps old work, and never silently evicts at capacity',()=>{
  let library={version:1,items:[]};
  for(let i=0;i<MAX_DOCUMENTS;i++)library=archiveDocument(library,'id-'+i,draft({...blank(),title:'稿'+i,body:'正文'},0));
  const updated=archiveDocument(library,'id-0',draft({...blank(),title:'修改后的稿',body:'保留'},1));
  assert.equal(updated.items.length,MAX_DOCUMENTS);assert.equal(updated.items[0].document.fields.body,'保留');
  assert.throws(()=>archiveDocument(updated,'another',draft({...blank(),title:'新稿'},0)),/已保存/);
  assert.equal(updated.items.length,MAX_DOCUMENTS);
});
test('corrupt stored preferences and library cannot enter working state',()=>{
  assert.throws(()=>validateCommon({...defaultCommon(),format:'zip'}));
  assert.throws(()=>validateCommon({...defaultCommon(),fields:{agency:42}}));
  assert.throws(()=>validateCommon({version:1,format:'docx'}));
  assert.throws(()=>validateLibrary({version:1,items:[{id:'x',savedAt:'not-a-date',document:draft(blank(),0)}]}));
  const row={id:'x',savedAt:new Date().toISOString(),document:draft(blank(),0)};
  assert.throws(()=>validateLibrary({version:1,items:[row,row]}));
});
test('partially entered metadata remains a recoverable draft',()=>{
  const result=archiveDocument({version:1,items:[]},'partial',draft({...blank(),recipient:'尚未写标题的收文对象'},0));
  assert.equal(result.items[0].document.fields.recipient,'尚未写标题的收文对象');
});
test('old draft versions migrate without requiring an identifier and new identifiers survive restore',()=>{
  const prior=validateDraft(draft({...blank(),body:'保留旧稿'},1));
  assert.equal(prior.fields.body,'保留旧稿');assert.equal(prior.id,undefined);
  assert.equal(validateDraft(draft(blank(),0,'a-valid-id')).id,'a-valid-id');
});
