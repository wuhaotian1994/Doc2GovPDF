from pathlib import Path
import json,hashlib,urllib.request,shutil,subprocess
from pypdf import PdfReader
r=Path(__file__).resolve().parent.parent;q=r/'build/qa/continuous';sha=lambda b:hashlib.sha256(b).hexdigest()
old=json.loads((r/'tmp/continuous-viewed-manifest.json').read_text(encoding='utf8'));current=json.loads((q/'pages/manifest.json').read_text(encoding='utf8'));assert old==current,'Current page renders differ from viewed representatives; inspect before delivery'
run=json.loads((q/'service/report.json').read_text(encoding='utf8'));assert run['passed'] and not run['errors'];assert len(run['checks'])==len(json.loads((q/'chrome/report.json').read_text(encoding='utf8'))['checks'])
result={'url':'http://127.0.0.1:4173','assets':{},'source':{},'outputs':[],'viewedPages':len(current['pages']),'viewedImagesStillExact':True}
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
for p in sorted((r/'build/qa/continuous-web').iterdir()):
 if not p.is_file() or p.suffix not in ['.js','.css','.html','.wasm']:continue
 data=opener.open(result['url']+'/'+('' if p.name=='index.html' else p.name),timeout=60).read();assert data==p.read_bytes(),p.name;result['assets'][p.name]=sha(data)
for p in sorted((r/'web').iterdir()):
 if p.is_file() and p.suffix in ['.js','.css','.html']:result['source'][p.name]=sha(p.read_bytes())
def snapshot(path):
 reader=PdfReader(path);fonts=[]
 for page in reader.pages:
  for ref in page['/Resources'].get('/Font',{}).values():
   font=ref.get_object();descriptor=font.get('/FontDescriptor');descriptor=descriptor.get_object() if descriptor else None
   if descriptor and descriptor.get('/FontFile2'):fonts.append(sha(descriptor['/FontFile2'].get_data()))
 return [([float(v) for v in p.mediabox],sha(p.get_contents().get_data())) for p in reader.pages],sorted(set(fonts))
for name in ['clinic','admissions','native-untouched','native-edited']:
 a=q/'service'/(name+'.docx');b=q/'chrome'/(name+'.docx');assert a.read_bytes()==b.read_bytes(),name;assert snapshot(a.with_suffix('.pdf'))==snapshot(b.with_suffix('.pdf')),name
 result['outputs'].append({'name':name,'docxSHA256':sha(a.read_bytes()),'verified':'Exact Word bytes and PDF page geometry, uncompressed content and embedded font bytes match viewed representatives.'})
result['actualWasmSHA256']=sorted(set(run['wasm']));result['passed']=True
(q/'service-verified.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
e=r/'docs/evidence/continuous-writing';e.mkdir(parents=True,exist_ok=True)
for name in ['verified.json','service-verified.json']:shutil.copyfile(q/name,e/name)
for profile in ['chrome','firefox','webkit','service']:
 shutil.copyfile(q/profile/'report.json',e/(profile+'.json'))
for name in current['groups']:shutil.copyfile(q/'pages'/name,e/name)
shutil.copyfile(q/'pages/manifest.json',e/'pages.json');shutil.copyfile(q/'chrome/word-native.json',e/'word-native.json')
for name in ['01-short-workspace.png','02-native-writing.png']:shutil.copyfile(q/'service'/name,e/name)
for name,source in [('reminders.json',r/'build/qa/ceo-001/result.json'),('recovery-v4.json',r/'build/qa/inline-recovery/result.json'),('recovery-v5.json',r/'build/qa/inline-recovery-v5/result.json')]:shutil.copyfile(source,e/name)
startup=json.loads((q/'startup.txt').read_text(encoding='utf-8-sig').splitlines()[-1]);assert len(startup)==33 and all(v['passed'] for v in startup);(e/'startup.json').write_text(json.dumps(startup,indent=2),encoding='utf8')
for name in ['go-test.txt','node-final.txt']:shutil.copyfile(q/name,e/name)
print(json.dumps({'profiles':[(p,len(json.loads((q/p/'report.json').read_text(encoding='utf8'))['checks'])) for p in ['chrome','firefox','webkit','service']],'assets':len(result['assets']),'pages':len(current['pages']),'reminders':sum(len(x['checks']) for x in json.loads((e/'reminders.json').read_text(encoding='utf8'))),'recovery':[sum(len(x['checks']) for x in json.loads((e/name).read_text(encoding='utf8'))) for name in ['recovery-v4.json','recovery-v5.json']]}))
