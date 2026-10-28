import test from 'node:test';
import assert from 'node:assert/strict';
import {blank,draft,validateDraft,metadataProblems,fieldsForEngine,textContent,signerLines,SIGNER_MAX_LENGTH,SIGNER_MAX_COUNT,SIGNER_NAME_MAX_LENGTH} from '../web/write-model.js';
import {copyFields,archiveDocument,validateLibrary} from '../web/write-library.js';
import {contentFromText,contentText,table} from '../web/write-content.js';
import {setAnnex} from '../web/write-annexes.js';

// Mechanism regression only. The supplied official three-page manuscript and
// actual Word/PDF acceptance are verified separately, never replaced by these.
const fields=extra=>({...blank(),title:'机制核对',body:'正文记录保留。',...extra});
const problems=signer=>metadataProblems(fields({signer})).filter(([field])=>field==='signer');

test('signerLines preserves raw line locations, CRLF widths, empty lines and duplicate people',()=>{
 const raw='  姓名甲  \r\n \r\n姓名甲\n👩姓名乙\n',lines=signerLines(raw);
 assert.deepEqual(lines.map(line=>line.name),['姓名甲','姓名甲','👩姓名乙']);
 assert.deepEqual(lines.map(line=>line.line),[1,3,4]);
 assert.equal(lines[0].text,'  姓名甲  ');assert.equal(lines[1].start,raw.indexOf('姓名甲\n'));
 for(const line of lines){assert.equal(raw.slice(line.start,line.end),line.text);assert.equal(line.end-line.start,line.text.length);}
 assert.deepEqual(signerLines(' \n\r\n　 '),[]);assert.deepEqual(signerLines(undefined),[]);
 assert.equal(raw,'  姓名甲  \r\n \r\n姓名甲\n👩姓名乙\n');
});

test('only author line breaks define people; punctuation and spaces never infer a list',()=>{
 for(const raw of ['姓名甲、姓名乙','姓名甲,姓名乙','姓名甲，姓名乙','姓名甲 姓名乙']){
  const mapped=fieldsForEngine(fields({signer:raw}));assert.equal(mapped.signer,raw);assert.equal(Object.hasOwn(mapped,'signers'),false);
  assert.equal(signerLines(raw).length,1);assert.deepEqual(problems(raw),[]);
 }
});

test('multiple ordered and duplicate names map to array with matching first scalar',()=>{
 const raw=' 姓名甲 \n姓名乙\n姓名甲',f=fields({signer:raw}),before=structuredClone(f),mapped=fieldsForEngine(f);
 assert.equal(mapped.signer,'姓名甲');assert.deepEqual(mapped.signers,['姓名甲','姓名乙','姓名甲']);
 assert.deepEqual(f,before);assert.deepEqual(problems(raw),[]);
});

test('single and empty signer retain legacy optional engine key shapes',()=>{
 const absent=fieldsForEngine(blank());for(const key of ['signer','issuer','issueDate','signers'])assert.equal(Object.hasOwn(absent,key),false);
 const single=fieldsForEngine(fields({signer:' 姓名甲 '}));assert.equal(single.signer,'姓名甲');assert.equal(Object.hasOwn(single,'signers'),false);
 assert.deepEqual(Object.keys(single).slice(-3),['signer','issuer','issueDate']);
 const pair=fieldsForEngine(fields({issuer:'明确机关',issueDate:'2024-08-19'}));assert.equal(pair.signer,'');assert.equal(Object.hasOwn(pair,'signers'),false);
 const blanks=fieldsForEngine(fields({signer:' \n  '}));assert.equal(blanks.signer,'');assert.equal(Object.hasOwn(blanks,'signers'),false);
});

test('v7 save, JSON reopen, history and copy retain exact author string',()=>{
 const raw=' 姓名甲 \r\n\r\n姓名乙\r\n姓名甲 ',f=fields({signer:raw,reference:'编号原文',signature:'机关甲\n机关乙\n机关丙',date:'2020-12-16',issueDate:'2020-12-16',issuer:'原印发机关'});
 const saved=draft(f,1,'signers-original'),reopened=validateDraft(JSON.parse(JSON.stringify(saved)));
 assert.equal(saved.version,7);assert.equal(reopened.version,7);assert.deepEqual(reopened.fields,f);
 const archive=validateLibrary(archiveDocument({version:1,items:[]},saved.id,saved));assert.equal(archive.items[0].document.fields.signer,raw);
 const copy=copyFields(f);assert.equal(copy.signer,raw);assert.equal(copy.signature,f.signature);assert.equal(copy.issueDate,'');assert.deepEqual(f,reopened.fields);
});

test('valid multi-person facts leave canonical body, table, annex and suffix unchanged',()=>{
 let content=contentFromText('正文记录。\n附件\n清单\n附件内容');content=setAnnex(content,content.blocks[1].id);
 content.blocks.push(table(2,2));content.postscript=contentFromText('落款后的原说明');
 const before=structuredClone(content),f=fields({body:contentText(content),postscript:contentText(content.postscript),signer:'姓名甲\n姓名乙\n姓名丙'}),original=structuredClone(f);
 const saved=draft(f,1,'signers-content',undefined,content),restored=validateDraft(saved);assert.deepEqual(restored.content,before);assert.deepEqual(content,before);assert.deepEqual(f,original);
 fieldsForEngine(f,false,content);textContent(f,content);assert.deepEqual(content,before);assert.deepEqual(f,original);
});

test('13 people and invalid controls are preserved in draft with actionable signer problems',()=>{
 for(const raw of [Array(13).fill('姓名甲').join('\n'),'姓名甲\t姓名乙','姓名甲\r姓名乙','姓名甲\u0000姓名乙']){
  const f=fields({signer:raw}),restored=validateDraft(draft(f,0));assert.equal(restored.fields.signer,raw);assert.equal(problems(raw).length,1);assert.match(problems(raw)[0][1],/原输入已保留/);
 }
 assert.match(problems(Array(13).fill('姓名甲').join('\n'))[0][1],/12/);
 assert.match(problems('姓名甲\t姓名乙')[0][1],/制表符/);
 assert.deepEqual(problems('姓名甲\r\n姓名乙'),[]);
});

test('240 total, 60 per person and 12 people bounds are explicit and never truncate',()=>{
 assert.equal(SIGNER_MAX_LENGTH,240);assert.equal(SIGNER_MAX_COUNT,12);assert.equal(SIGNER_NAME_MAX_LENGTH,60);
 assert.deepEqual(problems(Array(12).fill('姓名甲').join('\n')),[]);
 assert.deepEqual(problems('甲'.repeat(60)),[]);assert.match(problems('甲'.repeat(61))[0][1],/60/);
 const max='甲'.repeat(60)+'\n'+'乙'.repeat(60)+'\n'+'丙'.repeat(60)+'\n'+'丁'.repeat(57);assert.equal(max.length,240);assert.deepEqual(problems(max),[]);assert.equal(validateDraft(draft(fields({signer:max}),0)).fields.signer,max);
 const over=max+'丁';assert.match(problems(over)[0][1],/240/);const input=draft(fields({signer:over}),0),before=JSON.stringify(input);assert.throws(()=>validateDraft(input));assert.equal(JSON.stringify(input),before);
});

test('TXT retains all three people in row-major order with reference only on final row',()=>{
 const f=fields({signer:'姓名甲\n姓名乙\n姓名丙',reference:'原文号'});
 for(const letterhead of [false,true]){
  const txt=textContent({...f,letterhead,agency:'原机关'}),head=txt.slice(0,txt.indexOf(f.title));
  assert.ok(head.includes('签发人：姓名甲　　姓名乙\n原文号\t姓名丙'));
  assert.equal((head.match(/原文号/g)||[]).length,1);assert.equal(head.indexOf('姓名甲')<head.indexOf('姓名乙'),true);assert.equal(head.indexOf('姓名乙')<head.indexOf('姓名丙'),true);
 }
});

test('TXT covers even counts, absent reference, duplicate people and unchanged single-person form',()=>{
 assert.equal(textContent(fields({signer:'姓名甲\n姓名乙',reference:'原文号'})).split('\n\n')[0],'原文号\t签发人：姓名甲　　姓名乙');
 const noReference=textContent(fields({signer:'姓名甲\n姓名甲\n姓名乙'})).split('\n\n')[0];assert.equal(noReference,'签发人：姓名甲　　姓名甲\n姓名乙');
 const single=textContent(fields({signer:'姓名甲',reference:'原文号'})).split('\n\n')[0];assert.equal(single,'原文号\t签发人：姓名甲');
 const people=Array.from({length:12},(_,index)=>'姓名'+(index+1));const head=textContent(fields({signer:people.join('\n'),reference:'原文号'})).split('\n\n')[0],rows=head.split('\n');
 assert.equal(rows.length,6);assert.ok(rows[5].startsWith('原文号\t'));for(let i=0;i<6;i++)assert.ok(rows[i].endsWith(people[i*2]+'　　'+people[i*2+1]));
});
