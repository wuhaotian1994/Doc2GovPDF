from pathlib import Path
import subprocess,json,hashlib
from PIL import Image,ImageDraw
r=Path(__file__).resolve().parent.parent;base=r/'build/qa/annex/chrome';out=r/'build/qa/annex/pages';out.mkdir(exist_ok=True)
pages=[]
for name in ['admissions','multiple']:
 for kind in ['', '.word']:
  p=base/(name+kind+'.pdf');target=out/p.stem;subprocess.run(['pdftoppm','-scale-to','1600','-png',str(p),str(target)],check=True,creationflags=0x08000000)
  for image in sorted(out.glob(p.stem+'-*.png')):
   if '.word-' in image.stem and kind=='':continue
   pages.append({'file':p.name,'image':image.name,'sha256':hashlib.sha256(image.read_bytes()).hexdigest()})
for start in range(0,len(pages),4):
 sheet=Image.new('RGB',(1500,2200),'#e9edf1');draw=ImageDraw.Draw(sheet)
 for n,row in enumerate(pages[start:start+4]):
  im=Image.open(out/row['image']).convert('RGB');im.thumbnail((730,1040));x=(n%2)*750+10;y=(n//2)*1100+40;sheet.paste(im,(x,y));draw.text((x,y-26),row['image'],fill='black')
 sheet.save(out/f'group-{start//4+1:02}.png')
(out/'manifest.json').write_text(json.dumps(pages,indent=2),encoding='utf8');print('Rendered',len(pages),'real Word/PDF pages;',len(set(p['sha256'] for p in pages)),'distinct images')
