"""Verify paragraph text, Word properties and real PDF font usage."""
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
import pdfplumber
from pypdf import PdfReader

root = Path(__file__).resolve().parent.parent
folder = root / 'build/qa/ceo-003'
cases = json.loads((folder / 'result.json').read_text('utf-8'))
assert {case['profile'] for case in cases} == {'chrome','firefox','webkit'}
assert all(case['passed'] and not case['errors'] for case in cases)
ns = {'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
text = lambda node: ''.join(t.text or '' for t in node.findall('.//w:t',ns))
compact = lambda value: ''.join(value.split())
data = json.loads((folder / 'chrome/model.json').read_text('utf-8'))
fields = data['fields']
lines = fields['body'].splitlines()
samples = dict(zip(['short','article','leading','ambiguous'],[lines[0],lines[1],lines[2],lines[12]]))
probes = {'short':compact(samples['short']),'article':compact(samples['article'].split(' ',1)[1][:12]),'leading':compact(samples['leading']),
          'ambiguous':compact(samples['ambiguous'][2:14]),'body':compact(lines[3][:12])}
date = ''.join(str(int(value))+unit for value,unit in zip(fields['date'].split('-'),'年月日'))
expected = [fields['title'],*lines,fields['signature'],date]

def word_properties(path):
    with ZipFile(path) as package:
        assert package.testzip() is None
        xml = package.read('word/document.xml')
        document = ET.fromstring(xml)
        paragraphs = document.findall('w:body/w:p',ns)
        assert [text(p) for p in paragraphs] == expected, (str(path),'source text/whitespace/order changed')
        result = {}
        for name,source in {**samples,'body':lines[3]}.items():
            p = next(p for p in paragraphs if text(p) == source)
            runs = [{'text':text(run),'font':run.find('w:rPr/w:rFonts',ns).get('{'+ns['w']+'}eastAsia')}
                    for run in p.findall('w:r',ns) if text(run)]
            result[name] = {'keepNext':p.find('w:pPr/w:keepNext',ns) is not None,'runs':runs}
        return result,hashlib.sha256(xml).hexdigest()

def pdf_properties(path):
    with pdfplumber.open(path) as pdf:
        chars = [char for page in pdf.pages for char in page.chars if not char['text'].isspace()]
        whole = ''.join(char['text'] for char in chars)
        at = 0
        for source in expected:
            at = whole.find(compact(source),at)
            assert at >= 0, (str(path),'source paragraph missing',source)
            at += len(compact(source))
        faces = {}
        for name,probe in probes.items():
            start = whole.find(probe)
            assert start >= 0, (str(path),probe)
            faces[name] = sorted({char['fontname'] for char in chars[start:start+len(probe)]})
        return {'pages':len(pdf.pages),'faces':faces}

baseline_word,_ = word_properties(folder / 'chrome-baseline/baseline.docx')
baseline_pdf = pdf_properties(folder / 'chrome-baseline/baseline.pdf')
baseline_heading_fonts={run['font'] for run in baseline_word['short']['runs']}
baseline_body_fonts={run['font'] for run in baseline_word['body']['runs']}
assert baseline_heading_fonts != baseline_body_fonts
assert {run['font'] for run in baseline_word['article']['runs']} == baseline_heading_fonts
assert baseline_word['article']['keepNext']
assert baseline_pdf['faces']['article'] != baseline_pdf['faces']['body']
assert baseline_pdf['faces']['leading'] == baseline_pdf['faces']['body']
results = []
for case in cases:
    path = folder / case['profile']
    variants = {}
    for variant in ['auto','corrected']:
        word,digest = word_properties(path / (variant+'.docx'))
        pdf = pdf_properties(path / (variant+'.pdf'))
        body_fonts={run['font'] for run in word['body']['runs']}
        heading_fonts={run['font'] for run in word['short']['runs']}
        assert body_fonts != heading_fonts
        assert word['article']['runs'][-1]['font'] in body_fonts and not word['article']['keepNext']
        assert {run['font'] for run in word['leading']['runs']} == heading_fonts
        assert word['short']['keepNext'] and word['leading']['keepNext']
        assert pdf['faces']['article'] == pdf['faces']['body']
        assert pdf['faces']['leading'] != pdf['faces']['body']
        if variant=='corrected':
            assert {run['font'] for run in word['ambiguous']['runs']} == body_fonts and not word['ambiguous']['keepNext']
            assert pdf['faces']['ambiguous'] == pdf['faces']['body']
        else:
            assert pdf['faces']['ambiguous'] != pdf['faces']['body']
        variants[variant] = {'word':word,'pdf':pdf,'docxXmlSHA256':digest}
    results.append({'profile':case['profile'],'checks':len(case['checks']),'variants':variants})
source_names = ['internal/office/templates.go','internal/office/numbering.go','web/write.html','web/write.js','web/index.html','web/browser-api.js','web/fonts/ui-400.woff','web/fonts/ui-700.woff']
for name in [name for name in source_names if name.startswith('web/')]:
    built_name = 'advanced.html' if name=='web/index.html' else name.removeprefix('web/')
    assert (root / name).read_bytes() == (root / 'build/qa/ceo-003-web' / built_name).read_bytes(), 'Stale build: '+name
result = {'passed':True,'checks':sum(item['checks'] for item in results),'baseline':{'word':baseline_word,'pdf':baseline_pdf},'outputs':results,
          'sourceHashes':{name:hashlib.sha256((root / name).read_bytes()).hexdigest() for name in source_names}}
(folder / 'verified-outputs.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),'utf-8')
print(json.dumps({'passed':True,'checks':result['checks'],'pages':{item['profile']:{key:value['pdf']['pages'] for key,value in item['variants'].items()} for item in results},'sourceHashes':result['sourceHashes']}))
