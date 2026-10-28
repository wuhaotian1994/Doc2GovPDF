from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
import json,re,hashlib,subprocess,urllib.request
from pypdf import PdfReader
from PIL import Image,ImageDraw
r=Path(__file__).resolve().parent.parent;q=r/'build/qa/clinic-handover';ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'};compact=lambda t:re.sub(r'\s+','',t)
d=json.loads((q/'final.gongwen.json').read_text('utf-8'));report=json.loads((q/'result.json').read_text('utf-8'));f=d['fields']
with ZipFile(q/'final.docx') as z:
 assert z.testzip() is None;x=ET.fromstring(z.read('word/document.xml'))
text=''.join(t.text or '' for t in x.findall('.//w:t',ns));table=x.findall('.//w:tbl',ns);assert len(table)==1
rows=[[''.join(t.text or '' for t in c.findall('.//w:t',ns)) for c in row.findall('w:tc',ns)] for row in table[0].findall('w:tr',ns)];assert rows==report['expectedRows'] and len(rows)==4 and all(len(row)==4 for row in rows)
expected=f['title']+f['recipient']+'：'+f['body']+f['signature']+'2026年10月22日'+f['postscript'];assert compact(text)==compact(expected),'DOCX changed expected authored text'
pages=[compact(re.sub(r'\s*—\s*'+str(i)+r'\s*—\s*$','',p.extract_text() or '')) for i,p in enumerate(PdfReader(q/'final.pdf').pages,1)];assert ''.join(pages)==compact(expected),'PDF changed text/order'
word=json.loads((q/'word-render.json').read_text('utf-8-sig'));assert word['logicalTextSHA256'].lower()==hashlib.sha256(compact(text).encode()).hexdigest() and word['sourceSHA256'].lower()==hashlib.sha256((q/'final.docx').read_bytes()).hexdigest()
imageFiles=[];groups=[]
for kind,source in [('pdf',q/'final.pdf'),('word',q/'final.word.pdf')]:
 folder=q/('rendered-'+kind);folder.mkdir(exist_ok=True);subprocess.run(['pdftoppm','-scale-to','1400','-png',str(source),str(folder/'page')],capture_output=True,check=True)
 files=sorted(folder.glob('page-*.png'));groups.append({'kind':kind,'pages':len(files),'sha256':hashlib.sha256(source.read_bytes()).hexdigest()});imageFiles.extend((kind,i,p) for i,p in enumerate(files,1))
for offset in range(0,len(imageFiles),4):
 chunk=imageFiles[offset:offset+4];sheet=Image.new('RGB',(1680,1200*((len(chunk)+1)//2)),'#d9e0e6')
 for i,(kind,page,file) in enumerate(chunk):
  im=Image.open(file).convert('RGB');im.thumbnail((820,1140));tile=Image.new('RGB',(840,1200),'#d9e0e6');tile.paste(im,((840-im.width)//2,50));ImageDraw.Draw(tile).text((12,10),kind+' p'+str(page),fill='black');sheet.paste(tile,((i%2)*840,(i//2)*1200))
 sheet.save(q/('pages-'+str(offset+1)+'.jpg'),quality=92)
http=urllib.request.build_opener(urllib.request.ProxyHandler({})).open('http://127.0.0.1:4173/document-engine.wasm',timeout=30).read();httpHash=hashlib.sha256(http).hexdigest();assert httpHash==report['engineSHA256']
proof={'passed':True,'scenario':'虚构基层卫生院办公室辅助岗位排班交接','roleTaskMethod':'实施者知情走查，不是无历史用户盲测','productImplementation':'f68f008232550b924cd00f3751ecb3c75febb37a','actualFiles':['final.docx','final.pdf','final.gongwen.json'],'sameDraftId':d['id'],'exactNonWhitespaceCharacters':len(compact(expected)),'tableRows':rows,'sourceMaterialRetained':f['sourceMaterial']==(q/'source.txt').read_text('utf-8'),'rawSourceSHA256':hashlib.sha256((q/'source.txt').read_bytes()).hexdigest(),'fileSHA256':{name:hashlib.sha256((q/name).read_bytes()).hexdigest() for name in ['final.docx','final.pdf','final.gongwen.json']},'nativeWord':word,'rendered':groups,'serviceHTTPWasmSHA256':httpHash,'versionBoundary':'HTTP/source asset matched; no claim of browser actual loaded bytes hash','manualVisualReviewRecordedSeparately':True,'productCodeChanged':False,'limitations':['Synthetic industry task, no real clinic deployment, medical advice or real people','Chrome desktop only for this new task','No new native IME/mobile/physical-print validation']}
(q/'verified.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2),'utf-8');print(json.dumps({'passed':True,'exactCharacters':len(compact(expected)),'tableRows':len(rows),'renderedPages':len(imageFiles)}))
