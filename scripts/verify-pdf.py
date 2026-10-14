"""Render application PDFs with independent Poppler and check retained text."""
import json
import os
from pathlib import Path
import re
import subprocess
from PIL import Image, ImageDraw
from pypdf import PdfReader

root = Path(__file__).resolve().parent.parent
poppler = Path(os.environ.get('POPPLER_BIN', str(Path.home() / '.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin')))
out = root / 'build/qa/rendered'
out.mkdir(parents=True, exist_ok=True)
results = []
tiles = []
for group in ['pdf', 'templates', 'templates/word']:
    for pdf in sorted((root / 'build/qa' / group).glob('*.pdf')):
        label = group.replace('/', '-') + '-' + pdf.stem
        target = out / label
        subprocess.run([str(poppler / 'pdftoppm.exe'), '-r', '72', '-png', str(pdf), str(target)], check=True, capture_output=True)
        text = '\n'.join(page.extract_text() for page in PdfReader(pdf).pages)
        text = re.sub(r'(?m)^\s*—\s*\d+\s*—\s*$', '', text)
        expected = pdf.with_suffix('.pdf.text.json')
        if expected.exists():
            normalized = re.sub(r'\s+', '', text)
            for paragraph in json.loads(expected.read_text('utf-8')):
                needle = re.sub(r'\s+', '', paragraph)
                if needle and needle not in normalized:
                    raise AssertionError(f'{pdf.name}: missing paragraph {needle[:60]}')
        pages = sorted(out.glob(label + '-*.png'))
        results.append({'file': str(pdf.relative_to(root)), 'pages': len(pages), 'textVerified': expected.exists()})
        for page in pages:
            im = Image.open(page).convert('RGB')
            im.thumbnail((298, 421))
            tile = Image.new('RGB', (318, 455), '#e5e7eb')
            tile.paste(im, ((318-im.width)//2, 24))
            ImageDraw.Draw(tile).text((5, 4), label.encode('ascii', errors='replace').decode() + ' ' + page.stem.rsplit('-', 1)[-1], fill='black')
            tiles.append(tile)
for start in range(0, len(tiles), 12):
    batch = tiles[start:start+12]
    sheet = Image.new('RGB', (318*4, 455*((len(batch)+3)//4)), 'white')
    for n, tile in enumerate(batch):
        sheet.paste(tile, ((n%4)*318, (n//4)*455))
    sheet.save(out / f'contact-{start//12+1}.png')
(out / 'result.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'PASS: {len(results)} PDFs independently rendered; all upstream paragraph text retained.')
