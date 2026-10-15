"""Independently inspect files produced by the UI journey suite."""
import json
import re
import zipfile
from pathlib import Path
import xml.etree.ElementTree as ET
from pypdf import PdfReader

root=Path(__file__).resolve().parent.parent
result=json.loads((root/'build/qa/journeys-result.json').read_text('utf-8'))
count=0
for run in result['results']:
    assert run['passed'], run.get('error')
    for item in run['exports']:
        path=Path(item['path'])
        if path.suffix=='.pdf':
            reader=PdfReader(path)
            assert 0<len(reader.pages)<=100
            text='\n'.join(page.extract_text() for page in reader.pages)
            text=re.sub(r'(?m)^\s*—\s*\d+\s*—\s*$','',text)
        else:
            with zipfile.ZipFile(path) as archive:
                doc=ET.fromstring(archive.read('word/document.xml'))
                text=''.join(doc.itertext())
            if item.get('original'):
                assert path.read_bytes()==Path(item['original']).read_bytes(), 'source changed'
        if not item.get('source'):
            content=re.sub(r'\s+','',text)
            for para in item['paragraphs']:
                wanted=re.sub(r'\s+','',para)
                assert not wanted or wanted in content, f'{path.name}: content missing: {wanted[:40]}'
        count+=1
print(f'PASS: {count} UI-exported files independently parsed; expected content and unchanged originals retained.')
