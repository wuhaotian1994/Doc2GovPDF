import test from 'node:test';
import assert from 'node:assert/strict';
import {blank} from '../web/write-model.js';
import {reviewItems,resolveSource,ReviewDecisions} from '../web/write-checks.js';
const fields=(signer='甲甲\n部份\n乙乙',reference='试办〔2020〕1号')=>({...blank(),title:'仅供机制核对',body:'原正文保持',signer,reference});
const model=(f)=>{const names=f.signer.split(/\r?\n/).filter(x=>x.trim()).map(x=>x.trim());return {blocks:names.reduce((rows,name,i)=>{if(i%2===0)rows.push({paragraph:{id:'row-'+i,role:'signer',text:(i+2>=names.length?f.reference.trim():'')+'\t'+(i===0?'签发人：':'')+'\t'+names.slice(i,i+2).join('\t'),font:'楷体',size:16}});return rows;},[])};};
const finding=(m,row,replacement,rule='word.variant')=>({version:'joint-test',issues:[{id:'finding-'+row,paragraphId:m.blocks[row].paragraph.id,rule,severity:'review',message:'核对原写法',original:m.blocks[row].paragraph.text,replacement,basis:'controlled'}]});
const item=(m,f,row,replacement,rule)=>reviewItems(m,finding(m,row,replacement,rule),f,'joint-doc')[0];

test('second signer correction resolves to the second authored line instead of the generated row',()=>{
 const f=fields(),m=model(f),entry=item(m,f,0,m.blocks[0].paragraph.text.replace('部份','部分'));
 assert.equal(entry.source.field,'signer');assert.equal(entry.source.text,'部份');assert.equal(entry.source.count,1);assert.deepEqual(resolveSource(entry.source,f),{text:'部份',start:3,end:5,line:2});
});
test('blank lines, author whitespace and CRLF retain exact source offsets',()=>{
 const f=fields('\r\n 甲甲 \r\n\r\n 部份 \r\n乙乙'),m=model(f),entry=item(m,f,0,m.blocks[0].paragraph.text.replace('部份','部分'));
 assert.equal(entry.source.text,' 部份 ');const line=resolveSource(entry.source,f);assert.equal(line.line,4);assert.equal(f.signer.slice(line.start,line.end),' 部份 ');
});
test('identically named people in separate tab slots keep separate author identity',()=>{
 const f=fields('同名人\n同名人\n末人'),m=model(f),text=m.blocks[0].paragraph.text,start=text.indexOf('同名人'),second=text.lastIndexOf('同名人');
 const a=item(m,f,0,text.slice(0,start)+'同名者'+text.slice(start+3)),b=item(m,f,0,text.slice(0,second)+'同名者'+text.slice(second+3));
 assert.equal(a.source.occurrence,1);assert.equal(b.source.occurrence,2);assert.equal(resolveSource(a.source,f).line,1);assert.equal(resolveSource(b.source,f).line,2);assert.notEqual(a.key,b.key);
 assert.equal(resolveSource(a.source,{...f,signer:'同名人\n另一人\n末人'}),null,'changed duplicate counts must not transfer a judgment');
});
test('last-row reference correction targets reference even though it shares the third person row',()=>{
 const f=fields(undefined,'部份办〔2020〕1号'),m=model(f),entry=item(m,f,1,m.blocks[1].paragraph.text.replace('部份','部分'));
 assert.equal(entry.source.field,'reference');assert.equal(resolveSource(entry.source,f).text,f.reference);
 const person=item(m,f,1,m.blocks[1].paragraph.text.replace('乙乙','丙丙'));assert.equal(person.source.field,'signer');assert.equal(resolveSource(person.source,f).line,3);
});
test('cross-field changes or absent replacement do not invent a single author location',()=>{
 const f=fields(undefined,'部份办〔2020〕1号'),m=model(f),entry=item(m,f,1,m.blocks[1].paragraph.text.replace('部份','部分').replace('乙乙','丙丙'));
 assert.equal(entry.source,null);assert.equal(entry.scope,'document');assert.equal(item(m,f,0,'').source,null);
});
test('mismatched generated author order cannot produce a trusted source anchor',()=>{
 const f=fields(),m=model(f);m.blocks[0].paragraph.text='\t签发人：\t部份\t甲甲';const entry=item(m,f,0,m.blocks[0].paragraph.text.replace('部份','部分'));assert.equal(entry.source,null);
});
test('per-line retention saves and restores while unrelated body edits preserve it',()=>{
 const f=fields(),m=model(f),entry=item(m,f,0,m.blocks[0].paragraph.text.replace('部份','部分')),state=new ReviewDecisions();state.set(entry,true);const saved=state.snapshot('joint-doc'),restored=new ReviewDecisions();
 assert.ok(saved);restored.restore(saved,{...f,body:'只有正文另作修订'},'joint-doc');assert.equal(restored.has(entry),true);restored.retain({...f,signer:'甲甲\n部分\n乙乙'},'joint-doc');assert.equal(restored.has(entry),false);
});
test('existing single signer combined reference maps to the same exact one-line source',()=>{
 const f=fields('部份'),m={blocks:[{paragraph:{id:'single',role:'reference',text:f.reference+'\t签发人：部份'}}]},entry=item(m,f,0,m.blocks[0].paragraph.text.replace('部份','部分'));
 assert.equal(entry.source.field,'signer');assert.equal(entry.source.text,'部份');assert.equal(entry.source.occurrence,1);assert.equal(entry.source.count,1);assert.equal(resolveSource(entry.source,f).line,1);
});
