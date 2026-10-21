from pathlib import Path
import subprocess,json,hashlib
from PIL import Image,ImageDraw
root=Path('build/qa/readability');out=root/'page-review';out.mkdir(exist_ok=True);records=[];unique={}
for phase in ['before','after']:
 for kind in ['pdf','word']:
  for name in ['education','composite']:
   source=root/phase/name/'final.pdf' if kind=='pdf' else root/'word'/(phase+'-'+name+'.word.pdf');label=phase+'-'+kind+'-'+name;folder=out/label;folder.mkdir(exist_ok=True);subprocess.run(['pdftoppm','-scale-to','1400','-png',str(source),str(folder/'page')],capture_output=True,check=True);files=sorted(folder.glob('page-*.png'))
   for i,file in enumerate(files,1):
    im=Image.open(file).convert('RGB');key=hashlib.sha256(im.tobytes()).hexdigest();entry=unique.setdefault(key,{'path':str(file),'labels':[]});entry['labels'].append(label+' p'+str(i))
   records.append({'label':label,'pages':len(files),'pdfSHA256':hashlib.sha256(source.read_bytes()).hexdigest()})
items=list(unique.values())
for offset in range(0,len(items),4):
 sub=items[offset:offset+4];sheet=Image.new('RGB',(1680,1200*((len(sub)+1)//2)),'#d9e0e6')
 for i,item in enumerate(sub):
  im=Image.open(item['path']).convert('RGB');im.thumbnail((820,1140));tile=Image.new('RGB',(840,1200),'#d9e0e6');tile.paste(im,((840-im.width)//2,50));draw=ImageDraw.Draw(tile)
  for j,label in enumerate(item['labels']):draw.text((12,6+j*13),label,fill='black')
  sheet.paste(tile,((i%2)*840,(i//2)*1200))
 sheet.save(out/('unique-'+str(offset+1)+'.jpg'),quality=92)
(out/'rendered.json').write_text(json.dumps({'groups':records,'totalPages':sum(x['pages'] for x in records),'uniquePages':len(items),'deduplicatedPages':items},indent=2),'utf-8');print('Rendered',sum(x['pages'] for x in records),'pages;',len(items),'unique pages in',len(list(out.glob('unique-*.jpg'))),'sheets')
