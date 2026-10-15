"""Independent content/geometry checks, complementary to every-page visual review."""
import collections
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path
import xml.etree.ElementTree as ET
from pypdf import PdfReader

root = Path(__file__).resolve().parent.parent
folder = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'build/qa/layout-audit/final'
ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
normalize = lambda s: re.sub(r'\s+', '', s)

def paragraphs(value):
    if isinstance(value, dict):
        if 'text' in value and 'role' in value:
            yield value
        else:
            for child in value.values():
                yield from paragraphs(child)
    elif isinstance(value, list):
        for child in value:
            yield from paragraphs(child)

def pdf_text(path):
    reader = PdfReader(path)
    raw_pages = [page.extract_text() for page in reader.pages]
    pages = [normalize(text) for text in raw_pages]
    text = '\n'.join(raw_pages)
    text = re.sub(r'(?m)^\s*—\s*\d+\s*—\s*$', '', text)
    return reader, normalize(text), pages

results = []
for case in sorted(folder.iterdir()):
    if not case.is_dir() or not (case / 'document.docx').exists():
        continue
    source = (case / 'document.docx').read_bytes()
    marker = (case / '.word-source.sha256').read_text('utf-8-sig').strip().lower()
    assert hashlib.sha256(source).hexdigest() == marker, f'{case.name}: stale Word render'
    reader, actual, page_texts = pdf_text(case / 'go.pdf')
    word = PdfReader(case / 'word.pdf')
    with zipfile.ZipFile(case / 'document.docx') as archive:
        doc = ET.fromstring(archive.read('word/document.xml'))
        editable = normalize(''.join(t.text or '' for t in doc.findall('.//w:t', ns)))
        if (case / 'model.json').exists():
            model = json.loads((case / 'model.json').read_text('utf-8'))
            wanted = collections.Counter(normalize(p.get('prefix', '') + p['text']) for p in paragraphs(model))
            for text, count in wanted.items():
                if not text:
                    continue
                assert actual.count(text) >= count, f'{case.name}: PDF missing {text[:70]}'
                assert editable.count(text) >= count, f'{case.name}: Word missing {text[:70]}'
            fallback_used = any('Noto Serif SC' in value for element in doc.findall('.//w:rFonts', ns) for value in element.attrib.values())
            if fallback_used:
                assert any(n.startswith('word/fonts/') for n in archive.namelist()), f'{case.name}: fallback not embedded'
            assert len(reader.pages) == len(word.pages), f'{case.name}: Word/PDF page count differs'
            if case.name.endswith('-long'):
                assert actual.count('材料归集与核对') == 24, f'{case.name}: table row content lost or duplicated'
                for i, title in enumerate(['材料整理清单', '有关工作要求'], 1):
                    matches = [n for n, text in enumerate(page_texts) if f'附件{i}' in text]
                    assert len(matches) == 1, f'{case.name}: attachment label missing or duplicated'
                    assert title in page_texts[matches[0]]
                assert matches[0] == len(reader.pages)-1, f'{case.name}: second attachment not on final page'
        else:
            name = case.name.removeprefix('source-')
            original = root / 'testdata/upstream/gongwen-kit/docx' / (name + '.docx')
            assert original.read_bytes() == source, f'{name}: original modified'
            expected = json.loads((root / 'build/qa/pdf' / (name + '.pdf.text.json')).read_text('utf-8'))
            for p in expected:
                assert not normalize(p) or normalize(p) in actual, f'{name}: source text lost: {p[:40]}'
            assert len(reader.pages) == len(PdfReader(case / 'reference.pdf').pages), f'{name}: page count changed'
            if name == '公文管理办法':
                for number in ['一','二','三','四','五','六','七','八','九','十','十一','十二','十三','十四']:
                    assert actual.count(f'第{number}条') == 1, 'article numbering restarted or duplicated'
    results.append({'case': case.name, 'wordPages': len(word.pages), 'pdfPages': len(reader.pages), 'sha256': hashlib.sha256(source).hexdigest()})

inventory = json.loads((folder / 'page-inventory.json').read_text('utf-8'))
unique = [p for p in inventory if p['kind'] != 'reference' or p['case'].startswith('source-')]
assert all(not p['outside'] for p in unique), 'glyphs extend outside paper'
assert len(results) == 21
report = {'documents': results, 'uniqueRenderedPages': len(unique), 'checksPassed': True,
          'note': 'Automated assertions do not replace the separate page-by-page visual inspection.'}
(folder / 'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), 'utf-8')
print(f'PASS: {len(results)} Word/PDF pairs; {len(unique)} unique rendered pages; content, attachment pages, continuous numbering, fonts and paper bounds checked.')
