import test from 'node:test';
import assert from 'node:assert/strict';
import {blank,names,metadataNames,draft,validateDraft,hasIssuance,metadataProblems,formatDate,fieldsForEngine,applySignature,textContent} from '../web/write-model.js';
import {copyFields,commonFrom,freshFields,archiveDocument,validateLibrary} from '../web/write-library.js';
import {contentFromText,contentText,table,validateContent,applyBodyContent,contentBodyForEngine} from '../web/write-content.js';
import {setAnnex} from '../web/write-annexes.js';
import {ReviewDecisions,reviewItems} from '../web/write-checks.js';

const explicit=()=>({...blank(),title:'受控机制稿',body:'正文 12.50 元',reference:'试办〔2024〕1号',signature:'独立落款',date:'2024-08-15',signer:'签发者甲',issuer:'独立印发机关',issueDate:'2024-08-19',copyTo:'收抄单位'});
const model=()=>({page:{width:210,height:297,left:28,right:26},blocks:[{paragraph:{id:'b',role:'body',text:'正文 12.50 元',font:'仿宋',size:16}},{paragraph:{id:'s',role:'signature',text:'占位落款'}},{paragraph:{id:'d',role:'date',text:'2024年8月15日'}},{paragraph:{id:'border',role:'imprint',text:'',borderBottom:true}},{paragraph:{id:'copy',role:'imprint',text:'抄送：收抄单位'}},{paragraph:{id:'print',role:'imprint',text:'独立印发机关\t2024年8月19日印发'}},{paragraph:{id:'bottom',role:'imprint',text:'',borderBottom:true}}]});
const mark=(text,index=0)=>{const section=contentFromText(text);return setAnnex(section,section.blocks[index].id);};
const omitNew=fields=>Object.fromEntries(Object.entries(fields).filter(([key])=>!metadataNames.includes(key)));

test('new fact fields append after existing keys and blank values do not elevate draft versions',()=>{
 assert.deepEqual(names.slice(-3),metadataNames);assert.deepEqual(metadataNames,['signer','issuer','issueDate']);
 assert.deepEqual(Object.keys(blank()).slice(-4),['letterhead',...metadataNames]);
 assert.equal(hasIssuance(blank()),false);assert.equal(draft(blank(),0).version,1);
 for(const key of metadataNames){const fields={...blank(),[key]:key==='issueDate'?'2024-08-19':'明确事实'};assert.equal(hasIssuance(fields),true);assert.equal(draft(fields,0).version,7);}
 assert.equal(draft({...blank(),issuer:' '},0).version,7);
});

test('legacy v1 through v6 accept absent new metadata and retain existing structure/version requirements',()=>{
 for(let version=1;version<=6;version++){
  let content=version>=4?contentFromText('旧正文'):null;
  if(version===5)content.postscript=contentFromText('原附注');
  if(version===6)content=mark('附件\n清单\n旧正文');
  const saved=draft({...blank(),body:content?contentText(content):'旧正文'},0,undefined,undefined,content);
  saved.version=version;saved.fields=omitNew(saved.fields);
  if(version===1){delete saved.fields.sourceMaterial;delete saved.fields.pendingMaterial;delete saved.fields.postscript;}
  if(version===2)delete saved.fields.postscript;
  const restored=validateDraft(saved);assert.equal(restored.version,version);for(const key of metadataNames)assert.equal(restored.fields[key],'');
  if(content)assert.deepEqual(restored.content,content);
  if(version>=4)assert.throws(()=>validateDraft({...saved,content:undefined}));
 }
});

test('v7 round trips with or without canonical body and rejects missing fact slots or structural corruption',()=>{
 const fields=explicit(),plain=validateDraft(draft(fields,2,'facts-id'));
 assert.equal(plain.version,7);assert.equal(plain.content,undefined);assert.deepEqual(plain.fields,fields);
 const content=contentFromText(fields.body);content.blocks.push(table(2,2));content.postscript=contentFromText('附注原文');
 const saved=draft(fields,1,'facts-id',undefined,content),restored=validateDraft(saved);assert.equal(restored.version,7);assert.deepEqual(restored.content,content);
 assert.throws(()=>validateDraft({...saved,fields:{...saved.fields,body:'不同影子'}}));
 assert.throws(()=>validateDraft({...saved,content:null}));
 const missing=structuredClone(saved);delete missing.fields.signer;assert.throws(()=>validateDraft(missing));
 const empty=draft(blank(),0);empty.version=7;assert.equal(validateDraft(empty).version,1);
});

test('half entered print metadata remains saveable while generation problems target the missing counterpart',()=>{
 for(const extra of [{issuer:'独立印发机关'},{issueDate:'2024-08-19'}]){
  const fields={...blank(),signature:'不得借用的落款',date:'2024-08-15',...extra};
  const saved=draft(fields,0,'partial-facts'),restored=validateDraft(saved);
  assert.equal(restored.version,7);assert.deepEqual(restored.fields,fields);
  assert.equal(validateLibrary(archiveDocument({version:1,items:[]},'partial-facts',saved)).items[0].document.fields.issueDate,fields.issueDate);
  const problems=metadataProblems(fields);assert.equal(problems.length,1);assert.equal(problems[0][0],extra.issuer?'issueDate':'issuer');assert.match(problems[0][1],/不会使用/);
  assert.doesNotThrow(()=>fieldsForEngine(fields));
 }
 assert.deepEqual(metadataProblems({...blank(),signer:'签发者甲'}),[]);
});

test('ISO printing date validates independently and never chooses a conflicting source date',()=>{
 assert.equal(formatDate('2024-08-19'),'2024年8月19日');assert.equal(formatDate('2024-02-30'),'');
 for(const date of ['2024-02-30','2024-13-01','2024年8月19日','2024-08-19或2024-08-23']){
  const fields={...explicit(),issueDate:date};assert.throws(()=>validateDraft(draft(fields,0)),/印发日期|issueDate/);assert.equal(metadataProblems(fields).find(p=>p[0]==='issueDate')?.length,2);
 }
 assert.deepEqual(metadataProblems(explicit()),[]);assert.equal(metadataProblems({...explicit(),issuer:' \t '})[0][0],'issuer');
 assert.equal(metadataProblems({...explicit(),issuer:'机关\n另一行'})[0][0],'issuer');
});

test('field length and type corruption reject without changing the input document',()=>{
 for(const [name,limit] of [['signer',240],['issuer',120],['issueDate',10]]){
  const fields={...blank(),[name]:'x'.repeat(limit+1)},saved=draft(fields,0),before=JSON.stringify(saved);
  assert.throws(()=>validateDraft(saved));assert.equal(JSON.stringify(saved),before);
  assert.throws(()=>validateDraft({...saved,fields:{...saved.fields,[name]:12}}));
 }
 assert.equal(validateDraft(draft({...blank(),signer:'甲'.repeat(60),issuer:'乙'.repeat(120)},0)).fields.issuer.length,120);
});

test('engine mapping keeps signer and print date separate from header and closing facts',()=>{
 for(const letterhead of [false,true]){
  const fields={...explicit(),agency:'红头发文机关',letterhead},mapped=fieldsForEngine(fields);
  assert.equal(mapped.kind,'plain');assert.equal(mapped.signer,fields.signer);assert.equal(mapped.issuer,fields.issuer);assert.equal(mapped.issueDate,'2024年8月19日');assert.equal(mapped.date,'2024年8月15日');
  assert.equal(mapped.agency,letterhead?'红头发文机关':'独立落款');assert.deepEqual(fields, {...explicit(),agency:'红头发文机关',letterhead});
 }
 const missing=fieldsForEngine({...explicit(),issuer:'',issueDate:''});assert.equal(missing.issuer,'');assert.equal(missing.issueDate,'');
 const old=fieldsForEngine(blank());assert.equal('signer' in old,false);assert.equal('issuer' in old,false);assert.equal('issueDate' in old,false);
});

test('only a complete explicit printing pair retains imprint rules while copy-to always survives',()=>{
 const fields={...explicit(),postscript:'落款后原附注'},original=model(),once=structuredClone(applySignature(original,fields));
 assert.equal(once.blocks.filter(b=>b.paragraph?.role==='imprint').length,4);
 const order=once.blocks.map(b=>b.paragraph?.text);assert.ok(order.indexOf(fields.postscript)<order.indexOf('抄送：收抄单位'));
 assert.deepEqual(applySignature(original,fields),once);
 for(const extra of [{signer:'签发者甲',issuer:'',issueDate:''},{issuer:'独立印发机关',issueDate:''},{issuer:'',issueDate:'2024-08-19'},{issuer:'独立印发机关',issueDate:'2024-02-30'}]){
  const result=applySignature(model(),{...fields,...extra});assert.deepEqual(result.blocks.filter(b=>b.paragraph?.role==='imprint').map(b=>b.paragraph.text),['抄送：收抄单位']);
 }
});

test('metadata retains body, tables, annex identities and suffix placement in the same draft/model',()=>{
 const content=mark('正文 12.50 元\n附件\n原清单\n附件正文',1);
 content.blocks.splice(4,0,table(2,2));content.postscript=contentFromText('原附注\n回执');
 const saved=draft(explicit(),0,'structured-facts',undefined,content),restored=validateDraft(saved);assert.deepEqual(restored.content,validateContent(content));
 assert.equal(restored.fields.body,contentText(content));assert.equal(restored.fields.postscript,contentText(content.postscript));
 const base=model();base.blocks[0].paragraph.text=contentBodyForEngine(content);
 const applied=applyBodyContent(applySignature(base,restored.fields),content);
 assert.ok(applied.blocks.some(b=>b.table));assert.ok(applied.blocks.some(b=>b.paragraph?.role==='attachment-label'));
 assert.ok(applied.blocks.some(b=>b.paragraph?.text==='独立印发机关\t2024年8月19日印发'));
 assert.equal(contentText(content),saved.fields.body);
});

test('TXT places explicit signer with reference and independent printing after notes, annexes and copy-to',()=>{
 const content=mark('正文\n附件\n清单\n附件事项',1);
 const fields=explicit();for(const letterhead of [false,true]){
  const text=textContent({...fields,letterhead,agency:'红头机关'},content);assert.equal((text.match(/签发人：签发者甲/g)||[]).length,1);
  assert.ok(text.indexOf('签发人：')<text.indexOf('正文'));assert.ok(text.indexOf('2024年8月15日')<text.indexOf('附件事项'));
  assert.ok(text.indexOf('抄送：')<text.indexOf('独立印发机关\t2024年8月19日印发'));
  assert.ok(text.indexOf('签发人：')<text.indexOf(fields.title));
 }
 const only=textContent({...blank(),title:'标题',signer:'明确签发者'});assert.match(only,/签发人：明确签发者\n\n标题/);assert.doesNotMatch(only,/印发/);
});

test('historical copy clears only date-specific facts while fresh/common never reuse issuance metadata',()=>{
 const fields=explicit(),copy=copyFields(fields);assert.equal(copy.signer,fields.signer);assert.equal(copy.issuer,fields.issuer);assert.equal(copy.issueDate,'');assert.equal(copy.date,'');assert.equal(copy.reference,'');
 const current={...fields};assert.deepEqual(current,fields);
 const common=commonFrom(fields),fresh=freshFields(common);for(const key of metadataNames){assert.equal(key in common.fields,false);assert.equal(fresh[key],'');}
 assert.equal(fields.issueDate,'2024-08-19');
});

test('existing body review anchors remain restorable while changed metadata invalidates document-scoped decisions',()=>{
 const fields=explicit(),m={blocks:[{paragraph:{id:'b',role:'body',text:fields.body}}]},inspection={version:'test',issues:[{id:'i',paragraphId:'b',rule:'number.unit-space',severity:'review',message:'核对',original:'12.50'}]};
 const [entry]=reviewItems(m,inspection,fields,'facts-review'),decisions=new ReviewDecisions();assert.ok(entry);decisions.set(entry,true);
 const review=decisions.snapshot('facts-review'),saved=draft(fields,0,'facts-review',review),restored=validateDraft(saved);assert.deepEqual(restored.review,review);
 const next=new ReviewDecisions();next.restore(restored.review,{...fields,issuer:'新明确机关'},'facts-review');assert.equal(next.has(entry),true);
 const documentEntry=reviewItems(m,{version:'test',issues:[{id:'global',rule:'unknown.cross-paragraph',severity:'review',message:'全稿核对',original:'核对'}]},fields,'facts-review')[0];
 assert.equal(documentEntry.scope,'document');decisions.set(documentEntry,true);const state=decisions.snapshot('facts-review');
 const all=new ReviewDecisions();all.restore(state,{...fields,issuer:'新明确机关'},'facts-review');assert.equal(all.has(documentEntry),false);assert.equal(all.has(entry),true);
});

test('invalid signer controls remain a saveable exact draft but receive a field-level generation problem',()=>{
 for(const signer of ['签发甲\t签发乙','\r签发甲']){
  const fields={...blank(),signer},saved=draft(fields,0),restored=validateDraft(saved);
  assert.equal(restored.fields.signer,signer);assert.equal(saved.fields.signer,signer);
  const problems=metadataProblems(fields);assert.equal(problems[0][0],'signer');assert.match(problems[0][1],/不能含制表符/);
 }
});
