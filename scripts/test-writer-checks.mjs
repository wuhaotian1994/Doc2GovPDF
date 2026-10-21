import test from 'node:test';
import assert from 'node:assert/strict';
import {blank} from '../web/write-model.js';
import {sourceLines,reviewItems,ReviewDecisions,resolveSource} from '../web/write-checks.js';
const issue=(id,paragraphId,extra={})=>({id,paragraphId,rule:'number.unit-space',severity:'review',message:'数值与单位需要核对',original:'电池容量为10kg。',basis:'单位书写规范',...extra});
const paragraph=(id,text,role='body')=>({paragraph:{id,text,role,size:16,font:'仿宋'}});
const fields=(body='电池容量为10kg。')=>({...blank(),title:'测试标题',body});
const model=(body='电池容量为10kg。')=>({page:{width:210,height:297},blocks:[paragraph('p0','测试标题','title'),...body.split('\n').map((text,i)=>paragraph('p'+(i+1),text))]});
const inspection=issues=>({version:'0.2.0',issues});
function items(f=fields(),m=model(),issues=[issue('old','p1')],documentId='draft-a'){return reviewItems(m,inspection(issues),f,documentId);}

test('line offsets preserve CRLF, blank lines, emoji and identical occurrences',()=>{
  const body='😀开头\r\n\r\n电池容量为10kg。\r\n电池容量为10kg。';
  assert.deepEqual(sourceLines(body).map(p=>body.slice(p.start,p.end)),['😀开头','','电池容量为10kg。','电池容量为10kg。']);
  const f=fields(body),m={blocks:[paragraph('a','😀开头'),paragraph('b',''),paragraph('c','电池容量为10kg。'),paragraph('d','电池容量为10kg。')]};
  const [a,b]=items(f,m,[issue('a','c'),issue('b','d')]);
  assert.equal(resolveSource(a.source,f).line,3);assert.equal(resolveSource(b.source,f).line,4);assert.notEqual(a.key,b.key);
});
test('title and unrelated body edits retain a decision and export the current engine ID',()=>{
  const ledger=new ReviewDecisions();const [before]=items();ledger.set(before,true);
  const f={...fields('无关前言。\n电池容量为10kg。'),title:'新标题'};
  ledger.retain(f,'draft-a');
  const [after]=items(f,model(f.body),[issue('new-digest-id','p2')]);
  assert.deepEqual([...ledger.reconcile([after])],['new-digest-id']);
});
test('editing a reviewed paragraph revokes immediately, including edit-then-undo before reinspection',()=>{
  const ledger=new ReviewDecisions();ledger.set(items()[0],true);
  ledger.retain(fields('电池容量为11kg。'),'draft-a');ledger.retain(fields(),'draft-a');
  assert.equal(ledger.reconcile(items()).size,0);
});
test('identical paragraphs are separate decisions; ambiguous duplicate changes revoke both',()=>{
  const f=fields('电池容量为10kg。\n电池容量为10kg。'),m=model(f.body);
  const entries=items(f,m,[issue('a','p1'),issue('b','p2')]),ledger=new ReviewDecisions();ledger.set(entries[1],true);
  assert.deepEqual([...ledger.reconcile(entries)],['b']);
  ledger.retain(fields('电池容量为10kg。'),'draft-a');assert.equal(ledger.receipts.size,0);
});
test('moving indistinguishable paragraphs into different context never transfers confirmation',()=>{
  const f=fields('甲段\n电池容量为10kg。\n乙段\n电池容量为10kg。\n丙段');
  const ledger=new ReviewDecisions();ledger.set(items(f,model(f.body),[issue('a','p2')])[0],true);
  ledger.retain(fields('乙段\n电池容量为10kg。\n甲段\n电池容量为10kg。\n丙段'),'draft-a');assert.equal(ledger.receipts.size,0);
});
test('rule severity, basis, proposed text, paragraph formatting and inspection version are decision dependencies',()=>{
  for(const change of [{basis:'新依据'},{replacement:'电池容量为10 kg。'},{severity:'error'},{message:'提醒已变化'}]){
    const ledger=new ReviewDecisions();ledger.set(items()[0],true);assert.equal(ledger.reconcile(items(fields(),model(),[issue('new','p1',change)])).size,0);
  }
  const ledger=new ReviewDecisions();ledger.set(items()[0],true);
  const m=model();m.blocks[1].paragraph.role='heading';assert.equal(ledger.reconcile(items(fields(),m)).size,0);
  ledger.set(items()[0],true);assert.equal(ledger.reconcile(reviewItems(model(),{version:'new',issues:[issue('new','p1')]},fields(),'draft-a')).size,0);
});
test('cross-paragraph rules revoke when related content changes even if the flagged paragraph stays unchanged',()=>{
  const f=fields('全市产值为10万元。\n全市产值为20万元。');const m=model(f.body);
  const entry=issue('a','p2',{rule:'number.repeated-metric',original:'全市产值为20万元。'});
  const ledger=new ReviewDecisions();ledger.set(items(f,m,[entry])[0],true);
  const changed=fields('全市产值为15万元。\n全市产值为20万元。');ledger.retain(changed,'draft-a');
  assert.equal(ledger.receipts.size,0);
});
test('switching drafts, disappearing findings and explicit unchecking clear decisions',()=>{
  const ledger=new ReviewDecisions();const [entry]=items();ledger.set(entry,true);ledger.set(entry,false);assert.equal(ledger.receipts.size,0);
  ledger.set(entry,true);ledger.retain(fields(),'draft-b');assert.equal(ledger.receipts.size,0);
  ledger.set(entry,true);ledger.reconcile([]);assert.equal(ledger.receipts.size,0);
});
test('reference, signature, attachment and copy-to findings resolve to the authored field, not body',()=>{
  const f={...fields(),reference:'综办[2026]01号',signature:'办公室',attachments:'\n第一份\n  第二份\n',copyTo:'有关单位'};
  const m={blocks:[paragraph('r',f.reference,'reference'),paragraph('s',f.signature,'signature'),paragraph('a','附件：1. 第一份','attachment-description'),paragraph('b','2. 第二份','attachment-description'),paragraph('c','抄送：有关单位','imprint')]};
  const entries=items(f,m,['r','s','b','c'].map((id)=>issue(id,id)));
  assert.deepEqual(entries.map(e=>e.source.field),['reference','signature','attachments','copyTo']);
  assert.equal(resolveSource(entries[2].source,f).start,f.attachments.indexOf('  第二份'));
});
