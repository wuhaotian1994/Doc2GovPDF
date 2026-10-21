import test from 'node:test';
import assert from 'node:assert/strict';
import {analyseMaterial,selectMaterialClosing,materialProposal} from '../web/write-materials.js';
import {blank,draft,validateDraft,applySignature,textContent} from '../web/write-model.js';
import {reviewItems,resolveSource} from '../web/write-checks.js';
import {postscriptNotice,postscriptParagraphs} from './fixtures/writer-postscript-notice.mjs';

test('spaced historical date and signing before annotations are proposed without swallowing the attachment',()=>{
 const a=analyseMaterial(postscriptNotice);assert.equal(a.candidates.date.value,'2024-04-03');assert.equal(a.candidates.signature.value,'万盛街道办事处');assert.equal(a.candidates.postscript.value,postscriptParagraphs.slice(-2).join('\n'));
 const untouched=materialProposal(a);assert.equal(untouched.fields.body,postscriptNotice);assert.equal(untouched.fields.postscript,'');
 const p=materialProposal(a,{title:true,recipient:true,signature:true,date:true,postscript:true});assert.deepEqual(p.conflicts,[]);assert.ok(p.fields.body.includes(postscriptParagraphs.at(-5)));assert.equal(p.fields.sourceMaterial,postscriptNotice);
 const expected=[...postscriptParagraphs];expected[28]='2024年4月3日';assert.deepEqual(textContent(p.fields).split('\n').filter(Boolean),expected);
});
test('nonterminal date adoption cannot silently move later source before the signature',()=>{
 const a=analyseMaterial(postscriptNotice);
 for(const selected of [{signature:true},{date:true},{postscript:true},{signature:true,date:true}])assert.ok(materialProposal(a,selected).conflicts.length);
 assert.equal(materialProposal(a,{date:true,postscript:true}).conflicts.length,0);
});
test('multiple standalone dates require a source-position choice, and invalid dates are never proposed',()=>{
 const raw='测试通知\n某事项\n2024年4月26日\n正文。\n某办公室\n2024 年 4 月 3 日\n（说明保留）';const a=analyseMaterial(raw);assert.equal(a.closings.length,2);assert.ok(!a.candidates.date);
 const selected=selectMaterialClosing(a,1);assert.equal(selected.candidates.date.value,'2024-04-03');assert.equal(selected.candidates.signature.value,'某办公室');
 assert.ok(!analyseMaterial('标题\n正文。\n某办公室\n2024年2月30日\n（说明）').candidates.date);
});
test('v1/v2 omit new annotation field safely; v3 preserves and strictly validates it',()=>{
 const old={...blank(),title:'旧稿',body:'原文',sourceMaterial:'保留'};delete old.postscript;
 assert.equal(validateDraft({type:'gongwen-form',version:2,fields:old}).fields.postscript,'');
 const fields={...blank(),title:'稿',body:'文',postscript:'（说明）'};assert.equal(draft(fields,1).version,3);assert.equal(validateDraft(draft(fields,1)).fields.postscript,'（说明）');
 assert.throws(()=>validateDraft({type:'gongwen-form',version:3,fields:old}));assert.throws(()=>validateDraft(draft({...fields,postscript:'x'.repeat(4001)},1)));
});
test('notes follow signing/date and precede copy-to once, without altering authored text',()=>{
 const fields={...blank(),signature:'甲单位\n乙单位',postscript:'（联系人说明）\n（公开说明）'};
 const model={blocks:[{paragraph:{id:'b',role:'body',text:'正文'}},{paragraph:{id:'s',role:'signature',text:'甲单位',align:'right'}},{paragraph:{id:'d',role:'date',text:'2024年4月3日'}},{paragraph:{id:'i',role:'imprint',text:'抄送：办公室。'}}]};
 const once=structuredClone(applySignature(model,fields));assert.deepEqual(once.blocks.map(b=>b.paragraph.text),['正文','甲单位','乙单位','2024年4月3日','（联系人说明）','（公开说明）','抄送：办公室。']);assert.equal(once.blocks[4].paragraph.role,'note');assert.equal(once.blocks[4].paragraph.align,'left');assert.deepEqual(applySignature(model,fields),once);
});
test('a reminder on the second note resolves to that actual note line',()=>{
 const fields={...blank(),postscript:'第一段\n第二段10kg'};const model={blocks:[{paragraph:{id:'n0',role:'note',text:'第一段'}},{paragraph:{id:'n1',role:'note',text:'第二段10kg'}}]};
 const [entry]=reviewItems(model,{version:'test',issues:[{id:'i',paragraphId:'n1',rule:'number.unit-space',severity:'review',message:'核对',original:'10kg'}]},fields,'test');assert.equal(entry.source.field,'postscript');assert.equal(resolveSource(entry.source,fields).line,2);
});
