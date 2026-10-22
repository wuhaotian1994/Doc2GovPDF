from pathlib import Path
import json,hashlib,zipfile,re,xml.etree.ElementTree as E,io
from pypdf import PdfReader
import pdfplumber
import struct
def font_names(data):
 count=struct.unpack_from(">H",data,4)[0];off=next(struct.unpack_from(">I",data,12+i*16+8)[0] for i in range(count) if data[12+i*16:16+i*16]==b"name");_,n,store=struct.unpack_from(">HHH",data,off);names=set()
 for i in range(n):
  platform,encoding,lang,name,length,start=struct.unpack_from(">HHHHHH",data,off+6+i*12)
  if name in (1,2,6):names.add(data[off+store+start:off+store+start+length].decode("utf-16-be" if platform in (0,3) else "mac_roman",errors="replace"))
 return sorted(names)
r=Path(__file__).resolve().parent.parent;q=r/'build/qa/native-format';W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
def sha(b):return hashlib.sha256(b).hexdigest()
def doc(p):
 with zipfile.ZipFile(p) as z:parts={name:z.read(name) for name in z.namelist() if not name.endswith('/')}
 root=E.fromstring(parts['word/document.xml']);paras=root.findall('.//'+W+'p');texts=[''.join(t.text or '' for t in x.findall('.//'+W+'t')) for x in paras]
 return parts,root,paras,texts
def logical(s):return re.sub(r'\s','',re.sub(r'—\s*\d+\s*—','',s))
def pdf(p):
 reader=PdfReader(p);sizes=[(round(float(x.mediabox.width),1),round(float(x.mediabox.height),1)) for x in reader.pages];fonts=[]
 for page in reader.pages:
  for ref in page['/Resources'].get('/Font',{}).values():
   f=ref.get_object();d=f.get('/FontDescriptor');d=d.get_object() if d else None
   if not d:continue
   stream=d.get('/FontFile2');font=stream.get_object().get_data() if stream else None
   names=font_names(font) if font else []
   if names not in fonts:fonts.append(names)
 return reader,sizes,fonts
source=r/'tmp/unified-word/hebtu-lab-safety.docx';src,tree,paras,texts=doc(source);report={'sourceSHA256':sha(source.read_bytes()),'files':[],'nativeWord':json.loads((q/'word-native.json').read_text(encoding='utf-8-sig'))};assert report['sourceSHA256']=='bae60c771f57218b93d2b383d08a26ac025a119b872ca634e01630382a2230b1'
for profile in ['before','chrome','firefox','webkit']:
 run=json.loads((q/profile/'report.json').read_text(encoding='utf8'));assert run['passed'] and not run['errors'];report.setdefault('browserRuns',[]).append({'profile':profile,'browserVersion':run['browserVersion'],'checks':len(run['checks']),'wasmSHA256':list(set(run['wasm']))})
 for label in ['untouched','edited','restored']:
  path=q/profile/(label+'.docx');parts,root,ps,ts=doc(path)
  assert all(parts[n]==b for n,b in src.items() if n!='word/document.xml')
  if label=='untouched':assert path.read_bytes()==source.read_bytes()
  else:
   assert [(i,t) for i,t in enumerate(ts) if t!=texts[i]]==[(0,texts[0]+'（模拟核阅稿）'),(43,'模拟待核')]
   assert all(E.tostring(a)==E.tostring(b) for i,(a,b) in enumerate(zip(paras,ps)) if i not in (0,43)),(profile,label,'unrelated paragraphs changed')
   for tag in ['tblPr','trPr','tcPr','sectPr']:
    assert [E.tostring(x) for x in root.findall('.//'+W+tag)]==[E.tostring(x) for x in tree.findall('.//'+W+tag)]
   if profile!='before':
    rp=ps[43].find(W+'r/'+W+'rPr');assert rp.find(W+'sz').get(W+'val')=='22' and rp.find(W+'rFonts').get(W+'eastAsia')=='宋体'
  if label=='restored':assert path.read_bytes()==(q/profile/'edited.docx').read_bytes();continue
  reader,sizes,fonts=pdf(q/profile/(label+'.pdf'));out=logical(''.join(p.extract_text() for p in reader.pages));assert all(logical(t) in out for t in ts if t.strip()),(profile,label,'text missing')
  portrait=len(sizes)-2;assert portrait>=1 and sizes[:portrait]==[(595.3,841.9)]*portrait and sizes[portrait:]==[(841.9,595.3)]*2
  sample=[]
  with pdfplumber.open(q/profile/(label+'.pdf')) as pages:
   for i,p in enumerate(pages.pages):
    if label=='edited' and '模拟待核' in (p.extract_text() or ''):
     word=next(w for w in p.extract_words() if w['text']=='模拟待核');chars=[c for c in p.chars if c['x0']>=word['x0']-.1 and c['x1']<=word['x1']+.1 and abs(c['top']-word['top'])<.2];assert ''.join(c['text'] for c in chars)=='模拟待核';assert all(abs(c['size']-(16 if profile=='before' else 11))<.01 for c in chars);sample=[{'page':i+1,'text':''.join(c['text'] for c in chars),'sizePt':chars[0]['size'],'requestedFont':next(p for b in json.loads((q/profile/(label+'.model.json')).read_text(encoding='utf8'))['blocks'] if 'table' in b for row in b['table']['rows'] for cell in row['cells'] for p in cell['paragraphs'] if p['id']=='p43')['font']}]
   assert sum(len(p.lines) for p in pages.pages)>100
  report['files'].append({'profile':profile,'file':label,'docxSHA256':sha(path.read_bytes()),'pdfSHA256':sha((q/profile/(label+'.pdf')).read_bytes()),'pdfPages':len(reader.pages),'pageSizes':sizes,'embeddedTrueTypeNames':fonts,'sample':sample})
 if profile!='before':
  path=q/profile/'legacy-restored.docx';parts,root,ps,ts=doc(path);assert [(i,t) for i,t in enumerate(ts) if t!=texts[i]]==[(0,texts[0]+'（模拟核阅稿）'),(43,'模拟待核')]
  assert all(E.tostring(a)==E.tostring(b) for i,(a,b) in enumerate(zip(paras,ps)) if i not in (0,43)),(profile,'legacy source paragraphs rewritten')
  assert all(parts[n]==b for n,b in src.items() if n!='word/document.xml');rp=ps[43].find(W+'r/'+W+'rPr');assert rp.find(W+'sz').get(W+'val')=='32'
  report['files'].append({'profile':profile,'file':'legacy-restored','docxSHA256':sha(path.read_bytes()),'result':'Older saved 16pt preserved; only two source paragraphs edited. No automatic reinterpretation as fresh 11pt import.'})
 for label in ([] if profile=='before' else ['saved-new-admissions']):
  path=q/profile/(label+'.docx');parts,root,ps,ts=doc(path);reader,sizes,fonts=pdf(path.with_suffix('.pdf'));actual=logical(''.join(p.extract_text() for p in reader.pages));expected=logical(''.join(ts));assert all(logical(t) in actual for t in ts if t.strip());assert len(root.findall('.//'+W+'tbl'))==1
  report['files'].append({'profile':profile,'file':label,'bytes':path.stat().st_size,'docxSHA256':sha(path.read_bytes()),'pdfPages':len(reader.pages),'embeddedTrueTypeNames':fonts,'result':'Implementation saved draft Word/PDF obtained; unavailable CEO cloud draft and Error 9 cause remain unverified.'})
for row in report['nativeWord']:
 path=q/(row['file']+'.docx');assert row['sourceSHA256']==sha(path.read_bytes());_,_,_,ts=doc(path);assert row['logicalTextSHA256']==sha(logical(''.join(ts)).encode())
 if row['file']=='chrome/edited':assert row['sample']['requestedFontFarEast']=='宋体' and row['sample']['sizePt']==11 and row['sample']['firstLineIndentPt']==0
 if row['file']=='before/edited':assert row['sample']['sizePt']==10.5
(q/'verified.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print('Verified source parts, two exact edits, exported insertion format, font bytes, actual PDF glyph size, saved new-form files and native Word binding')
