import test from 'node:test';import assert from 'node:assert/strict';
import {contentFromText,table,contentText,validateContent} from '../web/write-content.js';
import {setAnnex} from '../web/write-annexes.js';
import {captureTextTableSelection as capture,previewTextTable as preview,applyTextTable as apply} from '../web/write-text-table.js';
// Controlled model regressions only. None is the unavailable CEO 529-block
// saved manuscript, nor evidence of recovering a source table's geometry.
const ids=(prefix='made')=>{let i=0;return()=>prefix+'-'+ ++i;};
const text=lines=>contentFromText(lines.join('\n'),ids('p'));
const select=(c,a,b,opts={})=>capture(c,{startIndex:a,endIndex:b},opts);
const rows=(columns,extra={})=>({mode:'rows',columns,header:false,...extra});

test('explicit columns preserve exact numeric, whitespace and empty paragraph strings without touching surrounding prose',()=>{
 const c=text(['前文。','  12.50万元 ','','A-17','后文。']),before=structuredClone(c),p=preview(c,select(c,1,3),rows(3)),next=apply(c,p,ids());
 assert.deepEqual(p.rows,[['  12.50万元 ','','A-17']]);assert.equal(p.tables[0].header,false);assert.deepEqual(c,before);
 assert.deepEqual(next.blocks.filter(b=>b.type==='paragraph'),[before.blocks[0],before.blocks[4]]);assert.deepEqual(next.blocks[1].rows[0].cells.map(c=>c.text),p.rows[0]);
});
test('an incomplete final row remains its original paragraph instead of receiving invented cells',()=>{
 const c=text(['1','2','3','4','余文仍在']),p=preview(c,select(c,0,4),rows(2)),next=apply(c,p,ids());
 assert.deepEqual(p.rows,[['1','2'],['3','4']]);assert.deepEqual(p.retainedOriginal,[{id:c.blocks[4].id,index:4,text:'余文仍在',reason:'remainder'}]);assert.deepEqual(next.blocks.at(-1),c.blocks.at(-1));assert.ok(!p.addedTrailingParagraph);
});
test('skipped middle prose remains between separate tables and each run retains its own incomplete tail',()=>{
 const c=text(['H1','H2','保留说明。','D1','D2','未满一行']),selection=select(c,0,5),includeIDs=selection.ids.filter(id=>id!==c.blocks[2].id),p=preview(c,selection,rows(2,{includeIDs})),next=apply(c,p,ids());
 assert.equal(p.tables.length,2);assert.deepEqual(p.rows,[]);assert.deepEqual(next.blocks.map(b=>b.type==='table'?'TABLE':b.text),['TABLE','保留说明。','TABLE','未满一行']);assert.deepEqual(p.retainedOriginal.map(r=>r.reason),['excluded','remainder']);assert.equal(next.blocks[1].id,c.blocks[2].id);
});
test('header action derives displayed columns from explicitly chosen fields and creates only the requested new empty rows',()=>{
 const c=text(['姓名','年龄','联系电话']),p=preview(c,select(c,0,2),{mode:'header',blankRows:4}),next=apply(c,p,ids());
 assert.equal(p.options.columns,3);assert.deepEqual(p.rows,[['姓名','年龄','联系电话'],['','',''],['','',''],['','',''],['','','']]);assert.equal(next.blocks[0].header,true);assert.equal(next.blocks.at(-1).text,'');assert.ok(p.addedTrailingParagraph);assert.match(p.warnings.join(' '),/不是恢复原表几何/);assert.equal(contentText(c),'姓名\n年龄\n联系电话');
});
test('header fields cannot move across skipped prose and explicit conflicting column counts are rejected',()=>{
 const c=text(['姓名','保留说明。','电话']),s=select(c,0,2);
 assert.throws(()=>preview(c,s,{mode:'header',blankRows:2,includeIDs:[s.ids[0],s.ids[2]]}),/原第 2 段.*未选的非空文字/);assert.throws(()=>preview(c,s,{mode:'header',columns:2,blankRows:2}),/所选完整段落/);
});
test('no method, columns, header interpretation, blank-row count or candidate selection is silently guessed',()=>{
 const c=text(['甲','乙']),s=select(c,0,1);
 for(const o of [{columns:2,header:false},{mode:'rows',header:false},{mode:'rows',columns:2},{mode:'header'},{mode:'header',blankRows:0}])assert.throws(()=>preview(c,s,o));
 const p=preview(c,s,rows(2,{includeIDs:[]}));assert.equal(p.canApply,false);assert.equal(p.retainedOriginal.length,2);assert.throws(()=>apply(c,p,ids()));
});
test('partial paragraphs are rejected while the next paragraph at offset zero is correctly excluded',()=>{
 const c=text(['甲😀乙','第二行','第三行']),b=c.blocks;
 assert.throws(()=>capture(c,{start:{block:b[0].id,offset:1},end:{block:b[1].id,offset:b[1].text.length}}),/完整段落/);
 assert.throws(()=>capture(c,{start:{block:b[0].id,offset:0},end:{block:b[1].id,offset:1}}),/完整段落/);
 assert.deepEqual(capture(c,{start:{block:b[0].id,offset:0},end:{block:b[2].id,offset:0}}).ids,[b[0].id,b[1].id]);
});
test('old or edited previews cannot apply to changed, reordered or tampered content',()=>{
 const c=text(['甲','乙','保留']),p=preview(c,select(c,0,1),rows(2));
 for(const edit of [v=>v.blocks[0].text='新值',v=>v.blocks[2].text='无关范围也已变化',v=>v.blocks.reverse()]){const v=structuredClone(c);edit(v);assert.throws(()=>apply(v,p,ids()),/已有变化/);}
 const changed=structuredClone(p);changed.rows[0][0]='不能偷偷替换';assert.throws(()=>apply(c,changed,ids()),/预览已变化/);
});
test('a table is a selection barrier and discontiguous identities cannot expand the range',()=>{
 const c=text(['前','后']);c.blocks.splice(1,0,table(2,2,'',ids('old-grid')));
 assert.throws(()=>select(c,0,2),/已有表格/);assert.throws(()=>capture(c,{ids:[c.blocks[0].id,c.blocks[2].id]}),/连续/);
});
test('annex markers, their gap and title remain protected while ordinary fields inside the annex can be organized',()=>{
 let c=text(['正文','附件1','','附件标题','姓名','电话','尾文']);c=setAnnex(c,c.blocks[1].id);
 for(const [a,b] of [[1,1],[2,2],[3,3],[0,4]])assert.throws(()=>select(c,a,b),/附件/);
 const p=preview(c,select(c,4,5),{mode:'header',blankRows:2}),next=apply(c,p,ids());assert.deepEqual(next.annexes,c.annexes);assert.deepEqual(next.blocks.slice(0,4),c.blocks.slice(0,4));assert.equal(next.blocks[4].type,'table');
});
test('body and suffix paths preserve the other section, and a section-only suffix uses its stricter limit',()=>{
 const c=text(['正文']);c.postscript=contentFromText('姓名\n电话',ids('suffix'));
 const p=preview(c,select(c,0,1,{region:'postscript'}),{mode:'header',blankRows:2}),next=apply(c,p,ids());assert.deepEqual(next.blocks,c.blocks);assert.equal(next.postscript.blocks[0].type,'table');
 const part=preview(c.postscript,select(c.postscript,0,1,{region:'postscript',sectionOnly:true}),{mode:'header',blankRows:2});assert.equal(apply(c.postscript,part,ids()).blocks[0].type,'table');
 const full=contentFromText('x'.repeat(3990)+'\nA\nB',ids());assert.throws(()=>preview(full,select(full,1,2,{region:'postscript',sectionOnly:true}),{mode:'header',blankRows:99}),/4000/);
});
test('row, column, cell and total-body limits reject impossible lossless placement',()=>{
 const many=text(Array(101).fill('值'));assert.throws(()=>preview(many,select(many,0,100),rows(1)),/100行/);assert.throws(()=>preview(many,select(many,0,10),rows(11)),/10列/);assert.throws(()=>preview(many,select(many,0,10),{mode:'header',blankRows:1}),/10个字段/);
 const long=text(['x'.repeat(10001)]);assert.throws(()=>preview(long,select(long,0,0),rows(1)),/过长/);
 const full=text(['x'.repeat(99980),'A','B']);assert.throws(()=>preview(full,select(full,1,2),{mode:'header',blankRows:99}),/100000/);
});
test('the 1000-block limit includes the required continuation paragraph and rejects unsafe new IDs',()=>{
 const c=text(Array(1000).fill('A'));assert.throws(()=>preview(c,select(c,999,999),rows(1)),/1000/);
 const small=text(['A','B']),p=preview(small,select(small,0,1),rows(2));assert.throws(()=>apply(small,p,()=>small.blocks[0].id),/定位信息/);assert.deepEqual(contentText(small),'A\nB');
});
test('an unrelated existing tail table is not changed by organizing earlier text',()=>{
 const c=text(['A','B']);c.blocks.push(table(2,2,'',ids('existing')));const p=preview(c,select(c,0,1),rows(2)),next=apply(c,p,ids());assert.equal(next.blocks.length,2);assert.deepEqual(next.blocks.at(-1),c.blocks.at(-1));assert.equal(p.addedTrailingParagraph,false);
});

test('row organization conserves every original string and order across varied explicit subsets',()=>{
 for(let columns=1;columns<=5;columns++)for(let mask=0;mask<8;mask++){
  const values=['保留前文',...Array.from({length:13},(_,i)=>i%4===0?'':`值-${i}-12.50`),'保留后文'],c=text(values),s=select(c,1,13),includeIDs=s.source.filter((item,i)=>mask===0||(i+mask)%4!==0).map(item=>item.id),p=preview(c,s,rows(columns,{includeIDs}));
  if(!p.canApply)continue;const next=apply(c,p,ids()),actual=next.blocks.flatMap(b=>b.type==='paragraph'?[b.text]:b.rows.flatMap(r=>r.cells.map(cell=>cell.text)));assert.deepEqual(actual,values);assert.deepEqual(contentText(c),values.join('\n'));
 }
});
test('malformed multi-line paragraphs and forged out-of-bounds captures are rejected rather than split or expanded',()=>{
 const c=text(['A','B']),bad=structuredClone(c);bad.blocks[0].text='一段\n不可猜拆';assert.throws(()=>select(bad,0,0),/段落设置无效/);assert.equal(bad.blocks[0].text,'一段\n不可猜拆');
 const p=preview(c,select(c,0,1),rows(2)),tampered=structuredClone(p);tampered.selection.endIndex=999;assert.throws(()=>apply(c,tampered,ids()),/范围已失效/);
 assert.throws(()=>preview(c,select(c,0,1),{mode:'header',blankRows:100}),/99行/);
});


test('six selected header fields can span ten excluded blank paragraphs while five tail labels stay outside the new four-row receipt',()=>{
 const fields=['字段甲','字段乙','字段丙','字段丁','字段戊','字段己'],gaps=['',' ','\t','　','  ','','\u00a0','\t ','','　 '],tail=['领队','/','队员1','队员1','队员1'],values=[];
 fields.forEach((field,i)=>{values.push(field);if(i<5)values.push(gaps[i*2],gaps[i*2+1]);});values.push(...tail);
 const c=text(values),before=structuredClone(c),s=select(c,0,c.blocks.length-1),includeIDs=s.source.filter(item=>fields.includes(item.text)).map(item=>item.id),p=preview(c,s,{mode:'header',blankRows:4,includeIDs}),next=apply(c,p,ids());
 assert.equal(p.tables.length,1);assert.equal(p.options.columns,6);assert.deepEqual(p.rows[0],fields);assert.deepEqual(p.rows.slice(1),Array.from({length:4},()=>Array(6).fill('')));
 const originals=c.blocks.filter(block=>!includeIDs.includes(block.id));assert.equal(originals.length,15);assert.deepEqual(next.blocks.filter(block=>block.type==='paragraph'),originals);assert.deepEqual(p.retainedOriginal.map(item=>item.text),originals.map(block=>block.text));
 assert.equal(p.retainedOriginal.filter(item=>item.reason==='header-gap').length,10);assert.equal(p.retainedOriginal.filter(item=>item.reason==='excluded').length,5);assert.match(p.warnings.join(' '),/10段未选空白.*原字符串和段落标识.*新表之后/);assert.equal(p.addedTrailingParagraph,false);assert.deepEqual(c,before);
 // The existing editor's one history snapshot receives this unchanged source.
 assert.deepEqual(s.ids,c.blocks.map(block=>block.id));assert.deepEqual(p.usedIDs,includeIDs);
});
test('excluded nonempty text inside selected header fields names its blocking paragraph and an actionable safe alternative',()=>{
 const c=text(['前文','甲',' ','不能跳过的正文','乙','领队']),s=select(c,1,5),includeIDs=[c.blocks[1].id,c.blocks[4].id];
 assert.throws(()=>preview(c,s,{mode:'header',blankRows:4,includeIDs}),error=>{assert.match(error.message,/原第 4 段.*未选的非空文字/);assert.match(error.message,/分开组织.*明确勾选/);return true;});assert.deepEqual(contentText(c),'前文\n甲\n \n不能跳过的正文\n乙\n领队');
});
test('unselected blank prefix and tail remain excluded rather than being consumed as header gaps or new cells',()=>{
 const c=text(['',' A ',' ','B','　','领队','/','队员1']),s=select(c,0,7),p=preview(c,s,{mode:'header',blankRows:1,includeIDs:[c.blocks[1].id,c.blocks[3].id]}),next=apply(c,p,ids());
 assert.deepEqual(p.rows,[[' A ','B'],['','']]);assert.equal(p.retainedOriginal.filter(item=>item.reason==='header-gap').length,1);assert.deepEqual(next.blocks.filter(block=>block.type==='paragraph'),c.blocks.filter((_,i)=>![1,3].includes(i)));
});
test('whitespace-gap header previews still reject changed snapshots and strict suffix capacity overflow',()=>{
 const c=text(['A','','B','领队']),s=select(c,0,3),opts={mode:'header',blankRows:4,includeIDs:[s.ids[0],s.ids[2]]},p=preview(c,s,opts),changed=structuredClone(c);changed.blocks[1].text=' ';
 assert.throws(()=>apply(changed,p,ids()),/已有变化/);
 const suffix=text(['x'.repeat(3990),'A','','B']),ss=select(suffix,1,3,{region:'postscript',sectionOnly:true});assert.throws(()=>preview(suffix,ss,{mode:'header',blankRows:99,includeIDs:[ss.ids[0],ss.ids[2]]}),/4000/);
});
test('row mode retains its original disjoint-run protection even for blank gaps',()=>{
 const c=text(['A','','B']),s=select(c,0,2),p=preview(c,s,rows(2,{includeIDs:[s.ids[0],s.ids[2]]}));assert.equal(p.canApply,false);assert.equal(p.tables.length,0);assert.deepEqual(p.retainedOriginal.map(item=>item.reason),['remainder','excluded','remainder']);
});

