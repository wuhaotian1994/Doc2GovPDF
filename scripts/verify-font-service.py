from pathlib import Path
import json,hashlib,urllib.request,shutil
from pypdf import PdfReader
r=Path(__file__).resolve().parent.parent;q=r/'build/qa/font-access';e=r/'docs/evidence/font-access';e.mkdir(parents=True,exist_ok=True);sha=lambda b:hashlib.sha256(b).hexdigest()
run=json.loads((q/'report.json').read_text(encoding='utf8'));assert len(run)==3 and all(x['passed'] and not x['errors'] for x in run)
service=json.loads((q/'service-report.json').read_text(encoding='utf8'));assert len(service)==1 and service[0]['passed'] and len(service[0]['checks'])==14
continuity=json.loads((q/'continuous-service/report.json').read_text(encoding='utf8'));assert continuity['passed'] and not continuity['errors'] and len(continuity['checks'])==31
word=json.loads((q/'word-native.json').read_text(encoding='utf-8-sig'));assert word['sourceSHA256']==sha((q/'chrome.docx').read_bytes());assert word['pages']==1
startup=json.loads((q/'startup.txt').read_text(encoding='utf-8-sig').splitlines()[-1]);assert len(startup)==33 and all(x['passed'] for x in startup)
report={'url':'http://127.0.0.1:4173','assets':{},'source':{},'wordBinding':word,'continuity':[],'boundary':'Synthetic permission contracts and OFL bytes; no customer installed-font/permission claim. Custom face PDF/Word identity not equivalent; two actual pages viewed.'};opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
for p in sorted((r/'build/qa/font-access-web').iterdir()):
 if not p.is_file() or p.suffix not in ['.js','.html','.css','.wasm']:continue
 data=opener.open(report['url']+'/'+('' if p.name=='index.html' else p.name),timeout=60).read();assert data==p.read_bytes(),p.name;report['assets'][p.name]=sha(data)
for name in ['write.js','write.html','write-font-source.js','write-font-picker.js']:report['source'][name]=sha((r/'web'/name).read_bytes())
def snapshot(path):
 reader=PdfReader(path);fonts=[]
 for page in reader.pages:
  for ref in page['/Resources'].get('/Font',{}).values():
   f=ref.get_object();d=f.get('/DescendantFonts',[f])[0].get_object().get('/FontDescriptor');d=d.get_object() if d else None
   if d and d.get('/FontFile2'):fonts.append(sha(d['/FontFile2'].get_data()))
 return [([float(v) for v in p.mediabox],sha(p.get_contents().get_data())) for p in reader.pages],sorted(set(fonts))
for name in ['clinic','admissions','native-untouched','native-edited']:
 a=q/'continuous-service'/(name+'.docx');b=r/'build/qa/continuous/chrome'/(name+'.docx');assert a.read_bytes()==b.read_bytes();assert snapshot(a.with_suffix('.pdf'))==snapshot(b.with_suffix('.pdf'));report['continuity'].append({'file':name,'docxSHA256':sha(a.read_bytes()),'sameAsPreviouslyViewed':'Word bytes and PDF content/geometry/embedded-font bytes match continuous-writing representative.'})
report['actualWasmSHA256']=sorted(set(continuity['wasm']));report['passed']=True;(q/'service-verified.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
for name in ['report.json','service-report.json','verified.json','service-verified.json','word-native.json']:shutil.copyfile(q/name,e/name)
(e/'startup.json').write_text(json.dumps(startup,indent=2),encoding='utf8');shutil.copyfile(q/'continuous-service/report.json',e/'continuity-service.json');shutil.copyfile(r/'build/qa/font-source-tests.txt',e/'font-source-tests.txt')
for p in ['chrome-font-settings.png','firefox-font-settings.png','webkit-font-settings.png']:shutil.copyfile(q/p,e/p)
shutil.copyfile(q/'pages/direct-and-word.png',e/'direct-and-word.png');shutil.copyfile(q/'pages/manifest.json',e/'pages.json')
print('Evidence collected:',len(report['assets']),'HTTP assets,',sum(len(x['checks']) for x in run),'font checks +14 service +31 continuity; Word binding and 4 continuity outputs exact')
