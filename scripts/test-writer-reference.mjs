import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {referenceAdvice,sameReferenceFinding} from '../web/write-reference.js';
import {blank} from '../web/write-model.js';import {ReviewDecisions,reviewItems} from '../web/write-checks.js';
const cases=JSON.parse(await readFile(new URL('./fixtures/reference-advice.json',import.meta.url),'utf8'));
test('complete known reference patterns suggest formatting while preserving all supplied facts',()=>{
 for(const sample of cases){const advice=referenceAdvice(sample.input);assert.equal(advice?.proposal||null,sample.proposal,sample.input);assert.equal(advice?.engineReplacement||null,sample.engineReplacement,sample.input);if(advice){assert.deepEqual(advice.reasons.map(r=>r.id),sample.reasons);assert.equal(advice.year,'2026');assert.equal(advice.value,sample.input);}}
});
test('early choices only bind the identical existing reference finding, never another rule or changed source',()=>{
 const value=cases[0].input,advice=referenceAdvice(value),entry={source:{field:'reference'},issue:{rule:'reference.format',severity:'review',original:value,replacement:advice.engineReplacement}};
 assert.ok(sameReferenceFinding(entry,value,advice));assert.ok(!sameReferenceFinding({...entry,issue:{...entry.issue,rule:'date.invalid'}},value,advice));assert.ok(!sameReferenceFinding({...entry,issue:{...entry.issue,replacement:'未知新建议'}},value,advice));assert.ok(!sameReferenceFinding({...entry,source:{field:'body'}},value,advice));
});
test('revoking field-time retention does not erase an unrelated body judgment',()=>{
 const fields={...blank(),reference:cases[0].input,body:'设备重量10kg。'},advice=referenceAdvice(fields.reference);
 const model={blocks:[{paragraph:{id:'r',role:'reference',text:fields.reference}},{paragraph:{id:'b',role:'body',text:fields.body}}]};
 const entries=reviewItems(model,{version:'test',issues:[{id:'ref',paragraphId:'r',rule:'reference.format',severity:'review',original:fields.reference,replacement:advice.engineReplacement},{id:'body',paragraphId:'b',rule:'number.unit-space',severity:'review',original:fields.body}]},fields,'doc');
 const decisions=new ReviewDecisions();for(const entry of entries)decisions.set(entry,true);decisions.forgetField('reference','doc','reference.format');assert.deepEqual([...decisions.reconcile(entries)],['body']);
});
