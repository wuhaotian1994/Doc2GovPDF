"""Verify current special-element DOCX renders and both PDF contents independently."""
import hashlib
import json
import re
import zipfile
from pathlib import Path
import xml.etree.ElementTree as ET
from pypdf import PdfReader
from PIL import Image

root = Path(__file__).resolve().parent.parent
folder = root / 'build/qa/extended-audit'
ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
normalize = lambda value: re.sub(r'\s+', '', value)
results = []
for case in sorted(folder.iterdir()):
    source = case / 'document.docx'
    if not source.exists():
        continue
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    assert digest == (case / '.word-source.sha256').read_text('utf-8-sig').strip().lower(), case.name + ': stale Word render'
    with zipfile.ZipFile(source) as archive:
        doc = ET.fromstring(archive.read('word/document.xml'))
        paragraphs = [normalize(''.join(t.text or '' for t in p.findall('.//w:t', ns)))
                      for p in doc.findall('.//w:body//w:p', ns)]
    counts = {}
    for kind in ['word', 'go']:
        pdf = case / (kind + '.pdf')
        if not pdf.exists():
            assert kind == 'go' and case.name == 'word-comments'
            continue
        reader = PdfReader(pdf)
        text = normalize(''.join(page.extract_text() for page in reader.pages))
        for para in paragraphs:
            assert not para or para in text, f'{case.name}/{kind}: missing {para[:80]}'
        counts[kind] = len(reader.pages)
        if case.name == 'automatic-articles':
            for n in ['一', '二']:
                assert text.count('第' + n + '条') == 1, f'{kind}: article sequence incorrect'
        if case.name == 'detached-attachments':
            assert '示政发〔2026〕12号附件1' in text and '示政发〔2026〕12号附件2' in text
    if 'go' in counts:
        assert counts['word'] == counts['go'], case.name + ': page count differs'
    results.append({'case': case.name, 'sha256': digest, 'pages': counts})

inventory = json.loads((folder / 'page-inventory.json').read_text('utf-8'))
assert len(results) == 9 and len(inventory) == 35
assert all(not p['outside'] for p in inventory)
for page in inventory:
    if page['case'] == 'preprinted':
        pixels = Image.open(root / page['image']).convert('RGB').getdata()
        assert not any(r > 150 and r > g * 1.5 and r > b * 1.5 for r, g, b in pixels), 'preprinted red ink remains'
report = {'checksPassed': True, 'documents': results, 'uniqueRenderedPages': len(inventory)}
(folder / 'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), 'utf-8')
print('PASS: 9 special-element cases, 35 actual pages; content, numbering, preprinted ink and paper bounds verified.')
