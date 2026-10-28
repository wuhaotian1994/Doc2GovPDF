from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
import json,re,hashlib,subprocess
from pypdf import PdfReader
from PIL import Image,ImageDraw
r=Path(__file__).resolve().parent.parent;q=r/'build/qa/admissions';fixture=json.loads((r/'scripts/fixtures/writer-admissions-plan.json').read_text('utf-8'));ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'};compact=lambda t:re.sub(r'\s+','',t);header=compact(''.join(fixture['rows'][0]));expected=compact('\n'.join([fixture['title']+'（模拟校阅）',fixture['recipient'],fixture['body'],fixture['attachment'],fixture['signature'],fixture['date'],fixture['publicNote'],fixture['attachmentLabel'],fixture['tableTitle'],*['\t'.join(row) for row in fixture['rows']]]));records=[]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
for phase,profiles in [('before',['chrome']),('after',['chrome','firefox','webkit'])]:
 for profile in profiles:
  folder=q/phase/profile;d=json.loads((folder/'draft.json').read_text('utf-8'));model=json.loads((folder/'model.json').read_text('utf-8'));report=json.loads((folder/'result.json').read_text('utf-8'));assert report['passed'];assert d['fields']['sourceMaterial']==fixture['material'] and '发布日期' not in d['fields']['body'];assert d['fields']['date']==fixture['sourceDate'] and d['fields']['signature']==fixture['signature']
  table=next(b for b in d['content']['postscript']['blocks'] if b['type']=='table');assert [[c['text'] for c in row['cells']] for row in table['rows']]==fixture['rows'];assert sum(int(row['cells'][2]['text']) for row in table['rows'][1:13])==9000
  with ZipFile(folder/'final.docx') as z:assert z.testzip() is None;x=ET.fromstring(z.read('word/document.xml'))
  text=''.join(t.text or '' for t in x.findall('.//w:t',ns));assert compact(text)==expected,(phase,profile,'Word content/order');tables=x.findall('.//w:tbl',ns);assert len(tables)==1;rows=[[compact(''.join(t.text or '' for t in cell.findall('.//w:t',ns))) for cell in row.findall('w:tc',ns)] for row in tables[0].findall('w:tr',ns)];assert rows==[[compact(c) for c in row] for row in fixture['rows']];assert sum(not c for row in rows for c in row)==12
  pages=[compact(re.sub(r'\s*—\s*'+str(i)+r'\s*—\s*$','',p.extract_text() or '')) for i,p in enumerate(PdfReader(folder/'final.pdf').pages,1)];joined=''
  for page in pages:
   if header in joined and page.startswith(header):page=page[len(header):]
   joined+=page
  assert joined==expected,(phase,profile,'PDF exact content/order');widths=next(b['table']['widths'] for b in model['blocks'] if b.get('table'));assert abs(sum(widths)-156)<.01
  if phase=='after':
   assert widths[1]>2*widths[0] and widths[1]>widths[2];attachment=next(i for i,p in reversed(list(enumerate(pages))) if '附件' in p);title=next(i for i,p in reversed(list(enumerate(pages))) if compact(fixture['tableTitle']) in p);first=next(i for i,p in enumerate(pages) if fixture['rows'][1][1] in p);last=next(i for i,p in enumerate(pages) if fixture['rows'][12][1] in p);total=next(i for i,p in enumerate(pages) if '合计9000' in p);assert attachment==title==first and last==total,(profile,'reading relationships');assert fixture['rows'][9][3] in pages[next(i for i,p in enumerate(pages) if fixture['rows'][9][1] in p)];assert fixture['rows'][10][3] in pages[next(i for i,p in enumerate(pages) if fixture['rows'][10][1] in p)]
  records.append({'phase':phase,'profile':profile,'id':d['id'],'exactCharacters':len(expected),'rows':14,'columns':4,'emptyCells':12,'schoolsTotal':9000,'pdfPages':len(pages),'widthsMM':widths,'docxSHA256':sha(folder/'final.docx'),'pdfSHA256':sha(folder/'final.pdf'),'actualWasmSHA256':report['engineSHA256']})
native=json.loads((q/'word/word-render.json').read_text('utf-8-sig'));assert isinstance(native,list) and len(native)==2
for row in native:
 docx=q/row['phase']/'chrome/final.docx';assert sha(docx)==row['sourceSHA256'].lower();assert row['logicalTextSHA256'].lower()==hashlib.sha256(expected.encode()).hexdigest()
 if row['phase']=='after':assert row['pageMap']['attachment']==row['pageMap']['title']==row['pageMap']['firstSchool'] and row['pageMap']['lastSchool']==row['pageMap']['total']
out=q/'page-review';out.mkdir(exist_ok=True);unique={};groups=[]
for phase in ['before','after']:
 for engine in ['pdf','word']:
  source=q/phase/'chrome/final.pdf' if engine=='pdf' else q/'word'/(phase+'.word.pdf');label=phase+'-'+engine;folder=out/label;folder.mkdir(exist_ok=True);subprocess.run(['pdftoppm','-scale-to','1400','-png',str(source),str(folder/'page')],capture_output=True,check=True);files=sorted(folder.glob('page-*.png'));groups.append({'label':label,'pages':len(files),'sha256':sha(source)})
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
summary={'cases':records,'nativeWord':native,'sourceURL':fixture['sourceURL'],'sourceFixtureSHA256':sha(r/'scripts/fixtures/writer-admissions-plan.json'),'sources':{name:sha(r/name) for name in ['web/write.js','web/write-materials.js','web/write-material-tables.js','web/write-table-layout.js','web/write-content.js','internal/office/pdf.go']},'rendered':{'groups':groups,'totalPages':sum(v['pages'] for v in groups),'uniquePages':len(items),'mapping':items,'manualVisualReviewRecordedSeparately':True},'limits':['Same public source transcript and cells in separate role-task drafts, not the exact CEO three-page saved file','Baseline explicitly manually relocates recipient and removes webpage metadata, no claim of old automatic behavior','Informed implementation task; no independent first-user discovery rate','Native Word covers Chrome before/after; other browser files independently checked by XML/PDF text']};(q/'verified.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),'utf-8');print(json.dumps({'passed':True,'actualFiles':len(records)*2,'directPDFTextPages':sum(row['pdfPages'] for row in records),'renderedPages':sum(v['pages'] for v in groups),'uniquePages':len(items)}))
