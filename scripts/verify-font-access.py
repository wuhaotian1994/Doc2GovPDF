from pathlib import Path
import json,re,hashlib,zipfile,subprocess
from pypdf import PdfReader
from PIL import Image,ImageDraw
r=Path(__file__).resolve().parent.parent;q=r/'build/qa/font-access';sha=lambda b:hashlib.sha256(b).hexdigest();report={'profiles':[],'files':[]}
def names(b):
 n=int.from_bytes(b[4:6],'big')
 for i in range(n):
  p=12+16*i
  if b[p:p+4]!=b'name':continue
  at=int.from_bytes(b[p+8:p+12],'big');length=int.from_bytes(b[p+12:p+16],'big');table=b[at:at+length];count=int.from_bytes(table[2:4],'big');start=int.from_bytes(table[4:6],'big');out=[]
  for j in range(count):
   p=6+12*j;platform=int.from_bytes(table[p:p+2],'big');kind=int.from_bytes(table[p+6:p+8],'big');length=int.from_bytes(table[p+8:p+10],'big');offset=int.from_bytes(table[p+10:p+12],'big')
   if platform in (0,3) and kind in (1,2,4,6):out.append(table[start+offset:start+offset+length].decode('utf-16be',errors='strict'))
  return sorted(set(out))
 return []
for run in json.loads((q/'report.json').read_text(encoding='utf8')):
 assert run['passed'] and not run['errors'];profile=run['profile'];report['profiles'].append({'profile':profile,'browserVersion':run['browserVersion'],'checks':len(run['checks'])});pdf=q/(profile+'.pdf');reader=PdfReader(pdf);text=''.join(p.extract_text() or '' for p in reader.pages);assert '请各科室核对库存12箱，编号A-17。' in re.sub(r'\s','',text);fonts=[]
 for p in reader.pages:
  for ref in p['/Resources']['/Font'].values():
   f=ref.get_object();face=f.get('/DescendantFonts',[f])[0];face=face.get_object();d=face.get('/FontDescriptor');d=d.get_object() if d else None
   if d and d.get('/FontFile2'):
    data=d['/FontFile2'].get_data();fonts.append({'baseFont':str(f['/BaseFont']),'actualNames':names(data),'embeddedSHA256':sha(data)})
 bodyFonts=[]
 def visitor(text,cm,tm,font,size):
  if '请' in text:bodyFonts.append(str(font['/BaseFont']))
 for page in reader.pages:page.extract_text(visitor_text=visitor)
 assert bodyFonts and all(any(f['baseFont']==name and any('Black' in v for v in f['actualNames']) for f in fonts) for name in bodyFonts),(bodyFonts,fonts)
 with zipfile.ZipFile(q/(profile+'.docx')) as z:
  xml=z.read('word/document.xml').decode('utf8');assert '请各科室核对库存12箱，编号A-17。' in xml;declared=bool('w:eastAsia="仿宋"' in xml)
  # Current custom fonts are not embedded in Word. Existing OFL fallback parts
  # can still be present for other roles; never claim this custom face is there.
  embedded=[n for n in z.namelist() if n.startswith('word/fonts/')];table=z.read('word/fontTable.xml').decode('utf8') if 'word/fontTable.xml' in z.namelist() else '';assert declared and 'w:name="仿宋"' not in table
 report['files'].append({'profile':profile,'pdfSHA256':sha(pdf.read_bytes()),'docxSHA256':sha((q/(profile+'.docx')).read_bytes()),'pdfPages':len(reader.pages),'fonts':fonts,'wordCustomFontEmbedded':False,'wordReliesOnReceiverFont':'仿宋','fallbackFontParts':len(embedded)})
(q/'verified.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print('Actual PDF embedded second-face identity and Word non-embedding boundary verified for all profiles')
