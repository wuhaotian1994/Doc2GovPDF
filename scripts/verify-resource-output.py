"""Inspect actual browser downloads; pass its output directory as argv[1]."""
from pathlib import Path
import sys, json, hashlib, zipfile, re
import xml.etree.ElementTree as ET
from pypdf import PdfReader

root = Path(__file__).resolve().parent.parent
folder = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'build/qa/resource-loading'
report = {'pdfs': [], 'completeWordFaces': []}
for name, expected in [('common.pdf', '请各部门核对工作记录。'), ('rare.pdf', '请核对龘字'), ('offline.pdf', '请核对龘字'), ('selected-fonts.pdf', '请各部门核对工作记录。')]:
    data = (folder / name).read_bytes()
    reader = PdfReader(folder / name)
    text = re.sub(r'\s', '', ''.join(p.extract_text() for p in reader.pages))
    assert expected in text, (name, text)
    report['pdfs'].append({'file': name, 'pages': len(reader.pages), 'sha256': hashlib.sha256(data).hexdigest(), 'expectedTextPresent': True})
ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
with zipfile.ZipFile(folder / 'editable.docx') as archive:
    assert '龘' in archive.read('word/document.xml').decode('utf8')
    table = ET.fromstring(archive.read('word/fontTable.xml'))
    relationships = {item.attrib['Id']: item.attrib['Target'] for item in ET.fromstring(archive.read('word/_rels/fontTable.xml.rels'))}
    for face in table:
        embedded = face.find('w:embedRegular', ns)
        key = bytes.fromhex(embedded.attrib['{' + ns['w'] + '}fontKey'].strip('{}').replace('-', ''))
        data = bytearray(archive.read('word/' + relationships[embedded.attrib['{' + ns['r'] + '}id']]))
        for i in range(32): data[i] ^= key[15 - i % 16]
        name = face.attrib['{' + ns['w'] + '}name']
        source = root / 'assets/fonts' / ('NotoSerifSC-Black.ttf' if name.endswith('Black') else 'NotoSerifSC.ttf')
        assert bytes(data) == source.read_bytes(), name
        report['completeWordFaces'].append({'name': name, 'bytes': len(data), 'exactCompleteSource': True})
assert len(report['completeWordFaces']) == 2
if (folder / 'original.pdf').exists():
    reader = PdfReader(folder / 'original.pdf')
    report['originalPDFPages'] = len(reader.pages)
(folder / 'verified.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps(report, ensure_ascii=False))
