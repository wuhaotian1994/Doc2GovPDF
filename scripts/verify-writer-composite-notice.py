import hashlib,json,re
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
from pypdf import PdfReader
root=Path(__file__).resolve().parent.parent
fixture=json.loads((root/'scripts/fixtures/writer-composite-notice.json').read_text('utf-8'))
compact=lambda text:''.join(text.split());ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
results=[]
for profile in ['chrome','firefox','webkit']:
 folder=root/'build/qa/ceo-composite'/profile
 for variant in ['guided','composite']:
  with ZipFile(folder/(variant+'.docx')) as package:
   assert package.testzip() is None;doc=ET.fromstring(package.read('word/document.xml'))
  paragraphs=doc.findall('w:body/w:p',ns)
  text=lambda p:''.join(t.text or '' for t in p.findall('.//w:t',ns))
  actual=[compact(text(p)) for p in paragraphs if compact(text(p))]
  assert actual==list(map(compact,fixture['lines'])),(profile,variant,'Word content order changed')
  def find(value):return next(p for p in paragraphs if compact(text(p))==compact(value))
  def align(p):return p.find('w:pPr/w:jc',ns).get('{'+ns['w']+'}val')
  if variant=='composite':
   assert align(find('国务院办公厅'))=='right' and align(find('2025年1月9日'))=='right'
   title=find(fixture['innerTitle']);assert align(title)=='center'
   assert '44' in [node.get('{'+ns['w']+'}val') for node in title.findall('.//w:sz',ns)]
   assert align(find(fixture['title']))=='center'
  pdf=PdfReader(folder/(variant+'.pdf'))
  pages=[compact(re.sub(r'\s*—\s*'+str(i)+r'\s*—\s*$','',page.extract_text() or '')) for i,page in enumerate(pdf.pages,1)]
  assert ''.join(pages)==compact(fixture['raw']),(profile,variant,'PDF order changed')
  locations={name:next(i for i,page in enumerate(pages,1) if compact(value) in page) for name,value in [('outerDate','2025年1月9日'),('deletionMarker','（本文有删减）'),('innerTitle',fixture['innerTitle']),('lastItem','（十八）维护良好市场秩序。')]}
  assert locations['outerDate']<=locations['deletionMarker']<=locations['innerTitle']<=locations['lastItem']
  results.append({'profile':profile,'variant':variant,'charactersWithoutWhitespace':len(compact(fixture['raw'])),'exactSourceOrder':True,'pdfPages':len(pages),'locations':locations,'wordSHA256':hashlib.sha256((folder/(variant+'.docx')).read_bytes()).hexdigest()})
names=['web/write-materials.js','web/write.js','web/write-model.js','web/write-checks.js','web/workspace-ui.js','web/browser-api.js']
for name in names:assert (root/name).read_bytes()==(root/'build/qa/ceo-composite-web'/name.removeprefix('web/')).read_bytes(),'Stale build '+name
(root/'build/qa/ceo-composite/verified.json').write_text(json.dumps({'source':fixture['source'],'cases':results,'sources':{name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in names}},ensure_ascii=False,indent=2),'utf-8')
print(json.dumps({'verified':True,'cases':len(results),'pdfPages':sum(r['pdfPages'] for r in results)}))
