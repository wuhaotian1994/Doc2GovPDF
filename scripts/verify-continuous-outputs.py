from pathlib import Path
import json,re,hashlib,zipfile,xml.etree.ElementTree as E
from pypdf import PdfReader
import pdfplumber
r=Path(__file__).resolve().parent.parent;q=r/'build/qa/continuous';W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}';sha=lambda b:hashlib.sha256(b).hexdigest()
def logical(text):return re.sub(r'\s','',re.sub(r'—\s*\d+\s*—','',text))
def doc(path):
 with zipfile.ZipFile(path) as z:parts={n:z.read(n) for n in z.namelist() if not n.endswith('/')}
 root=E.fromstring(parts['word/document.xml']);ps=root.findall('.//'+W+'p');texts=[''.join(t.text or '' for t in p.findall('.//'+W+'t')) for p in ps];return parts,root,ps,texts
source=r/'tmp/unified-word/hebtu-lab-safety.docx';src,srcroot,srcps,srctexts=doc(source);report={'sourceSHA256':sha(source.read_bytes()),'profiles':[],'files':[],'nativeWord':json.loads((q/'chrome/word-native.json').read_text(encoding='utf-8-sig'))}
fixture=json.loads((r/'scripts/fixtures/writer-admissions-plan.json').read_text(encoding='utf8'))
for profile in ['chrome','firefox','webkit']:
 run=json.loads((q/profile/'report.json').read_text(encoding='utf8'));assert run['passed'] and not run['errors'];report['profiles'].append({'profile':profile,'browserVersion':run['browserVersion'],'checks':len(run['checks']),'actualWasmSHA256':sorted(set(run['wasm']))})
 for name in ['clinic','admissions','native-untouched','native-edited']:
  file=q/profile/(name+'.docx');parts,tree,ps,texts=doc(file);reader=PdfReader(file.with_suffix('.pdf'));pdftext=logical(''.join(p.extract_text() for p in reader.pages));assert all(logical(t) in pdftext for t in texts if t.strip()),(profile,name,'PDF content lost')
  if name.startswith('native'):
   assert all(parts[n]==b for n,b in src.items() if n!='word/document.xml');assert len(tree.findall('.//'+W+'tbl'))==2
   if name=='native-untouched':assert file.read_bytes()==source.read_bytes()
   else:
    assert [(i,t) for i,t in enumerate(texts) if t!=srctexts[i]]==[(0,srctexts[0]+'（模拟核阅稿）'),(43,'模拟待核')];assert all(E.tostring(a)==E.tostring(b) for i,(a,b) in enumerate(zip(srcps,ps)) if i not in (0,43));assert file.stat().st_size==36802
    rp=ps[43].find(W+'r/'+W+'rPr');assert rp.find(W+'sz').get(W+'val')=='22' and rp.find(W+'rFonts').get(W+'eastAsia')=='宋体'
    with pdfplumber.open(file.with_suffix('.pdf')) as output:
     target=next(p for p in output.pages if '模拟待核' in (p.extract_text() or ''));word=next(w for w in target.extract_words() if w['text']=='模拟待核');characters=[c for c in target.chars if c['x0']>=word['x0']-.1 and c['x1']<=word['x1']+.1 and abs(c['top']-word['top'])<.2];assert ''.join(c['text'] for c in characters)=='模拟待核' and all(abs(c['size']-11)<.01 for c in characters)
   sizes=[(round(float(p.mediabox.width),1),round(float(p.mediabox.height),1)) for p in reader.pages];assert sizes[:3]==[(595.3,841.9)]*3 and sizes[3:]==[(841.9,595.3)]*2
   for tag in ['tblPr','trPr','tcPr','sectPr']:assert [E.tostring(x) for x in tree.findall('.//'+W+tag)]==[E.tostring(x) for x in srcroot.findall('.//'+W+tag)]
  else:
   draft=json.loads((q/profile/(name+'.draft.json')).read_text(encoding='utf8'));tables=tree.findall('.//'+W+'tbl');assert len(tables)==1;actual=[[''.join(p.itertext()) for p in row.findall(W+'tc')] for row in tables[0].findall(W+'tr')]
   if name=='clinic':
    assert actual==[['物资','账面数量'],['口罩','12箱'],['手套','8箱'],['体温计','5支']],actual
    assert [b['text'] for b in draft['content']['blocks'] if b['type']=='paragraph']==['请于2026年10月23日前核对库存。','账册编号A-17，口罩12箱，手套8箱。','盘点结果报送办公室。','联系人：模拟值班岗。']
    assert draft['content']['blocks'][-1]['text']=='联系人：模拟值班岗。'
    for value in ['账册编号A-17，口罩12箱，手套8箱。','2026年10月23日','模拟社区卫生服务中心办公室','2026年10月22日']:assert value in ''.join(texts)
   else:
    assert actual==fixture['rows'],(profile,name,'56 cells changed');assert len(draft['content']['postscript']['annexes'])==1;assert sum(int(row[2]) for row in actual[1:-1])==9000;assert actual[-1][2]=='9000'
  record={'profile':profile,'file':name,'docxSHA256':sha(file.read_bytes()),'pdfSHA256':sha(file.with_suffix('.pdf').read_bytes()),'pdfPages':len(reader.pages),'tables':len(tree.findall('.//'+W+'tbl'))}
  if profile=='chrome':
   native=next(x for x in report['nativeWord'] if x['file']==name);assert native['sourceSHA256']==record['docxSHA256'];assert native['logicalTextSHA256']==sha(logical(''.join(texts)).encode());record['nativeWordPages']=native['pages']
   if name=='native-edited':assert native['sample']['sizePt']==11 and native['sample']['font']=='宋体'
  report['files'].append(record)
(q/'verified.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print('Verified 12 actual Word/PDF pairs, original source parts/two exact edits, full tables, numbers/dates and native Word binding')
