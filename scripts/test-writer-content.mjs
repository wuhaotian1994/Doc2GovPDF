import test from 'node:test';import assert from 'node:assert/strict';
import {contentFromText,contentText,validateContent,table,applyBodyContent,contentBodyForEngine,resolveContentSource,splitContentParagraph,mergeContentParagraph,moveContentBlock} from '../web/write-content.js';
import {blank,draft,validateDraft,fieldsForEngine,applySignature} from '../web/write-model.js';
import {archiveDocument,validateLibrary} from '../web/write-library.js';
const ids=()=>{let n=0;return()=>`id-${++n}`;};
const base=body=>({page:{width:210,left:28,right:26},blocks:[{paragraph:{id:'title',text:'通知',role:'title',size:22}},{paragraph:{id:'recipient',text:'各部门：',role:'recipient'}},...body.split('\n').map((text,i)=>({paragraph:{id:'p'+i,text,role:'body',font:'仿宋',size:16,line:10.21,indent:11.29,align:'both'}})),{paragraph:{id:'signature',text:'原落款',role:'signature'}},{paragraph:{id:'date',text:'2026年10月21日',role:'date'}}]});
test('body structure preserves exact paragraphs and a table in the requested middle position',()=>{
 const next=contentFromText('前段 12.50 元\n\n后段保留',ids());const grid=table(3,3,'工作安排',()=>crypto.randomUUID());grid.rows[0].cells.forEach((cell,i)=>cell.text=['事项','责任人','时间'][i]);next.blocks.splice(2,0,grid);
 assert.equal(contentText(validateContent(next)),'前段 12.50 元\n\n工作安排\n事项\t责任人\t时间\n\t\t\n\t\t\n后段保留');
 const model=applyBodyContent(base(contentBodyForEngine(next)),next);assert.deepEqual(model.blocks.map(b=>b.table?'table':b.paragraph.text),['通知','各部门：','前段 12.50 元','','table','后段保留','原落款','2026年10月21日']);assert.equal(model.blocks[4].table.rows.length,3);
 assert.deepEqual(next.blocks[0].text,'前段 12.50 元');
});
test('explicit paragraph roles and minimal format overrides do not relocate authored content',()=>{
 const content=contentFromText('机关\n2025年1月9日\n（本文有删减）\n措施标题\n正文',ids());content.blocks[0].role='signature';content.blocks[1].role='date';Object.assign(content.blocks[3],{role:'title',after:'half'});Object.assign(content.blocks[4],{align:'left',indent:'none',before:'one'});
 const model=applyBodyContent(base(contentBodyForEngine(content)),content),paragraphs=model.blocks.filter(b=>b.paragraph).map(b=>b.paragraph);
 assert.deepEqual(paragraphs.slice(2,7).map(p=>p.text),['机关','2025年1月9日','（本文有删减）','措施标题','正文']);assert.equal(paragraphs[2].align,'right');assert.equal(paragraphs[5].size,22);assert.equal(paragraphs[5].align,'center');assert.equal(paragraphs[5].after,5.105);assert.equal(paragraphs[6].indent,0);assert.equal(paragraphs[6].before,10.21);
});
test('split merge and move retain author text and keep table boundaries explicit',()=>{
 const original=contentFromText('甲乙\n后段',ids());const split=splitContentParagraph(original,original.blocks[0].id,1,()=> 'split-id');assert.equal(contentText(split),'甲\n乙\n后段');const merged=mergeContentParagraph(split,'split-id');assert.equal(contentText(merged),'甲乙\n后段');assert.equal(contentText(original),'甲乙\n后段');
 assert.equal(contentText(moveContentBlock(original,original.blocks[1].id,-1)),'后段\n甲乙');const withTable=structuredClone(original);withTable.blocks.splice(1,0,table(1,1));assert.throws(()=>mergeContentParagraph(withTable,withTable.blocks[2].id));
});
test('paragraph and cell reminder sources survive unrelated edits but reject changed text or style',()=>{
 const content=contentFromText('正文10kg\n后段',ids()),grid=table(2,2);grid.rows[1].cells[1].text='重量10kg\n原文12.50元';content.blocks.splice(1,0,grid);const model=applyBodyContent(base(contentBodyForEngine(content)),content),sources=Object.values(model._writerSources),paragraphSource=sources.find(s=>s.text==='正文10kg'),cellSource=sources.find(s=>s.text==='原文12.50元');
 assert.equal(resolveContentSource(cellSource,content).start,'重量10kg\n'.length);const next=structuredClone(content);next.blocks[2].text='无关后段修改';assert.ok(resolveContentSource(paragraphSource,next));assert.ok(resolveContentSource(cellSource,next));next.blocks[0].align='center';assert.equal(resolveContentSource(paragraphSource,next),null);next.blocks[1].rows[1].cells[1].text='重量10kg\n原文13.50元';assert.equal(resolveContentSource(cellSource,next),null);
});
test('only-table documents discard the internal engine placeholder and never fabricate text',()=>{
 const content=validateContent({version:1,blocks:[table(2,2)]}),model=applyBodyContent(base(contentBodyForEngine(content)),content);assert.equal(model.blocks.filter(b=>b.table).length,1);assert.ok(!model.blocks.some(b=>b.paragraph?.text==='_table_'));assert.equal(model.blocks.at(-1).paragraph.text,'2026年10月21日');
});
test('invalid structure, duplicate identities and over-limit table shapes fail before changing content',()=>{
 const content=contentFromText('原稿完整',ids());for(const mutate of [c=>c.blocks.push({...c.blocks[0]}),c=>c.blocks[0].role='unknown',c=>c.blocks[0].text='不应\n混为一段']){const candidate=structuredClone(content);mutate(candidate);assert.throws(()=>validateContent(candidate));assert.equal(contentText(content),'原稿完整');}
 assert.throws(()=>table(101,2));assert.throws(()=>table(2,11));const malformed=table(2,2);malformed.rows[1].cells.pop();assert.throws(()=>validateContent({version:1,blocks:[malformed]}));
});
test('version four keeps table structure and exact text in the original portable and archived draft',()=>{
 const content=contentFromText('前段\n后段',ids()),grid=table(2,2);grid.rows[0].cells[0].text='事项';content.blocks.splice(1,0,grid);
 const saved=draft({...blank(),title:'当前稿',signature:'办公室'},1,'same-draft',undefined,content),restored=validateDraft(JSON.parse(JSON.stringify(saved)));
 assert.equal(restored.version,4);assert.equal(restored.id,'same-draft');assert.deepEqual(restored.content,content);assert.equal(restored.fields.body,contentText(content));
 const library=validateLibrary(archiveDocument({version:1,items:[]},'same-draft',saved));assert.deepEqual(library.items[0].document.content,content);
 assert.equal(fieldsForEngine(saved.fields,false,content).body,'前段\n后段');
 assert.throws(()=>validateDraft({...saved,fields:{...saved.fields,body:'不能丢弃表格只取这个文字'}}));assert.throws(()=>validateDraft({...saved,content:null}));
});
test('inner signing roles are applied after footer authoring and never removed as an empty footer',()=>{
 const content=contentFromText('机关\n2025年1月9日\n措施标题',ids());content.blocks[0].role='signature';content.blocks[1].role='date';content.blocks[2].role='title';
 const fields={...blank(),title:'外层通知',body:contentText(content)};const model=applyBodyContent(applySignature(base(contentBodyForEngine(content)),fields),content);
 assert.deepEqual(model.blocks.filter(b=>b.paragraph?.role==='signature').map(b=>b.paragraph.text),['机关']);assert.ok(model.blocks.some(b=>b.paragraph?.text==='措施标题'&&b.paragraph.role==='title'));
});
test('blank tables are still authored structure and do not disappear from the library',()=>{
 const content=validateContent({version:1,blocks:[table(2,2)]}),saved=draft(blank(),1,'blank-table',undefined,content),library=archiveDocument({version:1,items:[]},'blank-table',saved);
 assert.equal(library.items.length,1);assert.equal(library.items[0].document.content.blocks[0].type,'table');
 const empty=contentFromText('',ids()),model=applyBodyContent(base(contentBodyForEngine(empty)),empty);assert.ok(!model.blocks.some(b=>b.paragraph?.text==='_table_'));
});
test('merging never silently joins numeric or Latin tokens and splitting preserves emoji boundaries',()=>{
 for(const [text,expected] of [['值为1\n00万元','值为1 00万元'],['Read\nOnly','Read Only']]){const content=contentFromText(text,ids());assert.equal(contentText(mergeContentParagraph(content,content.blocks[1].id)),expected);}
 const content=contentFromText('甲😀乙',ids()),split=splitContentParagraph(content,content.blocks[0].id,2,()=> 'emoji-split');assert.equal(split.blocks[0].text,'甲😀');assert.equal(split.blocks[1].text,'乙');
});
