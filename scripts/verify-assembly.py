from pathlib import Path
import json,re,zipfile,hashlib,xml.etree.ElementTree as E
from pypdf import PdfReader
r=Path(__file__).resolve().parent.parent;q=r/'build/qa/assembly';W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}';sha=lambda b:hashlib.sha256(b).hexdigest();logical=lambda s:re.sub(r'\s','',s)
report={'profiles':[],'files':[],'inputBoundary':'Fictional equivalents, not the user screenshot or private original.'};fixture=json.loads((q/'fixtures.json').read_text(encoding='utf8'))
for run in json.loads((q/'report.json').read_text(encoding='utf8')):
 assert run['passed'] and not run['errors'];profile=run['profile'];report['profiles'].append({'profile':profile,'checks':len(run['checks'])});folder=q/profile
 for name in ['safe','mixed','annex']:
  file=folder/(name+'.docx')
  with zipfile.ZipFile(file) as z:root=E.fromstring(z.read('word/document.xml'))
  texts=[''.join(t.text or '' for t in p.findall('.//'+W+'t')) for p in root.findall('.//'+W+'p')];alltext=''.join(texts);tables=root.findall('.//'+W+'tbl');assert len(tables)==1
  cells=[[''.join(t.text or '' for t in c.findall('.//'+W+'t')) for c in row.findall(W+'tc')] for row in tables[0].findall(W+'tr')];assert cells==[['项目','数量'],['口罩','12箱'],['手套','']],cells
  for value in ['关于开展模拟资料核对的通知','模拟办公室','说明：空白由接收方填写。']:assert logical(alltext).count(logical(value))==1,(profile,name,value)
  assert 'A-17' in alltext and alltext.count('12箱')==2
  assert '2022年10月22日' in alltext if name=='mixed' else '2026年10月22日' in alltext
  assert ('补充核阅：' in alltext)==(name=='mixed');assert ('（模拟办〔2021〕08号）' in alltext)==(name=='mixed')
  for ui in ['原文与核对说明','拟放在落款','未自动认作联合署名','此处判断']:assert ui not in alltext
  if name=='annex':assert '模拟物资清单' in alltext and root.find('.//'+W+'pageBreakBefore') is not None
  pdf=PdfReader(file.with_suffix('.pdf'));pages=[logical(p.extract_text() or '') for p in pdf.pages];assert all(logical(t) in ''.join(pages) for t in texts if t.strip())
  if name=='mixed':assert '（模拟办〔2021〕08号）' in ''.join(pages) and '2022年10月22日' in ''.join(pages)
  if name=='annex':assert '模拟物资清单' in pages[1] and len(pages)==2
  assert file.read_bytes()==(q/'chrome'/(name+'.docx')).read_bytes()
  report['files'].append({'profile':profile,'file':name,'docxSHA256':sha(file.read_bytes()),'pdfSHA256':sha(file.with_suffix('.pdf').read_bytes()),'pages':len(pages),'table':cells})
 saved=json.loads((folder/'final.gongwen.json').read_text(encoding='utf8'));assert saved['fields']['sourceMaterial']==fixture['mixed'];assert saved['fields']['date']=='2022-10-22' and saved['fields']['signature']=='模拟办公室';assert any('writer.material.year' in key for key in saved['review']['keys']);assert (folder/'original.txt').read_text(encoding='utf8')==fixture['mixed']
(q/'verified.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print('Verified 9 actual Word/PDF pairs, author edits, original years/identifiers, table blanks and source/review recovery')
