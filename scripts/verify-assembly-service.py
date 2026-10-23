from pathlib import Path
import json,hashlib,urllib.request,shutil,re,zipfile,xml.etree.ElementTree as E
from pypdf import PdfReader
r=Path(__file__).resolve().parent.parent;q=r/'build/qa/assembly';e=r/'docs/evidence/draft-first-paste';e.mkdir(parents=True,exist_ok=True);sha=lambda b:hashlib.sha256(b).hexdigest();logical=lambda s:re.sub(r'\s','',s);W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
run=json.loads((q/'report.json').read_text(encoding='utf8'));service=json.loads((q/'service/report.json').read_text(encoding='utf8'));continuity=json.loads((q/'continuous-service/report.json').read_text(encoding='utf8'));assert len(run)==3 and all(x['passed'] and not x['errors'] for x in run);assert service[0]['passed'] and not service[0]['errors'];assert continuity['passed'] and not continuity['errors']
word=json.loads((q/'chrome/word-native.json').read_text(encoding='utf-8-sig'))
for row in word:
 path=q/'chrome'/(row['file']+'.docx');assert row['sourceSHA256']==sha(path.read_bytes())
 with zipfile.ZipFile(path) as z:root=E.fromstring(z.read('word/document.xml'))
 texts=''.join(t.text or '' for t in root.findall('.//'+W+'t'));assert row['logicalTextSHA256']==sha(logical(texts).encode('utf8'))
startup=json.loads((r/'build/qa/assembly-startup.txt').read_text(encoding='utf-8-sig').splitlines()[-1]);assert len(startup)==33 and all(x['passed'] for x in startup)
reminders=json.loads((r/'build/qa/ceo-001/result.json').read_text(encoding='utf8'));assert sum(len(x['checks']) for x in reminders)==66
for suffix,folder in [('v4','inline-recovery'),('v5','inline-recovery-v5')]:
 result=json.loads((r/'build/qa'/folder/'result.json').read_text(encoding='utf8'));assert all(x['passed'] and not x['errors'] for x in result);shutil.copyfile(r/'build/qa'/folder/'result.json',e/('recovery-'+suffix+'.json'))
report={'url':'http://127.0.0.1:4173','assets':{},'source':{},'outputs':[],'nativeWord':word,'method':'Fictional equivalents, not user private material; actual UI/data plus original download and Word/PDF verification.'};opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
for p in sorted((r/'build/qa/assembly-web').iterdir()):
 if not p.is_file() or p.suffix not in ['.js','.html','.css','.wasm']:continue
 data=opener.open(report['url']+'/'+('' if p.name=='index.html' else p.name),timeout=60).read();assert data==p.read_bytes(),p.name;report['assets'][p.name]=sha(data)
for name in ['write.js','write.html','write-checks.js','write-content-editor.js','write-workspace.css','write-assembly.js','write-assembly-view.js']:report['source'][name]=sha((r/'web'/name).read_bytes())
def snapshot(path):
 reader=PdfReader(path);fonts=[]
 for p in reader.pages:
  for ref in p['/Resources'].get('/Font',{}).values():
   f=ref.get_object();d=f.get('/DescendantFonts',[f])[0].get_object().get('/FontDescriptor');d=d.get_object() if d else None
   if d and d.get('/FontFile2'):fonts.append(sha(d['/FontFile2'].get_data()))
 return [([float(v) for v in p.mediabox],sha(p.get_contents().get_data())) for p in reader.pages],sorted(set(fonts))
for name in ['safe','mixed','annex']:
 a=q/'service/chrome'/(name+'.docx');b=q/'chrome'/(name+'.docx');assert a.read_bytes()==b.read_bytes();assert snapshot(a.with_suffix('.pdf'))==snapshot(b.with_suffix('.pdf'));report['outputs'].append({'file':name,'docxSHA256':sha(a.read_bytes()),'same':'Word bytes and PDF page/content/embedded-font bytes match currently viewed assembly representative'})
for name in ['clinic','admissions','native-untouched','native-edited']:
 a=q/'continuous-service'/(name+'.docx');b=r/'build/qa/continuous/chrome'/(name+'.docx');assert a.read_bytes()==b.read_bytes();assert snapshot(a.with_suffix('.pdf'))==snapshot(b.with_suffix('.pdf'));report['outputs'].append({'file':name,'docxSHA256':sha(a.read_bytes()),'same':'Word bytes and PDF page/content/embedded-font bytes match previously viewed continuous representative'})
manifest=json.loads((q/'pages/manifest.json').read_text(encoding='utf8'));assert len(manifest['pages'])==8
for row in manifest['pages']:assert row['pdfSHA256']==sha((q/'chrome'/row['file']).read_bytes())
report['actualWasmSHA256']=sorted(set(continuity['wasm']));report['passed']=True;(q/'service-verified.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
for name in ['report.json','verified.json','service-verified.json','fixtures.json']:shutil.copyfile(q/name,e/name)
shutil.copyfile(q/'service/report.json',e/'service-report.json');shutil.copyfile(q/'continuous-service/report.json',e/'continuity-service.json');shutil.copyfile(q/'chrome/word-native.json',e/'word-native.json');shutil.copyfile(q/'pages/manifest.json',e/'pages.json');shutil.copyfile(r/'build/qa/assembly-node.txt',e/'node-tests.txt')
for name in manifest['groups']:shutil.copyfile(q/'pages'/name,e/name)
for name in ['draft-first-question.png','closing-confirmed.png']:shutil.copyfile(q/'service/chrome'/name,e/name)
(e/'startup.json').write_text(json.dumps(startup,indent=2),encoding='utf8');(e/'reminders.json').write_text(json.dumps(reminders,indent=2),encoding='utf8');print(json.dumps({'browserChecks':sum(len(x['checks']) for x in run),'serviceChecks':len(service[0]['checks']),'continuousChecks':len(continuity['checks']),'assets':len(report['assets']),'pages':len(manifest['pages'])}))
