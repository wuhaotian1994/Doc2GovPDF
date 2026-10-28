"""Verify actual browser downloads independently of the app's check state."""
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
from pypdf import PdfReader

root = Path(__file__).resolve().parent.parent
folder = root / 'build/qa/ceo-001'
cases = json.loads((folder / 'result.json').read_text('utf-8'))
assert {case['profile'] for case in cases} == {'chrome', 'firefox', 'webkit'}
assert all(case['passed'] and not case['errors'] for case in cases)
compact = lambda text: ''.join(text.split())
results = []
for case in cases:
    path = folder / case['profile']
    txt = (path / 'reviewed.txt').read_text('utf-8-sig')
    assert txt.count('设备重量为10kg，请按原始记录核对型号。') == 2
    assert '2026年2月28日' in txt and '2026年2月30日' not in txt
    assert '新增说明：请妥善保存资料。' in txt and '另行通知归档日期。' in txt
    assert '关于资料核对的安排（修订）' in txt
    with ZipFile(path / 'reviewed.docx') as package:
        assert package.testzip() is None
        xml = package.read('word/document.xml')
        docx = ET.fromstring(xml)
        text = ''.join(node.text or '' for node in docx.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t'))
        assert compact(txt) == compact(text), case['profile'] + ': Word differs from TXT'
    pdf = PdfReader(path / 'reviewed.pdf')
    text = ''.join(page.extract_text() for page in pdf.pages)
    # Page numbers are generated output. Compare every authored paragraph in order.
    at = 0
    for line in filter(None, txt.splitlines()):
        at = compact(text).find(compact(line), at)
        assert at >= 0, (case['profile'], line)
        at += len(compact(line))
    results.append({'profile':case['profile'],'pages':len(pdf.pages),'checks':len(case['checks']),
                    'docxXmlSHA256':hashlib.sha256(xml).hexdigest()})
assert len({result['docxXmlSHA256'] for result in results}) == 1
source_names = ['web/write.js','web/write-checks.js','web/write.html','web/write.css','web/fonts/ui-400.woff','web/fonts/ui-700.woff']
for name in source_names:
    assert (root / name).read_bytes() == (root / 'build/qa/ceo-001-web' / name.removeprefix('web/')).read_bytes(), 'Stale build: ' + name
summary = {'passed':True,'outputs':results,'checks':sum(result['checks'] for result in results),
           'sourceHashes':{name:hashlib.sha256((root / name).read_bytes()).hexdigest() for name in
                           source_names + ['internal/office/check.go']}}
(folder / 'verified-outputs.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),'utf-8')
print(json.dumps(summary,ensure_ascii=False))
