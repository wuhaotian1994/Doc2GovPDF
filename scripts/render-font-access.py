from pathlib import Path
import subprocess,json,hashlib,os
from PIL import Image,ImageDraw
from pypdf import PdfReader
r=Path(__file__).resolve().parent.parent;q=r/os.environ.get('FONT_ACCESS_OUTPUT','build/qa/font-access');out=q/'pages';out.mkdir(exist_ok=True);pages=[];groups=[]
for sample in ['chrome','chrome-restored','chrome-reopened','chrome-fallback']:
    group=[]
    for name in [sample,sample+'.word']:
        pdf=q/(name+'.pdf');assert pdf.exists(),pdf
        subprocess.run(['pdftoppm','-scale-to','1700','-png',str(pdf),str(out/name)],check=True,creationflags=0x08000000 if os.name=='nt' else 0)
        count=len(PdfReader(pdf).pages);digits=len(str(count))
        for index in range(1,count+1):
            p=out/(name+'-'+str(index).zfill(digits)+'.png');assert p.exists(),p
            row={'file':pdf.name,'pdfSHA256':hashlib.sha256(pdf.read_bytes()).hexdigest(),'image':p.name,'imageSHA256':hashlib.sha256(p.read_bytes()).hexdigest()};pages.append(row);group.append(row)
    sheet=Image.new('RGB',(1840,1400*max(1,(len(group)+1)//2)),'#eef1f5');draw=ImageDraw.Draw(sheet)
    for i,row in enumerate(group):
        im=Image.open(out/row['image']).convert('RGB');im.thumbnail((900,1320));x=10+i%2*920;y=40+i//2*1400;sheet.paste(im,(x,y));draw.text((x,y-28),row['image'],fill='black')
    target=out/(sample+'-direct-and-word.png');sheet.save(target);groups.append({'sample':sample,'image':target.name,'pages':len(group)})
(out/'manifest.json').write_text(json.dumps({'pages':pages,'groups':groups},indent=2),encoding='utf8');print('Rendered',len(pages),'actual direct/Word pages in',len(groups),'source-bound groups')
