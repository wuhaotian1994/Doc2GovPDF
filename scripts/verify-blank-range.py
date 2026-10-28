from pathlib import Path
import json,zipfile,xml.etree.ElementTree as E,hashlib,re
from pypdf import PdfReader
r=Path(__file__).resolve().parent.parent;q=r/'build/qa/blank-range';W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}';sha=lambda b:hashlib.sha256(b).hexdigest();fixture=json.loads((q/'fixture.json').read_text(encoding='utf8'));expected=[b for b in fixture['content']['blocks'] if b['type']=='table'];report={'method':'Controlled fictional mechanism fixture; not the CEO health-office saved draft','files':[]}
for run in json.loads((q/'report.json').read_text(encoding='utf8')):
 assert run['passed'] and not run['errors'];profile=run['profile'];folder=q/profile;before=(folder/'before-choice.docx').read_bytes();after=(folder/'kept-blanks.docx').read_bytes();assert before==after
 for name in ['before-choice','kept-blanks']:
  path=folder/(name+'.docx')
  with zipfile.ZipFile(path) as z:
   root=E.fromstring(z.read('word/document.xml'));tables=root.findall('.//'+W+'tbl');assert len(tables)==2
   empty=[]
   for table,wanted in zip(tables,expected):
    rows=[[ ''.join(t.text or '' for t in c.findall('.//'+W+'t')) for c in row.findall(W+'tc')] for row in table.findall(W+'tr')];assert rows==[[c['text'] for c in row['cells']] for row in wanted['rows']];empty.append(sum(v=='' for row in rows[1:] for v in row))
   assert empty==[9,20];texts=[''.join(t.text or '' for t in p.findall('.//'+W+'t')) for p in root.findall('.//'+W+'p')]
  pdf=PdfReader(path.with_suffix('.pdf'));pages=[re.sub(r'\s','',p.extract_text() or '') for p in pdf.pages];assert all(re.sub(r'\s','',t) in ''.join(pages) for t in texts if t.strip())
  report['files'].append({'profile':profile,'file':name,'docxSHA256':sha(path.read_bytes()),'pdfSHA256':sha(path.with_suffix('.pdf').read_bytes()),'pages':len(pages),'blankCounts':empty,'relationships':{text:[i+1 for i,page in enumerate(pages) if text in page] for text in ['模拟核对安排','说明：模拟记录只用于本地核验','接收方回执','注：未填写的事实由接收方补充']}})
 changed=json.loads((folder/'changed.draft.json').read_text(encoding='utf8'));grid=[b for b in changed['content']['blocks'] if b['type']=='table'];assert grid[1]['rows'][1]['cells'][1]['text']=='待核事实';assert sum(c['text']=='' for row in grid[1]['rows'][1:] for c in row['cells'])==19
(q/'verified.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report['files'][0],ensure_ascii=False))
