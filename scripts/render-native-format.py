from pathlib import Path
import subprocess,json,hashlib
from PIL import Image,ImageDraw
r=Path(__file__).resolve().parent.parent;q=r/'build/qa/native-format';out=q/'pages';out.mkdir(exist_ok=True)
files=['chrome/untouched.word.pdf','before/edited.pdf','before/edited.word.pdf','chrome/untouched.pdf','chrome/edited.pdf','chrome/edited.word.pdf','chrome/legacy-restored.pdf','chrome/legacy-restored.word.pdf','chrome/saved-new-admissions.pdf','chrome/saved-new-admissions.word.pdf'];pages=[]
for filename in files:
 p=q/filename;prefix=filename.replace('/','-').replace('.pdf','');subprocess.run(['pdftoppm','-scale-to','1800','-png',str(p),str(out/prefix)],check=True,creationflags=0x08000000)
 for path in sorted(out.glob(prefix+'-*.png')):pages.append({'source':filename,'image':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
groups=[]
for start in range(0,len(pages),4):
 sheet=Image.new('RGB',(1840,2650),'#e9edf1');draw=ImageDraw.Draw(sheet)
 for n,row in enumerate(pages[start:start+4]):
  im=Image.open(out/row['image']).convert('RGB');im.thumbnail((900,1260));x=n%2*920+10;y=n//2*1325+42;sheet.paste(im,(x,y));draw.text((x,y-27),row['image'],fill='black')
 path=out/f'group-{start//4+1:02}.png';sheet.save(path);groups.append(path.name)
(out/'manifest.json').write_text(json.dumps({'pages':pages,'groups':groups},ensure_ascii=False,indent=2),encoding='utf8');print('Rendered',len(pages),'real pages in',len(groups),'groups')
