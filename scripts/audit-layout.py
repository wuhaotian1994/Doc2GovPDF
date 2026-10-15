"""Independent rendering and page inventory for the visual comparison pass."""
import argparse,json,os,subprocess
from pathlib import Path
from PIL import Image,ImageDraw
import pdfplumber

root=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('folder');parser.add_argument('--only',default='');args=parser.parse_args()
folder=Path(args.folder).resolve();poppler=Path(os.environ.get('POPPLER_BIN',str(Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin')))
render=folder/'rendered';render.mkdir(exist_ok=True)
inventory=[]
for case in sorted(p for p in folder.iterdir() if p.is_dir() and p.name!='rendered' and p.name.startswith(args.only)):
    versions={}
    for kind in ['reference','word','go']:
        source=case/(kind+'.pdf')
        if not source.exists():continue
        output=render/(case.name+'-'+kind)
        subprocess.run([str(poppler/'pdftoppm.exe'),'-r','96','-png',str(source),str(output)],check=True,capture_output=True)
        pages=[]
        with pdfplumber.open(source) as pdf:
            count=len(pdf.pages)
            for i,page in enumerate(pdf.pages):
                png=Path(str(output)+'-'+str(i+1).zfill(len(str(count)))+'.png');pages.append(png)
                chars=[c for c in page.chars if c['text'].strip()]
                fonts=sorted({(c['fontname'],round(c['size'],1)) for c in chars})
                outside=[c['text'] for c in chars if c['x0']<0 or c['x1']>page.width+.5 or c['top']<0 or c['bottom']>page.height+.5]
                inventory.append({'case':case.name,'kind':kind,'page':i+1,'fonts':fonts,'characters':len(chars),'outside':outside,'image':str(png.relative_to(root))})
        versions[kind]=pages
    for index in range(max(map(len,versions.values()),default=0)):
        tiles=[]
        for kind,pages in versions.items():
            tile=Image.new('RGB',(596,866),'#e5e7eb');ImageDraw.Draw(tile).text((12,5),f'{case.name} / {kind} / page {index+1}',fill='black')
            if index<len(pages):
                image=Image.open(pages[index]).convert('RGB');image.thumbnail((596,842));tile.paste(image,((596-image.width)//2,24))
            tiles.append(tile)
        sheet=Image.new('RGB',(596*len(tiles),866),'white')
        for i,tile in enumerate(tiles):sheet.paste(tile,(596*i,0))
        sheet.save(render/f'compare-{case.name}-{index+1}.png')
(folder/('page-inventory'+('-source' if args.only else '')+'.json')).write_text(json.dumps(inventory,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'Rendered and inventoried {len(inventory)} pages; {sum(bool(p["outside"]) for p in inventory)} pages with text outside the paper.')
