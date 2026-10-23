import hashlib,json,re
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
from pypdf import PdfReader
root=Path(__file__).resolve().parent.parent
fixture=json.loads((root/'scripts/fixtures/writer-hospital-notice.json').read_text('utf-8'))
compact=lambda text:''.join(text.split());ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
expected=compact(fixture['raw']);results=[]
for profile,variant in [('chrome-baseline','as-copied'),('chrome-baseline','tidied'),('chrome','tidied'),('firefox','tidied'),('webkit','tidied')]:
 folder=root/'build/qa/ceo-hospital'/profile/variant
 fields=json.loads((folder/'fields.json').read_text('utf-8'))['fields']
 assert fields['sourceMaterial']==fixture['raw'] and not fields['recipient'] and not fields['signature'] and not fields['date']
 assert fields['body']==('\n\n' if variant=='as-copied' else '\n').join(fixture['paragraphs'])
 with ZipFile(folder/'notice.docx') as package:
  assert package.testzip() is None;doc=ET.fromstring(package.read('word/document.xml'))
 paragraphs=[''.join(t.text or '' for t in p.findall('.//w:t',ns)) for p in doc.findall('w:body/w:p',ns)]
 assert [compact(text) for text in paragraphs if compact(text)]==[compact(text) for text in [fixture['title'],*fixture['paragraphs']]]
 pdf=PdfReader(folder/'notice.pdf')
 pages=[compact(re.sub(r'\s*—\s*'+str(i)+r'\s*—\s*$','',page.extract_text() or '')) for i,page in enumerate(pdf.pages,1)]
 assert ''.join(pages)==expected,(profile,variant)
 assert compact((folder/'notice.txt').read_text('utf-8-sig'))==expected
 assert (folder/'source.txt').read_text('utf-8')==fixture['raw']
 exception_pages=[next(i for i,page in enumerate(pages,1) if compact(note) in page) for note in fixture['paragraphs'][-3:]]
 if variant=='tidied':assert len(set(exception_pages))==1,'Do not split important exceptions into separate trailing pages'
 results.append({'profile':profile,'variant':variant,'exactParagraphOrder':True,'sourceCharactersWithoutWhitespace':len(expected),'pdfPages':len(pages),'exceptionPages':exception_pages,'wordSHA256':hashlib.sha256((folder/'notice.docx').read_bytes()).hexdigest()})
names=['web/write-materials.js','web/write.js','web/write-model.js','web/write-checks.js','web/fonts/ui-400.woff','web/fonts/ui-700.woff']
for name in names:assert (root/name).read_bytes()==(root/'build/qa/ceo-hospital-web'/name.removeprefix('web/')).read_bytes(),'Stale build '+name
html=(root/'web/write.html').read_text('utf-8').replace('<script src="write-boot.js"></script>','<script>'+(root/'web/write-boot.js').read_text('utf-8')+'</script>')
assert html==(root/'build/qa/ceo-hospital-web/index.html').read_text('utf-8')
record={'source':fixture['source'],'cases':results,'sources':{name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in names+['web/write.html']}}
(root/'build/qa/ceo-hospital/verified.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),'utf-8')
print(json.dumps({'verified':True,'cases':len(results),'pdfPages':sum(r['pdfPages'] for r in results),'paragraphs':len(fixture['paragraphs'])}))
