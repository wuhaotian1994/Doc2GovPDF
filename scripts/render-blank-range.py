from pathlib import Path
import subprocess,json,hashlib
from PIL import Image,ImageDraw
r=Path(__file__).resolve().parent.parent;q=r/'build/qa/blank-range';out=q/'pages';out.mkdir(exist_ok=True);pages=[]
for name in ['kept-blanks','kept-blanks.word']:
 pdf=q/'chrome'/(name+'.pdf');subprocess.run(['pdftoppm','-scale-to','1700','-png',str(pdf),str(out/name)],check=True,creationflags=0x08000000)
 for p in sorted(out.glob(name+'-*.png')):pages.append({'file':pdf.name,'pdfSHA256':hashlib.sha256(pdf.read_bytes()).hexdigest(),'image':p.name,'imageSHA256':hashlib.sha256(p.read_bytes()).hexdigest()})
groups=[]
for start in range(0,len(pages),4):
 sheet=Image.new('RGB',(1840,2650),'#eef1f5');draw=ImageDraw.Draw(sheet)
 for i,row in enumerate(pages[start:start+4]):
  im=Image.open(out/row['image']).convert('RGB');im.thumbnail((900,1260));sheet.paste(im,(10+i%2*920,42+i//2*1325));draw.text((10+i%2*920,12+i//2*1325),row['image'],fill='black')
 path=out/f'group-{start//4+1:02}.png';sheet.save(path);groups.append(path.name)
(out/'manifest.json').write_text(json.dumps({'pages':pages,'groups':groups},indent=2),encoding='utf8');print('Rendered',len(pages),'current actual Word/PDF pages')
