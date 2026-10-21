import hashlib,json,re
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
from pypdf import PdfReader
root=Path(__file__).resolve().parent.parent;fixture=json.loads((root/'scripts/fixtures/writer-education-notice.json').read_text('utf-8'));ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'};compact=lambda text:re.sub(r'\s+','',text);results=[]
for profile in ['chrome','firefox','webkit']:
 for kind in ['postscript-receipt','structure-ime']:
  folder=root/'build/qa'/kind/profile;stored=json.loads((folder/'final.json').read_text('utf-8'));word=folder/'final.docx'
  with ZipFile(word) as package:assert package.testzip() is None;doc=ET.fromstring(package.read('word/document.xml'))
  body=doc.find('w:body',ns);actual=compact(''.join(t.text or '' for t in body.findall('.//w:t',ns)));tables=body.findall('w:tbl',ns)
  if kind=='postscript-receipt':
   expected=compact(fixture['title']+'（模拟校阅）'+fixture['reference']+fixture['material'].removeprefix(fixture['title']));assert len(tables)==1
   rows=[[''.join(t.text or '' for t in cell.findall('.//w:t',ns)) for cell in row.findall('w:tc',ns)] for row in tables[0].findall('w:tr',ns)];assert rows==fixture['receiptRows']
   children=list(body);at=children.index(tables[0]);before=''.join(t.text or '' for block in children[:at] for t in block.findall('.//w:t',ns));after=''.join(t.text or '' for block in children[at+1:] for t in block.findall('.//w:t',ns));assert before.index('苏州市教育局')<before.index('2024年6月28日')<before.index('（此件公开发布）')<before.index('参会回执',before.index('（此件公开发布）'));assert compact(after)==compact(''.join(fixture['imprintCells']))
   p=next(p for p in body.findall('w:p',ns) if ''.join(t.text or '' for t in p.findall('.//w:t',ns))=='参会回执');assert p.find('w:pPr/w:jc',ns).get('{'+ns['w']+'}val')=='center';assert '44' in [n.get('{'+ns['w']+'}val') for n in p.findall('.//w:sz',ns)]
   original=json.loads((folder/'original.json').read_text('utf-8'));portable=json.loads((folder/'final.gongwen.json').read_text('utf-8'));assert portable['version']==stored['version']==5 and portable['content']==stored['content'];assert stored['id']==original['id'] and stored['fields']['sourceMaterial']==fixture['material'] and stored['fields']['date']==fixture['authoredDate'] and stored['fields']['signature']==original['fields']['signature'];assert stored['fields']['body']==original['fields']['body'] and stored['fields']['postscript']==original['fields']['postscript']
  else:
   expected=compact(stored['fields']['title']+stored['fields']['body']+stored['fields']['postscript']);assert len(tables)==2;assert stored['version']==5
   for text in ['正文组合输入结束','正文单元格组合输入结束','附注组合输入结束','附注单元格组合输入结束']:assert text in actual
  assert actual==expected,(profile,kind,'Word mismatch',len(actual),len(expected))
  pdf=PdfReader(folder/'final.pdf');text=''.join(re.sub(r'\s*—\s*'+str(i)+r'\s*—\s*$','',page.extract_text() or '') for i,page in enumerate(pdf.pages,1));assert compact(text)==expected,(profile,kind,'PDF mismatch');assert '_table_' not in text
  results.append({'profile':profile,'task':kind,'sourceCharactersWithoutWhitespace':len(expected),'exactSourceOrder':True,'tables':len(tables),'pdfPages':len(pdf.pages),'wordSHA256':hashlib.sha256(word.read_bytes()).hexdigest()})
names=['web/write.js','web/write-engine.js','web/write-content.js','web/write-content-editor.js','web/write-model.js','web/write-checks.js','web/write-library.js','web/write-boot.js','web/browser-api.js','web/write.css','web/write-workspace.css','web/fonts/ui-400.woff','web/fonts/ui-700.woff']
for name in names:assert (root/name).read_bytes()==(root/'build/qa/inline-workspace-web'/name.removeprefix('web/')).read_bytes(),'Stale '+name
html=(root/'web/write.html').read_text('utf-8').replace('<script src="write-boot.js"></script>','<script>'+(root/'web/write-boot.js').read_text('utf-8')+'</script>');assert html==(root/'build/qa/inline-workspace-web/index.html').read_text('utf-8')
record={'cases':results,'sources':{name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in names+['web/write.html']}};(root/'build/qa/postscript-receipt/verified.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),'utf-8');print(json.dumps({'verified':True,'cases':len(results),'pdfPages':sum(r['pdfPages'] for r in results)}))
