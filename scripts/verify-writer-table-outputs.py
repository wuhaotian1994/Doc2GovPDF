"""Independently inspect authored fields and the table in real downloads."""
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
from pypdf import PdfReader

root = Path(__file__).resolve().parent.parent
folder = root / 'build/qa/ceo-002'
cases = json.loads((folder / 'result.json').read_text('utf-8'))
assert {case['profile'] for case in cases} == {'chrome','firefox','webkit'}
assert all(case['passed'] and not case['errors'] for case in cases)
ns = {'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
text = lambda node: ''.join(t.text or '' for t in node.findall('.//w:t',ns))
compact = lambda value: ''.join(value.split())
expected = [['事项','责任部门','时限'],['整理资料','办公室','10月22日'],['核对归档','档案室','10月23日']]
summary = []
for case in cases:
    path = folder / case['profile']
    draft = json.loads((path / 'current.gongwen.json').read_text('utf-8'))
    fields = draft['fields']
    with ZipFile(path / 'with-table.docx') as package:
        assert package.testzip() is None
        xml = package.read('word/document.xml')
        document = ET.fromstring(xml)
        tables = document.findall('.//w:tbl',ns)
        assert len(tables) == 1, (case['profile'],'table missing or duplicated')
        actual = [[text(cell) for cell in row.findall('w:tc',ns)] for row in tables[0].findall('w:tr',ns)]
        assert actual == expected, (case['profile'],actual)
        alltext = text(document)
        for authored in [fields['title'],fields['signature'],*fields['body'].splitlines(),'2026年10月21日']:
            assert compact(authored) in compact(alltext), (case['profile'],authored)
        body = document.find('w:body',ns)
        children = list(body)
        table_at = children.index(tables[0])
        assert any(fields['body'].splitlines()[-1] in text(node) for node in children[:table_at])
        assert any(fields['signature'] in text(node) for node in children[table_at+1:]), 'table moved after signature'
    pdf = PdfReader(path / 'with-table.pdf')
    pdftext = compact('\n'.join(page.extract_text() for page in pdf.pages))
    for authored in [fields['title'],fields['signature'],*fields['body'].splitlines(),'2026年10月21日','资料归档工作安排',*(value for row in expected for value in row)]:
        assert compact(authored) in pdftext, (case['profile'],'PDF',authored)
    summary.append({'profile':case['profile'],'pages':len(pdf.pages),'checks':len(case['checks']),
                    'tableRows':len(actual),'tableColumns':len(actual[0]),'docxXmlSHA256':hashlib.sha256(xml).hexdigest()})
source_names = ['web/write.html','web/write.js','web/browser-api.js','web/index.html','web/workspace-ui.js','web/web.css']
for name in source_names:
    built_name = 'advanced.html' if name == 'web/index.html' else name.removeprefix('web/')
    assert (root / name).read_bytes() == (root / 'build/qa/ceo-002-web' / built_name).read_bytes(), 'Stale build: ' + name
result = {'passed':True,'checks':sum(row['checks'] for row in summary),'outputs':summary,
          'sourceHashes':{name:hashlib.sha256((root / name).read_bytes()).hexdigest() for name in source_names}}
(folder / 'verified-outputs.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),'utf-8')
print(json.dumps(result,ensure_ascii=False))
