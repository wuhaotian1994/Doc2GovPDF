from pathlib import Path
import json,sys,hashlib,zipfile,re,xml.etree.ElementTree as E
from pypdf import PdfReader
import pdfplumber
r=Path(__file__).resolve().parent.parent;qa=r/'build/qa/unified-word';source=r/'tmp/unified-word/hebtu-lab-safety.docx';W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
def doc(path):
 with zipfile.ZipFile(path) as z:parts={name:z.read(name) for name in z.namelist()}
 root=E.fromstring(parts['word/document.xml']);paras=root.findall('.//'+W+'body/'+W+'p')
 allparas=root.findall('.//'+W+'p');text=lambda p:''.join(p.itertext())
 return parts,root,[''.join(t.text or '' for t in p.findall('.//'+W+'t')) for p in allparas]
def logical(s):return re.sub(r'\s','',re.sub(r'—\s*\d+\s*—','',s))
original,root,texts=doc(source);report={'sourceSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'files':[]}
for profile in sys.argv[1:] or ['chrome']:
 base=qa/profile
 form=json.loads((base/'form.json').read_text(encoding='utf8'))
 assert form['content']['blocks'] and any(b['type']=='table' for b in form['content']['blocks'])
 assert [c['text'] for b in form['content']['blocks'] if b['type']=='table' for row in b['rows'] for c in row['cells']]==['检查项目','完成状态','台账核对','待核对','隐患记录','未定']
 for label in ['blank-table','official-untouched','official-edited','legacy-resumed','legacy-compose']:
  file=base/(label+'.docx');parts,tree,actual=doc(file)
  tables=tree.findall('.//'+W+'tbl');sections=tree.findall('.//'+W+'sectPr')
  if label=='official-untouched':assert file.read_bytes()==source.read_bytes()
  if label not in ['blank-table','legacy-compose']:
   assert len(tables)==2 and len(sections)==2
   assert [E.tostring(s) for s in sections]==[E.tostring(s) for s in root.findall('.//'+W+'sectPr')]
   for name,data in original.items():
    if name!='word/document.xml':assert parts[name]==data,(profile,label,name)
   assert len(actual)==len(texts)
   differences=[(i,a,b) for i,(a,b) in enumerate(zip(texts,actual)) if a!=b]
   assert len(differences)==(0 if label=='official-untouched' else 2),(label,differences)
   assert actual[17]==texts[17] and actual[18]==texts[18]
  pdf=PdfReader(base/(label+'.pdf'));text=''.join(page.extract_text() for page in pdf.pages)
  assert all(logical(p) in logical(text) for p in actual if p.strip()),(profile,label,'PDF text lost')
  sizes=[(round(float(p.mediabox.width),1),round(float(p.mediabox.height),1)) for p in pdf.pages]
  if label not in ['blank-table','legacy-compose']:assert sizes[:3]==[(595.3,841.9)]*3 and sizes[3:]==[(841.9,595.3)]*2,(label,sizes)
  with pdfplumber.open(base/(label+'.pdf')) as rendered:
   lines=[len(p.lines) for p in rendered.pages];fills=[len([rect for rect in p.rects if rect.get('fill')]) for p in rendered.pages]
  if label not in ['blank-table','legacy-compose']:assert sum(lines)>100 and sum(fills)>=9,(label,lines,fills)
  native=base/(label+'.word.pdf')
  if native.exists():
   native_record=next(row for row in json.loads((base/'word-native.json').read_text(encoding='utf-8-sig')) if row['file']==label);assert native_record['sourceSHA256'].lower()==hashlib.sha256(file.read_bytes()).hexdigest();assert native_record['logicalTextSHA256'].lower()==hashlib.sha256(logical(''.join(actual)).encode()).hexdigest(),(label,'native COM logical text mismatch')
  report['files'].append({'profile':profile,'file':label,'docxSHA256':hashlib.sha256(file.read_bytes()).hexdigest(),'paragraphs':len(actual),'tables':len(tables),'sections':len(sections),'pdfPages':len(pdf.pages),'pageSizesPoints':sizes,'pdfLineObjects':lines,'pdfFilledRectangles':fills})
(qa/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print('Verified',len(report['files']),'actual Word/PDF pairs')
