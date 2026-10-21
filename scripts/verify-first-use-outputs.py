"""Check downloaded files, not only successful click/download events."""
import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree
from pypdf import PdfReader

parser = argparse.ArgumentParser()
parser.add_argument('--build', default='build/qa/final-desktop-web')
parser.add_argument('--results', default='desktop-final.json')
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
folder = root / 'build/qa/first-use'
cases = json.loads((folder / args.results).read_text(encoding='utf-8'))
assert {case['profile'] for case in cases} == {'chrome', 'edge', 'firefox', 'webkit'}
assert all(case['passed'] for case in cases)
normalize = lambda text: ''.join(text.split())
outputs = []
for case in cases:
    path = folder / case['profile']
    saved = json.loads((path / 'saved.gongwen.json').read_text(encoding='utf-8'))
    fields = saved['fields']
    expected = [fields[name] for name in ['title', 'recipient', 'reference', 'body', 'signature']]
    with ZipFile(path / 'document.docx') as package:
        assert package.testzip() is None
        xml = package.read('word/document.xml')
        document = ElementTree.fromstring(xml)
        text = ''.join(node.text or '' for node in document.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t'))
        for value in expected:
            assert normalize(value) in normalize(text), (case['profile'], 'Word', value)
    for filename in ['document.pdf', 'latest.pdf', 'offline.pdf']:
        reader = PdfReader(path / filename)
        assert len(reader.pages) == 1
        text = '\n'.join(page.extract_text() for page in reader.pages)
        for value in expected:
            assert normalize(value) in normalize(text), (case['profile'], filename, value)
        if filename != 'document.pdf':
            assert '刷新前新增的一段，必须保存到最终文件。' in normalize(text)
    for filename in ['document.txt', 'latest.txt']:
        text = (path / filename).read_text(encoding='utf-8-sig')
        for value in expected:
            assert value in text, (case['profile'], filename, value)
        if filename == 'latest.txt':
            assert '刷新前新增的一段，必须保存到最终文件。' in text
    outputs.append({'profile': case['profile'], 'pages': 1, 'docxXmlSHA256': hashlib.sha256(xml).hexdigest()})
assert len({item['docxXmlSHA256'] for item in outputs}) == 1
build = root / args.build
hashes = {}
for name in ['write.html', 'write.css', 'write.js', 'write-boot.js', 'write-engine.js', 'write-model.js', 'write-library.js', 'favicon.svg']:
    source = (root / 'web' / name).read_bytes()
    assert source == (build / name).read_bytes(), 'Stale build: '+name
    hashes[name] = hashlib.sha256(source).hexdigest()
assert (root / 'web/write-boot.js').read_text(encoding='utf-8') in (build / 'index.html').read_text(encoding='utf-8')
summary = {'passed': True, 'desktopOnly': True, 'results': args.results, 'checks': sum(len(case['checks']) for case in cases), 'outputs': outputs, 'sourceHashes': hashes}
(folder / 'verified-desktop.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
print('PASS: four desktop browsers; actual Word/PDF/TXT content and newest edits match; delivered UI source matches.')
