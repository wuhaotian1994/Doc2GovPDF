from pathlib import Path
import json,hashlib,re,zipfile,sys,xml.etree.ElementTree as E
from pypdf import PdfReader
import pdfplumber
r=Path(__file__).resolve().parent.parent;qa=r/'build/qa/annex';fixture=json.loads((r/'scripts/fixtures/writer-admissions-plan.json').read_text(encoding='utf8'));W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
def logical(text):return re.sub(r'\s','',re.sub(r'—\s*\d+\s*—','',text))
rows=[]
profiles=sys.argv[1:] or ['chrome','firefox','webkit']
for profile in profiles:
 for name in ['admissions','multiple']:
  base=qa/profile;source=base/(name+'.docx');tree=E.fromstring(zipfile.ZipFile(source).read('word/document.xml'));paragraphs=tree.findall('.//'+W+'p');texts=[''.join(t.text or '' for t in p.findall('.//'+W+'t')) for p in paragraphs];pdf=PdfReader(base/(name+'.pdf'));pdftexts=[p.extract_text() for p in pdf.pages];full=''.join(pdftexts);txt=(base/(name+'.txt')).read_text(encoding='utf-8-sig')
  assert all(re.search(r'—\s*'+str(i+1)+r'\s*—',text) for i,text in enumerate(pdftexts)),(profile,name,'page numbers not continuous')
  for text in texts:
   if text.strip():assert logical(text) in logical(full),(profile,name,'PDF text lost',text)
  assert logical(''.join(texts))==logical(txt),(profile,name,'TXT order mismatch')
  labels=[]
  for p,text in zip(paragraphs,texts):
   if re.fullmatch(r'附件\d*',text):
    assert p.find(W+'pPr/'+W+'pageBreakBefore') is not None
    labels.append(text)
  expected=['附件'] if name=='admissions' else ['附件1','附件2'];assert labels==expected
  for label in labels:
   pages=[i+1 for i,t in enumerate(pdftexts) if re.search(r'^'+label+r'\s*$',t,re.M)];assert len(pages)==1 and pages[0]>1,(profile,name,label,pages)
  if name=='admissions':
   table=tree.find('.//'+W+'tbl');cells=[[ ''.join(t.text or '' for t in c.findall('.//'+W+'t')) for c in row.findall(W+'tc')] for row in table.findall(W+'tr')];assert cells==fixture['rows'];assert sum(int(row[2]) for row in cells[1:-1])==9000
   assert '盘锦市教育局' in pdftexts[0] and '2025年5月14日' in logical(pdftexts[0]);assert fixture['tableTitle'] in logical(pdftexts[1]);assert '9000' in pdftexts[-1] and '盘锦德馨学校' in logical(pdftexts[-1]);assert '序号' in logical(pdftexts[-1])
   with pdfplumber.open(base/(name+'.pdf')) as rendered:
    extracted=[[logical(c or '') for c in row] for page in rendered.pages for table_data in page.extract_tables() for row in table_data];header=[logical(c) for c in fixture['rows'][0]];extracted=[row for i,row in enumerate(extracted) if i==0 or row!=header];assert extracted==[[logical(c) for c in row] for row in fixture['rows']],(profile,'PDF actual cells mismatch')
    for page in rendered.pages[1:]:
     lines=page.extract_text().splitlines()
     for target in ['盘锦市辽东湾实验高级中学','含公费计划150人']:
      if target in logical(page.extract_text()):assert any(target in line.replace(' ','') for line in lines),(profile,'single-character tail',target)
    p=rendered.pages[1];titles=p.search(fixture['tableTitle']);label=p.search('附件');assert titles and label;title=titles[0];assert abs((title['x0']+title['x1'])/2-300.47)<8,(profile,'title center',title);assert title['top']>label[0]['top']+40 and title['top']<label[0]['top']+90
   for row in table.findall(W+'tr'):
    for p in row.findall('.//'+W+'p'):
     size=p.find(W+'pPr/'+W+'rPr/'+W+'sz')
     if size is None:size=p.find('.//'+W+'rPr/'+W+'sz')
     assert size is not None and size.attrib[W+'val']=='32'
  native=base/'word-native.json'
  if native.exists():
   data=next(x for x in json.loads(native.read_text(encoding='utf-8-sig')) if x['file']==name);assert data['sourceSHA256'].lower()==hashlib.sha256(source.read_bytes()).hexdigest();assert data['logicalTextSHA256'].lower()==hashlib.sha256(logical(''.join(texts)).encode()).hexdigest()
  rows.append({'profile':profile,'case':name,'docxSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'pdfSHA256':hashlib.sha256((base/(name+'.pdf')).read_bytes()).hexdigest(),'pdfPages':len(pdf.pages),'labels':labels,'paragraphs':len(texts),'tables':len(tree.findall('.//'+W+'tbl'))})
(qa/('verified-service.json' if profiles==['service/chrome'] else 'verified.json')).write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8');print('Verified',len(rows),'actual Word/PDF/TXT triples,',sum(x['pdfPages'] for x in rows),'PDF text pages')
