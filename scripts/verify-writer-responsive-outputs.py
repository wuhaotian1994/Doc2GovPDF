import hashlib,json,re
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
from pypdf import PdfReader
import pdfplumber
root=Path(__file__).resolve().parent.parent
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
compact=lambda text:''.join(text.split()).replace('\ufeff','')
def word_text(path):
    with ZipFile(path) as package:doc=ET.fromstring(package.read('word/document.xml'))
    return [''.join(t.text or '' for t in p.findall('.//w:t',ns)) for p in doc.findall('w:body/w:p',ns) if ''.join(t.text or '' for t in p.findall('.//w:t',ns))]
def pdf_text(path):
    pdf=PdfReader(path)
    return '\n'.join(re.sub(r'\s*—\s*'+str(i)+r'\s*—\s*$','',p.extract_text() or '') for i,p in enumerate(pdf.pages,1)),len(pdf.pages)
summary=[]
for profile in ['chrome','firefox','webkit']:
    folder=root/'build/qa/ceo-005'/profile
    fields=json.loads((folder/'latest.json').read_text('utf-8'))
    assert fields['body'].endswith('本地速度核对癸')
    expected=[fields['title'],fields['body']]
    assert word_text(folder/'latest.docx')==expected
    actual,pages=pdf_text(folder/'latest.pdf');assert compact(actual)==compact(''.join(expected))
    assert compact((folder/'latest.txt').read_text('utf-8-sig'))==compact(''.join(expected))
    summary.append({'task':'CEO-005','profile':profile,'latestExact':True,'pdfPages':pages})
    folder=root/'build/qa/ceo-006'/profile
    for variant in ['retained','corrected','undone-retained']:
        fields=json.loads((folder/(variant+'.json')).read_text('utf-8'))
        expected_reference='街办发〔2026〕5号' if variant=='corrected' else '街办发 [2026] 005号'
        assert fields['reference']==expected_reference
        actual,pages=pdf_text(folder/(variant+'.pdf'))
        assert compact(actual)==compact(fields['title']+expected_reference+fields['body'])
        assert expected_reference in actual, 'Reference characters/spaces changed in PDF'
        if profile=='chrome':
            assert word_text(folder/(variant+'.docx'))==[fields['title'],expected_reference,fields['body']]
            assert compact((folder/(variant+'.txt')).read_text('utf-8-sig'))==compact(expected_reference+fields['title']+fields['body'])
        summary.append({'task':'CEO-006','profile':profile,'variant':variant,'referenceExact':True,'pdfPages':pages})
for task,name in [('ceo-005','consistency.json'),('ceo-006','result.json')]:
    cases=json.loads((root/'build/qa'/task/name).read_text('utf-8'))
    assert len(cases)==3 and all(case['passed'] and not case['errors'] for case in cases)
header_cases=json.loads((root/'build/qa/ceo-006-letterhead/result.json').read_text('utf-8'))
assert len(header_cases)==3 and all(case['passed'] and not case['errors'] for case in header_cases)
for profile in ['chrome','firefox','webkit']:
    folder=root/'build/qa/ceo-006-letterhead'/profile
    for variant in ['with-letterhead','without-letterhead']:
        fields=json.loads((folder/(variant+'.json')).read_text('utf-8'))
        active=variant=='with-letterhead';assert fields['agency']=='合成街道办事处' and fields['letterhead']==active
        expected=([fields['agency']+'文件'] if active else [])+[fields['title'],fields['recipient']+'：',fields['body'],fields['signature']]
        actual,pages=pdf_text(folder/(variant+'.pdf'));assert compact(actual)==compact(''.join(expected))
        with pdfplumber.open(folder/(variant+'.pdf')) as pdf:
            red=[char['text'] for p in pdf.pages for char in p.chars if isinstance(char['non_stroking_color'],(tuple,list)) and tuple(char['non_stroking_color'])==(1,0,0)]
        assert bool(red)==active
        if active:assert ''.join(red)==fields['agency']+'文件'
        if profile=='chrome':assert word_text(folder/(variant+'.docx'))==expected
        summary.append({'task':'CEO-006-letterhead','profile':profile,'variant':variant,'exactSource':True,'redHeading':active,'pdfPages':pages})
source_names=['web/write.js','web/write-reference.js','web/write-checks.js','web/write.html','web/write-model.js','web/fonts/ui-400.woff','web/fonts/ui-700.woff']
for name in source_names:
    if name!='web/write.html':assert (root/name).read_bytes()==(root/'build/qa/ceo-005-web'/name.removeprefix('web/')).read_bytes(),'Stale build '+name
result={'cases':summary,'sources':{name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in source_names}}
(root/'build/qa/ceo-005/verified-outputs.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),'utf-8')
print(json.dumps({'verified':True,'cases':len(summary),'pdfPages':sum(case['pdfPages'] for case in summary)}))
