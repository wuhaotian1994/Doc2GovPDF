import test from 'node:test';
import assert from 'node:assert/strict';
import {blank,draft,validateDraft,fieldsForEngine,applySignature,textContent,validDate} from '../web/write-model.js';

test('draft round trip preserves exact user text and rejects corrupt fields',()=>{
  const fields={...blank(),title:'标题',body:'一、原文\n金额 12.50 元\n<svg onload=alert(1)>',date:'2024-02-29',letterhead:true,agency:'测试单位'};
  assert.deepEqual(validateDraft(JSON.parse(JSON.stringify(draft(fields,1)))).fields,fields);
  assert.throws(()=>validateDraft({type:'gongwen-form',version:1,fields:{...fields,body:22}}));
  assert.throws(()=>validateDraft(draft({...fields,date:'2026-02-29'},0)));
  assert.throws(()=>validateDraft({...draft(fields,0),version:2}));
});
test('preview placeholders never enter actual export fields',()=>{
  const fields=blank();
  assert.equal(fieldsForEngine(fields).body,'');
  assert.equal(fieldsForEngine(fields,true).body,'正文尚未填写');
  assert.equal(fieldsForEngine(fields).date,'');
});
test('red header and signature remain independently authored',()=>{
  const fields={...blank(),title:'标题',body:'正文',agency:'发文单位',signature:'落款单位',letterhead:true,date:'2026-10-20'};
  assert.equal(fieldsForEngine(fields).agency,'发文单位');
  const model={blocks:[{paragraph:{role:'agency',text:'发文单位文件'}},{paragraph:{role:'signature',text:'发文单位'}}]};
  assert.equal(applySignature(model,fields).blocks[1].paragraph.text,'落款单位');
  assert.equal(applySignature(model,{...fields,signature:''}).blocks.length,1);
  const text=textContent(fields);
  assert.match(text,/发文单位文件/);assert.match(text,/落款单位/);assert.match(text,/2026年10月20日/);
});
test('date validation uses actual calendar days',()=>{
  assert.equal(validDate('2026-13-02'),false);
  assert.equal(validDate('2026-04-31'),false);
  assert.equal(validDate('2024-02-29'),true);
});
test('generic writer never invents printing office or printing date',()=>{
  const model={blocks:[
    {paragraph:{role:'agency',text:'测试单位文件',before:35}},
    {paragraph:{role:'imprint',text:'',borderBottom:true}},
    {paragraph:{role:'imprint',text:'抄送：办公室。'}},
    {paragraph:{role:'imprint',text:'测试单位\t2026年10月20日印发'}}
  ]};
  const result=applySignature(model,{...blank(),letterhead:true,agency:'测试单位'});
  assert.equal(result.blocks.length,2);
  assert.equal(result.blocks[0].paragraph.before,0);
  assert.equal(result.blocks[1].paragraph.text,'抄送：办公室。');
});
