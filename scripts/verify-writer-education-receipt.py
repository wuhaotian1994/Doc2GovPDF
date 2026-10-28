import hashlib,json,re
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
from pypdf import PdfReader
root=Path(__file__).resolve().parent.parent
fixture=json.loads((root/'scripts/fixtures/writer-education-notice.json').read_text('utf-8'))
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
compact=lambda text:''.join(text.split())
expected=compact(fixture['title']+fixture['reference']+fixture['material'].removeprefix(fixture['title']))
results=[]
for profile in ['chrome','firefox','webkit']:
 folder=root/'build/qa/ceo-002-education'/profile
 for variant in ['guided','copied','receipt']:
  word=folder/(variant+'.docx')
  with ZipFile(word) as package:
   assert package.testzip() is None
   doc=ET.fromstring(package.read('word/document.xml'))
  body=doc.find('w:body',ns)
  actual=compact(''.join(t.text or '' for t in body.findall('.//w:t',ns)))
  assert actual==expected,(profile,variant,'Word source mismatch',len(actual),len(expected))
  tables=body.findall('w:tbl',ns)
  assert len(tables)==(1 if variant=='receipt' else 0)
  if tables:
   rows=[[''.join(t.text or '' for t in cell.findall('.//w:t',ns)) for cell in row.findall('w:tc',ns)] for row in tables[0].findall('w:tr',ns)]
   assert rows==fixture['receiptRows'],(profile,'Receipt rows changed')
   children=list(body);at=children.index(tables[0])
   before=''.join(t.text or '' for block in children[:at] for t in block.findall('.//w:t',ns))
   after=''.join(t.text or '' for block in children[at+1:] for t in block.findall('.//w:t',ns))
   assert '参会回执' in before and '（此件公开发布）' in before
   assert compact(''.join(fixture['imprintCells']))==compact(after)
  pdf=PdfReader(folder/(variant+'.pdf'))
  text='\n'.join(re.sub(r'\s*—\s*'+str(i)+r'\s*—\s*$','',page.extract_text() or '') for i,page in enumerate(pdf.pages,1))
  assert compact(text)==expected,(profile,variant,'PDF source mismatch',len(compact(text)),len(expected))
  original=json.loads((folder/'guided-fields.json').read_text('utf-8'))
  copied=json.loads((folder/'current.gongwen.json').read_text('utf-8'))
  assert original['fields']==copied['fields']
  assert original['fields']['date']==fixture['authoredDate'] and original['fields']['sourceMaterial']==fixture['material']
  results.append({'profile':profile,'variant':variant,'charactersWithoutWhitespace':len(actual),'exactSourceOrder':True,'tables':len(tables),'pdfPages':len(pdf.pages),'wordXMLSHA256':hashlib.sha256(ET.tostring(doc)).hexdigest()})
sources=['web/write-model.js','web/browser-api.js','web/workspace-ui.js','web/write.js','web/index.html','web/write.html','web/write-boot.js']
build=root/'build/qa/ceo-002-education-web'
for name in sources:
 target={'web/index.html':'advanced.html','web/write.html':'index.html'}.get(name,name.removeprefix('web/'))
 if name=='web/write.html':
  expected_html=(root/name).read_text('utf-8').replace('<script src="write-boot.js"></script>','<script>'+(root/'web/write-boot.js').read_text('utf-8')+'</script>')
  assert expected_html==(build/target).read_text('utf-8'),'Stale inline boot HTML'
 else:assert (root/name).read_bytes()==(build/target).read_bytes(),'Stale build '+name
record={'source':fixture['source'],'sourceCharactersWithoutWhitespace':len(compact(fixture['material'])),'referenceCharacters':len(compact(fixture['reference'])),'cases':results,'sources':{name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in sources}}
(root/'build/qa/ceo-002-education/verified.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),'utf-8')
print(json.dumps({'verified':True,'cases':len(results),'characters':len(expected),'pdfPages':sum(r['pdfPages'] for r in results)}))
