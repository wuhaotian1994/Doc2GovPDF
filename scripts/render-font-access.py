from pathlib import Path
import subprocess,json,hashlib
from PIL import Image,ImageDraw
r=Path(__file__).resolve().parent.parent;q=r/'build/qa/font-access';out=q/'pages';out.mkdir(exist_ok=True);pages=[]
for name in ['chrome','chrome.word']:
 pdf=q/(name+'.pdf');subprocess.run(['pdftoppm','-scale-to','1700','-png',str(pdf),str(out/name)],check=True,creationflags=0x08000000)
 for p in sorted(out.glob(name+'-*.png')):pages.append({'file':pdf.name,'pdfSHA256':hashlib.sha256(pdf.read_bytes()).hexdigest(),'image':p.name,'imageSHA256':hashlib.sha256(p.read_bytes()).hexdigest()})
sheet=Image.new('RGB',(1840,1400),'#eef1f5');draw=ImageDraw.Draw(sheet)
for i,row in enumerate(pages):
 im=Image.open(out/row['image']).convert('RGB');im.thumbnail((900,1320));sheet.paste(im,(10+i*920,40));draw.text((10+i*920,12),row['image'],fill='black')
sheet.save(out/'direct-and-word.png');(out/'manifest.json').write_text(json.dumps(pages,indent=2),encoding='utf8');print('Rendered',len(pages),'actual direct/Word pages')
