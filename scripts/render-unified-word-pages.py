from pathlib import Path
import subprocess,json,hashlib
from PIL import Image,ImageOps,ImageDraw
r=Path(__file__).resolve().parent.parent;base=r/'build/qa/unified-word/chrome';out=r/'build/qa/unified-word/pages';out.mkdir(exist_ok=True)
files=[base/(name+suffix+'.pdf') for name in ['blank-table','official-untouched','official-edited','legacy-resumed','legacy-compose'] for suffix in ['', '.word']]
pages=[]
for p in files:
 target=out/p.stem
 subprocess.run(['pdftoppm','-scale-to','1600','-png',str(p),str(target)],check=True,creationflags=0x08000000)
 for image in sorted(out.glob(p.stem+'-*.png')):
  if p.stem+'.word-' in image.stem and '.word' not in p.stem:continue
  pages.append({'file':p.name,'image':str(image),'sha256':hashlib.sha256(image.read_bytes()).hexdigest()})
for start in range(0,len(pages),4):
 sheet=Image.new('RGB',(1500,2200),'#e9edf1');d=ImageDraw.Draw(sheet)
 for n,row in enumerate(pages[start:start+4]):
  im=Image.open(row['image']).convert('RGB');im.thumbnail((730,1040));x=(n%2)*750+10;y=(n//2)*1100+40
  sheet.paste(im,(x,y));d.text((x,y-26),Path(row['image']).name,fill='black')
 sheet.save(out/f'group-{start//4+1:02}.png')
(out/'manifest.json').write_text(json.dumps(pages,indent=2),encoding='utf8');print('Rendered',len(pages),'pages;',len(set(p['sha256'] for p in pages)),'distinct images;',len(range(0,len(pages),4)),'groups')
