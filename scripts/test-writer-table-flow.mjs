import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
import {contentFromText,contentText,contentBodyForEngine,table,applyBodyContent} from '../web/write-content.js';
const base=content=>({page:{width:210,left:28,right:26},blocks:content.blocks.filter(b=>b.type==='paragraph').map(b=>({paragraph:{id:b.id,text:b.text,role:'body',font:'仿宋',size:16,line:10.21,indent:11.29,align:'both',before:0,after:0}}))});
const make=lines=>{const c=contentFromText(lines.join('\n'));c.blocks.push(table(4,3));return c;};
test('an identified table lead-in includes its unit and prose description without rewriting the draft',()=>{
 const c=make(['无关正文。','附件2（原标号）：业务办理回执','单位名称：________________','本表保留待填位置。填报条件应由经办人核对，不能猜填事实。']),before=structuredClone(c),m=applyBodyContent(base(c),c);
 assert.equal(m.blocks[0].paragraph.keepNext,undefined);for(const b of m.blocks.slice(1,4))assert.equal(b.paragraph.keepNext,true);
 assert.deepEqual(c,before);assert.deepEqual(m.blocks.slice(0,4).map(b=>[b.paragraph.text,b.paragraph.font,b.paragraph.size,b.paragraph.line]),before.blocks.slice(0,4).map(b=>[b.text,'仿宋',16,10.21]));
});
test('a long unrelated narrative and signing are barriers rather than a whole-document keep chain',()=>{
 for(const middle of ['正文。'.repeat(80),'普通长叙述。'.repeat(35)]){const c=make(['附件2：业务回执',middle]),m=applyBodyContent(base(c),c);assert.equal(m.blocks[0].paragraph.keepNext,undefined);assert.equal(m.blocks[1].paragraph.keepNext,undefined);}
 const c=make(['附件2：业务回执','经办单位']);c.blocks[1].role='signature';const m=applyBodyContent(base(c),c);assert.equal(m.blocks[0].paragraph.keepNext,undefined);assert.equal(m.blocks[1].paragraph.keepNext,false);
});
test('only an explicitly related bounded note attaches to the final row and tables still span naturally',()=>{
 for(const [note,keep] of [['注：本表供经办人核对。',true],['上述表格保留填写位置。',true],['另一个话题的普通正文。',false],['注：'+ '较长说明。'.repeat(50),false]]){
  const c=make(['业务回执']);c.blocks.push(...contentFromText(note).blocks);const t=applyBodyContent(base(c),c).blocks.find(b=>b.table).table;
  assert.equal(Boolean(t.rows.at(-1).cells[0].paragraphs[0].keepNext),keep);assert.equal(Boolean(t.rows[1].cells[0].paragraphs[0].keepNext),false);
 }
});
test('post-signature tables get the same bounded lead-in relationship',()=>{
 const c=contentFromText('正文');c.postscript=make(['附件1：办理清单','单位名称：________________','该表为待核对内容。空栏由作者按业务用途保留。']);const m=applyBodyContent(base(c),c);
 const index=m.blocks.findIndex(b=>b.table);for(const b of m.blocks.slice(index-3,index))assert.equal(b.paragraph.keepNext,true);assert.equal(contentText(c),'正文');
});
test('the supplied original has unchanged 39 blocks, three complete grids and both receipt lead-ins', {skip:!process.env.HEALTH_OFFICE_ORIGINAL},()=>{
 const bytes=fs.readFileSync(process.env.HEALTH_OFFICE_ORIGINAL);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),'7dbde2fe81d11c526d8fb73ab143f572e3481500575fb9c0b87b126b9e37972c');
 const saved=JSON.parse(bytes),c=saved.content,before=structuredClone(c),m=applyBodyContent(base(c),c);assert.equal(c.blocks.length,39);
 const positions=c.blocks.flatMap((b,i)=>b.type==='table'?[i]:[]);assert.deepEqual(positions,[25,32,36]);assert.deepEqual(positions.map(i=>[c.blocks[i].rows.length,c.blocks[i].rows[0].cells.length]),[[3,2],[9,5],[5,6]]);
 for(const i of [30,31,33,34,35])assert.equal(m.blocks[i].paragraph.keepNext,true,`original block ${i+1}`);
 assert.equal(m.blocks[25].table.rows.at(-1).cells[0].paragraphs[0].keepNext,true);assert.equal(m.blocks[36].table.rows.at(-1).cells[0].paragraphs[0].keepNext,true);
 assert.deepEqual(c,before);assert.deepEqual(m.blocks.filter(b=>b.table).map(b=>b.table.rows.map(r=>r.cells.map(c=>c.paragraphs.map(p=>p.text).join('\n')))),before.blocks.filter(b=>b.type==='table').map(b=>b.rows.map(r=>r.cells.map(c=>c.text))));
});

test('a one-row header-only table does not bind unrelated prose merely because it is a header',()=>{
 const c=contentFromText('表前正文。');c.blocks.push(table(1,2),...contentFromText('无关后段。').blocks);
 const m=applyBodyContent(base(c),c),t=m.blocks.find(b=>b.table).table;
 assert.equal(Boolean(t.rows[0].cells[0].paragraphs[0].keepNext),false);
 c.blocks.at(-1).text='注：这是该表的说明。';const related=applyBodyContent(base(c),c).blocks.find(b=>b.table).table;
 assert.equal(related.rows[0].cells[0].paragraphs[0].keepNext,true);
});
