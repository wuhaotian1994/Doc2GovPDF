import test from 'node:test';
import assert from 'node:assert/strict';
import {analyseMaterial,materialProposal} from '../web/write-materials.js';
import {blank,draft,validateDraft,fieldsForEngine,textContent,DRAFT_MAX_BYTES} from '../web/write-model.js';
import {archiveDocument,validateLibrary,commonFrom,freshFields} from '../web/write-library.js';
import {materials} from './fixtures/writer-materials.mjs';
import {jointNotice,jointSignatures} from './fixtures/writer-joint-notice.mjs';
import {readFileSync} from 'node:fs';
const hospital=JSON.parse(readFileSync(new URL('./fixtures/writer-hospital-notice.json',import.meta.url),'utf8'));

test('hospital preamble stays body while genuine addressees remain optional candidates',()=>{
  assert.equal(analyseMaterial(hospital.raw).candidates.recipient,undefined);
  for(const address of ['各部门：','尊敬的各位患者及家属：','肇庆市卫生健康局：','全体同学：','读者朋友们：','相关部门：'])assert.equal(analyseMaterial('工作安排\n'+address+'\n请核对原文。').candidates.recipient.value,address.replace(/[：:]$/,''));
  for(const introduction of ['根据医院情况，现将工作安排如下：','温馨提示：','各部门应当按本通知执行，具体要求如下：'])assert.equal(analyseMaterial('工作安排\n'+introduction+'\n保留原文。').candidates.recipient,undefined);
});

test('existing opt-in hospital cleanup retains each paragraph and all facts in order',()=>{
  const analysis=analyseMaterial(hospital.raw),plain=materialProposal(analysis,{title:true}),tidied=materialProposal(analysis,{title:true},true);
  assert.equal(plain.fields.body,hospital.paragraphs.join('\n\n'));
  assert.equal(tidied.fields.body,hospital.paragraphs.join('\n'));
  assert.equal(tidied.fields.sourceMaterial,hospital.raw);
  assert.equal(tidied.fields.date,'');assert.equal(tidied.fields.signature,'');
});

test('public joint notice requires confirmation and preserves both signatories before the authored date',()=>{
  const a=analyseMaterial(jointNotice);assert.equal(a.candidates.signature.value,jointSignatures.join('\n'));
  assert.equal(a.candidates.date.value,'2024-05-15');
  const plain=materialProposal(a,{title:true});assert.ok(jointSignatures.every(name=>plain.fields.body.includes(name)));assert.equal(plain.fields.signature,'');
  const p=materialProposal(a,{title:true,signature:true,date:true});assert.equal(p.fields.signature,jointSignatures.join('\n'));assert.ok(jointSignatures.every(name=>!p.fields.body.includes(name)));assert.ok(p.fields.body.includes('2024年5月18日0：00——5月22日23：00'));
});

test('whole source is only a proposal: no roles are extracted without author selections',()=>{
  const analysis=analyseMaterial(materials[0].raw),proposal=materialProposal(analysis);
  assert.equal(proposal.fields.title,'');assert.equal(proposal.fields.signature,'');assert.equal(proposal.fields.date,'');
  assert.equal(proposal.fields.body,materials[0].raw);assert.equal(proposal.fields.sourceMaterial,materials[0].raw);
});
test('confirmed notification fields move exactly once while deadline and authored date remain distinct',()=>{
  const raw=materials[0].raw,{fields,conflicts}=materialProposal(analyseMaterial(raw),{title:true,recipient:true,signature:true,date:true});
  assert.equal(conflicts.length,0);assert.equal(fields.title,'关于资料归档工作的通知');assert.equal(fields.recipient,'各部门');
  assert.equal(fields.signature,'综合办公室');assert.equal(fields.date,'2026-10-21');assert.ok(fields.body.includes('2026年10月23日'));
  assert.ok(!fields.body.includes(fields.signature));assert.ok(!fields.body.includes(fields.title));
  assert.equal(textContent(fields).split(fields.title).length-1,1);assert.equal(fields.sourceMaterial,raw);
  assert.ok(!('sourceMaterial' in fieldsForEngine(fields)));assert.ok(!('pendingMaterial' in fieldsForEngine(fields)));
});
test('unselected and uncertain lines stay in prose; relative and invalid dates are not guessed',()=>{
  const raw='工作记录\n请注意：\n\n这是一段正文。\n今天';
  const a=analyseMaterial(raw);assert.ok(!a.candidates.date);assert.ok(!a.candidates.signature);
  const p=materialProposal(a,{title:true});assert.ok(p.fields.body.includes('请注意：'));assert.ok(p.fields.body.includes('今天'));
  assert.ok(!analyseMaterial('通知\n综合办公室\n2025年2月29日').candidates.date);
});
test('conflicting uses of the same line and duplicate title choices require a decision',()=>{
  const a=analyseMaterial('综合办公室\n2026年10月21日');
  assert.ok(materialProposal(a,{title:true,signature:true}).conflicts.length);
  assert.ok(materialProposal(a,{title:true,keepTitle:true},false,'已填标题').conflicts.length);
  assert.ok(materialProposal(a,{keepTitle:true},false,'综合办公室').conflicts.length);
});
test('hard-wrap merging is opt-in, preserves the original and does not silently concatenate numeric tokens',()=>{
  const a=analyseMaterial(materials[1].raw);
  assert.ok(materialProposal(a,{title:true}).fields.body.includes('，\n'));
  const p=materialProposal(a,{title:true},true);assert.equal(p.fields.body.split('\n').length,2);assert.equal(p.fields.sourceMaterial,materials[1].raw);
  assert.equal(materialProposal(analyseMaterial('核对记录\n\n值为1\n00万元。'),{title:true},true).fields.body,'值为1 00万元。');
  assert.equal(materialProposal(analyseMaterial('记录\n\nRead\nOnly'),{title:true},true).fields.body,'Read Only');
  assert.equal(materialProposal(analyseMaterial('工作说明\n\n一、安排\n请保留\n原始记录'),{title:true},true).fields.body,'一、安排\n请保留\n原始记录');
});
test('legacy v1 drafts migrate with empty metadata; source-bearing drafts explicitly use v2',()=>{
  const legacy={...blank(),title:'旧稿',body:'旧正文'};delete legacy.sourceMaterial;delete legacy.pendingMaterial;
  const old=validateDraft({type:'gongwen-form',version:1,fields:legacy});assert.equal(old.fields.sourceMaterial,'');assert.equal(old.fields.pendingMaterial,'');assert.equal(old.version,1);
  const fields={...blank(),pendingMaterial:materials[0].raw};const saved=draft(fields,0,'draft-a');assert.equal(saved.version,2);assert.equal(validateDraft(saved).fields.pendingMaterial,materials[0].raw);
  assert.throws(()=>validateDraft({...saved,fields:legacy}));
  assert.throws(()=>validateDraft({...saved,fields:{...fields,sourceMaterial:{}}}));
  assert.throws(()=>validateDraft({...saved,fields:{...fields,pendingMaterial:'x'.repeat(100001)}}));
});
test('source and pending material survive archives and do not contaminate reusable office details',()=>{
  const fields={...blank(),title:'整理稿',body:'正文',sourceMaterial:materials[0].raw,pendingMaterial:materials[1].raw};
  const library=validateLibrary(archiveDocument({version:1,items:[]},'draft-a',draft(fields,1,'draft-a')));
  assert.equal(library.items[0].document.fields.sourceMaterial,materials[0].raw);assert.equal(library.items[0].document.fields.pendingMaterial,materials[1].raw);
  const fresh=freshFields(commonFrom(fields));assert.equal(fresh.sourceMaterial,'');assert.equal(fresh.pendingMaterial,'');
});
test('draft byte limit accommodates preserved source, working body and pending source even with escaped controls',()=>{
  const text='\u0001'.repeat(100000),fields={...blank(),body:text,postscript:'\u0001'.repeat(4000),sourceMaterial:text,pendingMaterial:text};
  assert.ok(Buffer.byteLength(JSON.stringify(draft(fields,0),null,2),'utf8')<DRAFT_MAX_BYTES);
});
