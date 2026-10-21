import hashlib,json,re
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
from pypdf import PdfReader
root=Path(__file__).resolve().parent.parent
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
compact=lambda text:''.join(text.split())
results=[]
for profile in ['chrome','firefox','webkit']:
 folder=root/'build/qa/ceo-review-recovery'/profile
 restored=json.loads((folder/'restored.json').read_text('utf-8'));fields=restored['fields']
 assert fields['reference']=='街办发 [2026] 005号'
 assert restored['review']['documentId']==restored['id'] and restored['review']['keys']
 expected=[fields['title'],fields['reference'],fields['body']]
 if profile=='chrome':
  with ZipFile(folder/'restored.docx') as package:
   assert package.testzip() is None;doc=ET.fromstring(package.read('word/document.xml'))
  paragraphs=[''.join(t.text or '' for t in p.findall('.//w:t',ns)) for p in doc.findall('w:body/w:p',ns)]
  assert list(filter(None,paragraphs))==expected
  assert fields['reference'] in (folder/'restored.txt').read_text('utf-8-sig')
 pdf=PdfReader(folder/'restored.pdf')
 text='\n'.join(re.sub(r'\s*—\s*'+str(i)+r'\s*—\s*$','',page.extract_text() or '') for i,page in enumerate(pdf.pages,1))
 assert compact(text)==compact(''.join(expected)),profile
 assert len(pdf.pages)==1
 results.append({'profile':profile,'originalReferenceRetained':True,'latestTitleAndBodyExact':True,'pdfPages':len(pdf.pages)})
names=['web/write-model.js','web/write-checks.js','web/write.js','web/write-boot.js','web/fonts/ui-400.woff','web/fonts/ui-700.woff']
for name in names:assert (root/name).read_bytes()==(root/'build/qa/ceo-review-web'/name.removeprefix('web/')).read_bytes(),'Stale build '+name
record={'cases':results,'sources':{name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in names}}
(root/'build/qa/ceo-review-recovery/verified.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),'utf-8')
print(json.dumps({'verified':True,'cases':len(results),'pdfPages':sum(r['pdfPages'] for r in results)}))
