from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
import json,re,hashlib,subprocess
from pypdf import PdfReader
from PIL import Image,ImageDraw
r=Path(__file__).resolve().parent.parent;q=r/'build/qa/quality-copy';ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'};compact=lambda t:re.sub(r'\s+','',t);records=[]
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def expected(d):
 f=d['fields'];date=''.join(x+suffix for x,suffix in zip(map(str,map(int,f['date'].split('-'))),['年','月','日'])) if f['date'] else '';return compact(f['title']+f['recipient']+'：'+f['body']+f['signature']+date+f['postscript'])
for phase,profiles in [('before',['chrome']),('after',['chrome','firefox','webkit'])]:
 for profile in profiles:
  folder=q/phase/profile;report=json.loads((folder/'result.json').read_text('utf-8'));assert report['passed'];original=json.loads((folder/'original.json').read_text('utf-8'));initial=json.loads((folder/'copied-initial.json').read_text('utf-8'));copied=json.loads((folder/'copied.json').read_text('utf-8'));assert initial['id']!=original['id'] and initial['fields']['date']=='' and initial['fields']['reference']==''
  if phase=='after':
   assert initial['content']==original['content'];assert all(initial['fields'][k]==v for k,v in original['fields'].items() if k not in ['date','reference']);restored=json.loads((folder/'restored-original.json').read_text('utf-8'));assert restored['id']==original['id'] and restored['content']==original['content'] and restored['fields']==original['fields']
   assert copied['content']['blocks']==original['content']['blocks'];changed=json.loads(json.dumps(original['content']['postscript']));grid=next(b for b in changed['blocks'] if b['type']=='table');grid['rows'][1]['cells'][1]['text']='已补资料，待复查';assert copied['content']['postscript']==changed
  else:assert not initial.get('content')
  for kind,d in [('original',original),('copied',copied)]:
   docx=folder/(kind+'.docx');pdf=folder/(kind+'.pdf')
   with ZipFile(docx) as z:assert z.testzip() is None;x=ET.fromstring(z.read('word/document.xml'))
   raw=''.join(t.text or '' for t in x.findall('.//w:t',ns));assert compact(raw)==expected(d),(phase,profile,kind,'Word exact text/order');tables=x.findall('.//w:tbl',ns);wanted=0 if phase=='before' and kind=='copied' else 2;assert len(tables)==wanted
   actualRows=[[[''.join(t.text or '' for t in c.findall('.//w:t',ns)) for c in row.findall('w:tc',ns)] for row in table.findall('w:tr',ns)] for table in tables]
   if wanted:
    blocks=d['content']['blocks']+d['content']['postscript']['blocks'];wantRows=[[[c['text'] for c in row['cells']] for row in b['rows']] for b in blocks if b['type']=='table'];assert actualRows==wantRows
   pages=[compact(re.sub(r'\s*—\s*'+str(i)+r'\s*—\s*$','',p.extract_text() or '')) for i,p in enumerate(PdfReader(pdf).pages,1)];assert ''.join(pages)==expected(d),(phase,profile,kind,'PDF exact text/order')
   records.append({'phase':phase,'profile':profile,'kind':kind,'exactCharacters':len(expected(d)),'tableCount':len(tables),'tableCells':sum(len(row) for table in actualRows for row in table),'pdfPages':len(pages),'docxSHA256':digest(docx),'pdfSHA256':digest(pdf),'identity':d['id']})
native=json.loads((q/'word/word-render.json').read_text('utf-8-sig'));assert isinstance(native,list) and len(native)==4
for row in native:
 phase,kind=row['file'].removesuffix('.docx').split('-',1);d=json.loads((q/phase/'chrome'/(kind+'.json')).read_text('utf-8'));assert row['sourceSHA256'].lower()==digest(q/phase/'chrome'/(kind+'.docx'));assert row['logicalTextSHA256'].lower()==hashlib.sha256(expected(d).encode()).hexdigest()
out=q/'page-review';out.mkdir(exist_ok=True);groups=[];unique={}
for phase in ['before','after']:
 for kind in ['original','copied']:
  for engine in ['pdf','word']:
   source=q/phase/'chrome'/(kind+'.pdf') if engine=='pdf' else q/'word'/(phase+'-'+kind+'.word.pdf');label=phase+'-'+kind+'-'+engine;folder=out/label;folder.mkdir(exist_ok=True);subprocess.run(['pdftoppm','-scale-to','1400','-png',str(source),str(folder/'page')],capture_output=True,check=True);files=sorted(folder.glob('page-*.png'));groups.append({'label':label,'pages':len(files),'sha256':digest(source)})
   for i,file in enumerate(files,1):
    im=Image.open(file).convert('RGB');entry=unique.setdefault(hashlib.sha256(im.tobytes()).hexdigest(),{'path':str(file.relative_to(q)),'labels':[]});entry['labels'].append(label+' p'+str(i))
items=list(unique.values())
for offset in range(0,len(items),4):
 chunk=items[offset:offset+4];sheet=Image.new('RGB',(1680,1200*((len(chunk)+1)//2)),'#d9e0e6')
 for i,item in enumerate(chunk):
  im=Image.open(q/item['path']).convert('RGB');im.thumbnail((820,1140));tile=Image.new('RGB',(840,1200),'#d9e0e6');tile.paste(im,((840-im.width)//2,50));draw=ImageDraw.Draw(tile)
  for j,label in enumerate(item['labels']):draw.text((12,6+j*13),label,fill='black')
  sheet.paste(tile,((i%2)*840,(i//2)*1200))
 sheet.save(out/('unique-'+str(offset+1)+'.jpg'),quality=92)
summary={'cases':records,'nativeWord':native,'productionChange':'Recent library copy now passes full content to existing draft validation; no generator/font/layout changes','sources':{name:digest(r/name) for name in ['web/write.js','web/write-model.js','web/write-content.js','web/write-library.js']},'rendered':{'groups':groups,'totalPages':sum(v['pages'] for v in groups),'uniquePages':len(items),'pageMapping':items,'manualVisualReviewRecordedSeparately':True},'limitations':['Informed synthetic manufacturing-office task, not blind user research','Native Word render covers four Chrome representative downloads, other browser Word XML/PDF text verified individually','No native IME/mobile/physical printing completion claim']};(q/'verified.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),'utf-8');print(json.dumps({'passed':True,'actualFiles':len(records)*2,'directPDFTextPages':sum(v['pdfPages'] for v in records),'renderedPages':sum(v['pages'] for v in groups),'uniquePages':len(items)}))
