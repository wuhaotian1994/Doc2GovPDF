import argparse,json
from pathlib import Path
from PIL import Image

p=argparse.ArgumentParser();p.add_argument('folder');a=p.parse_args();folder=Path(a.folder)
results=[]
for file in sorted((folder/'rendered').glob('*-1.png')):
    if file.name.startswith(('compare-','review-')):continue
    im=Image.open(file).convert('RGB');pixels=im.load();red=[];rules=[]
    for y in range(im.height//2):
        xs=[x for x in range(im.width) if (lambda c:c[0]>150 and c[1]<100 and c[2]<100)(pixels[x,y])]
        if xs:red.append(y)
        if len(xs)>im.width*.5:rules.append((y,min(xs),max(xs)))
    if not red:continue
    row={'image':file.name,'mark_top_mm':round(min(red)*25.4/96,2)}
    if rules:
        y,x0,x1=rules[-1];band=[r[0] for r in rules if y-r[0]<=3];center=(min(band)+max(band)+1)/2
        row.update(red_line_mm=round(center*25.4/96,2),red_line_width_mm=round((x1-x0+1)*25.4/96,2))
        blacks=[yy for yy in range(max(0,y-60),min(band)-2) if any(max(pixels[xx,yy])<240 for xx in range(x0,x1))]
        if blacks:row['reference_gap_mm']=round((center-max(blacks)-1)*25.4/96,2)
    results.append(row)
(folder/'measurements.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(results,ensure_ascii=False,indent=2))
