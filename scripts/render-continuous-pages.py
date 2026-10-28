from pathlib import Path
import subprocess,json,hashlib
from PIL import Image,ImageDraw
r=Path(__file__).resolve().parent.parent;q=r/'build/qa/continuous';out=q/'pages';out.mkdir(exist_ok=True);pages=[]
for name in ['clinic','admissions','native-untouched','native-edited']:
 for suffix in ['','.word']:
  p=q/'chrome'/(name+suffix+'.pdf');prefix=p.stem;subprocess.run(['pdftoppm','-scale-to','1700','-png',str(p),str(out/prefix)],check=True,creationflags=0x08000000)
  for path in sorted(out.glob(prefix+'-*.png')):
   if suffix=='' and '.word-' in path.name:continue
   pages.append({'source':str(p.relative_to(q)).replace('\\','/'),'image':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
groups=[]
for start in range(0,len(pages),4):
 sheet=Image.new('RGB',(1840,2650),'#e9edf1');draw=ImageDraw.Draw(sheet)
 for i,row in enumerate(pages[start:start+4]):
  image=Image.open(out/row['image']).convert('RGB');image.thumbnail((900,1260));x=i%2*920+10;y=i//2*1325+42;sheet.paste(image,(x,y));draw.text((x,y-27),row['image'],fill='black')
 path=out/f'group-{start//4+1:02}.png';sheet.save(path);groups.append(path.name)
(out/'manifest.json').write_text(json.dumps({'pages':pages,'groups':groups},indent=2),encoding='utf8');print('Rendered',len(pages),'actual pages in',len(groups),'groups')
