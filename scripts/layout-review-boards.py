import json,sys
from pathlib import Path
from PIL import Image

root=Path(__file__).resolve().parent.parent
folder=Path(sys.argv[1]) if len(sys.argv)>1 else root/'build/qa/layout-audit/final'
pages=json.loads((folder/'page-inventory.json').read_text('utf-8'))
counts={}
for page in pages:
    if page['kind']!='reference' and not page['case'].startswith('source-'):
        counts[page['case']]=max(counts.get(page['case'],0),page['page'])
for case,count in counts.items():
    for i in range(1,count+1):
        source=folder/'rendered'/f'compare-{case}-{i}.png'
        image=Image.open(source)
        image.crop((596,0,image.width,image.height)).save(folder/'rendered'/f'review-{case}-{i}.png')
print(f'{sum(counts.values())} paired Word/PDF page boards prepared; original references retained separately.')
