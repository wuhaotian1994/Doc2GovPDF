// Independent verification of the Go-produced DOCX using upstream's readers.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),up=path.join(root,'tmp/upstream-samples/gongwen-kit-d8dfe6a24e20ecaa64c14f3a79159813ad92db70'),out=path.join(root,'build/qa/upstream-parity');
const JSZip=require(path.join(up,'node_modules/jszip')),{acceptAll,rejectAll}=require(path.join(up,'lib/fix/revisions')),{textOf}=require(path.join(up,'lib/table-read')),{decode}=require(path.join(up,'lib/fix/runs'));
const checkDoc=require(path.join(up,'checks/check-doc')),{scan}=require(path.join(up,'checks/style-scan'));
const paras=xml=>(xml.match(/<w:p(?:\s[^>]*)?>(?:(?!<w:p[\s>])[\s\S])*?<\/w:p>/g)||[]).map(p=>decode(textOf(p)));
(async()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(out,'manifest.json'),'utf8')),original=path.join(out,manifest.files.find(f=>f.name==='messy.docx').path);
 const source=await JSZip.loadAsync(fs.readFileSync(original)),fixed=await JSZip.loadAsync(fs.readFileSync(path.join(out,'go-messy-reviewed.docx')));
 const a=await source.file('word/document.xml').async('string'),b=await fixed.file('word/document.xml').async('string');
 assert.deepEqual(paras(rejectAll(b,'Doc2GovPDF')),paras(a),'Go changes cannot be rejected to original text');
 assert.equal((a.match(/w:author="审核人"/g)||[]).length,(b.match(/w:author="审核人"/g)||[]).length,'other author revisions changed');
 const links=xml=>xml.match(/<w:hyperlink\b[\s\S]*?<\/w:hyperlink>/g)||[];
 assert.deepEqual(links(b),links(a),'hyperlink markup changed');
 const accepted=acceptAll(b,'Doc2GovPDF');fixed.file('word/document.xml',accepted);const file=path.join(out,'go-accepted.docx');fs.writeFileSync(file,await fixed.generateAsync({type:'nodebuffer'}));
 const hits=checkDoc.check(file,await checkDoc.readDocx(file));assert.equal(hits.length,0,JSON.stringify(hits));
 const style=scan(paras(accepted).join('\n'));assert.equal(style.norm.length,0,JSON.stringify(style.norm));
 const comments=await fixed.file('word/comments.xml').async('string');assert.ok(comments.includes('合计')&&comments.includes('列举'),'numeric doubts missing from comments');
 fs.writeFileSync(path.join(out,'go-repair-verification.json'),JSON.stringify({passed:true,checks:['upstream rejection restores original text','other authors retained','hyperlink markup unchanged','upstream convention checks after acceptance','upstream normative style after acceptance','numeric comments retained']},null,2));
 console.log('PASS: upstream readers independently verified Go repair, rejection, protected content and numeric comments.');
})().catch(e=>{console.error(e);process.exitCode=1});
