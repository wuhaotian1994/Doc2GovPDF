from pathlib import Path
import json,hashlib,urllib.request
from pypdf import PdfReader
r=Path(__file__).resolve().parent.parent;q=r/'build/qa/native-format';sha=lambda b:hashlib.sha256(b).hexdigest();report={'url':'http://127.0.0.1:4173','assets':{},'outputs':[]}
run=json.loads((q/'service/report.json').read_text(encoding='utf8'));baseline=json.loads((q/'chrome/report.json').read_text(encoding='utf8'));assert run['passed'] and not run['errors'] and set(run['wasm'])==set(baseline['wasm'])
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
for name in ['index.html','write.js','write-bytes.js','write-model.js','write-word-workspace.js','engine-worker.js','document-engine.wasm']:
 data=opener.open(report['url']+'/'+('' if name=='index.html' else name),timeout=30).read();assert data==(r/'build/qa/native-format-web'/name).read_bytes();report['assets'][name]=sha(data)
def snapshot(path):
 reader=PdfReader(path);fonts=[]
 for p in reader.pages:
  for ref in p['/Resources'].get('/Font',{}).values():
   f=ref.get_object();d=f.get('/FontDescriptor');d=d.get_object() if d else None
   if d and d.get('/FontFile2'):fonts.append(sha(d['/FontFile2'].get_data()))
 return [([float(x) for x in p.mediabox],sha(p.get_contents().get_data())) for p in reader.pages],sorted(set(fonts))
for name in ['untouched','edited','restored','legacy-restored','saved-new-admissions']:
 a=q/'service'/(name+'.docx');b=q/'chrome'/(name+'.docx');assert a.read_bytes()==b.read_bytes(),name
 if name!='restored':assert snapshot(a.with_suffix('.pdf'))==snapshot(b.with_suffix('.pdf')),name
 report['outputs'].append({'name':name,'docxSHA256':sha(a.read_bytes()),'verified':'Exact Word bytes; PDF page geometry, uncompressed content and embedded font bytes match viewed representative.' if name!='restored' else 'Exact restored Word bytes.'})
report['passed']=True;(q/'service-verified.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print('Service modules and actual Wasm bytes, five Word files and four PDF content/font/page snapshots match verified assets')
