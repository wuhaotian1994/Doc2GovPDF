import hashlib
import json
import re
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
import pdfplumber

root=Path(__file__).resolve().parent.parent
out=root/'build/qa/ceo-004'
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
def paragraphs(path):
    with ZipFile(path) as package:
        doc=ET.fromstring(package.read('word/document.xml'))
    result=[]
    for p in doc.findall('w:body/w:p',ns):
        text=''.join(n.text or '' for n in p.findall('.//w:t',ns))
        if not text: continue
        alignment=p.find('w:pPr/w:jc',ns)
        indent=p.find('w:pPr/w:ind',ns)
        result.append({'text':text,'align':alignment.get('{'+ns['w']+'}val') if alignment is not None else None,
                       'firstLine':indent.get('{'+ns['w']+'}firstLine') if indent is not None else None})
    return result
def compact(text):return ''.join(text.split()).replace('\ufeff','')
summary=[]
cases=json.loads((out/'browser-result.json').read_text('utf-8'))
assert len(cases)==6 and all(case['passed'] and not case['errors'] for case in cases)
for profile in ['chrome','firefox','webkit']:
    for material in ['notice','wrapped']:
        folder=out/(profile+'-'+material)
        saved=json.loads((folder/'draft.gongwen.json').read_text('utf-8'))
        fields=saved['fields'];source=(folder/'original.txt').read_text('utf-8')
        assert saved['version']==2 and fields['sourceMaterial']==source
        assert '9071' in fields['pendingMaterial']
        p=paragraphs(folder/'final.docx')
        body=[line for line in fields['body'].split('\n') if line.strip()]
        expected=[fields['title']]+([fields['recipient']+'：'] if fields['recipient'] else [])+body+([fields['signature']] if fields['signature'] else [])+(['2026年10月21日'] if fields['date'] else [])
        assert [row['text'] for row in p]==expected,(profile,material,p,expected)
        if material=='notice':
            assert next(row for row in p if row['text']=='各部门：')['firstLine']=='0'
            for text in ['综合办公室','2026年10月21日']:
                assert next(row for row in p if row['text']==text)['align']=='right'
            assert '2026年10月23日' in fields['body'] and fields['date']=='2026-10-21'
        else:
            assert len(body)==2 and len(p)==3
            assert source.count('\n')>fields['body'].count('\n')
        with pdfplumber.open(folder/'final.pdf') as pdf:
            # Footer page numbers are generated layout, not authored text.
            pdf_text='\n'.join(re.sub(r'\s*—\s*'+str(i)+r'\s*—\s*$','',page.extract_text() or '') for i,page in enumerate(pdf.pages,1))
            assert compact(pdf_text)==compact(''.join(expected)),(profile,material,pdf_text)
            pages=len(pdf.pages)
        txt=(folder/'final.txt').read_text('utf-8-sig')
        assert compact(txt)==compact(''.join(expected))
        assert all('9071' not in text for text in [pdf_text,txt,''.join(row['text'] for row in p)])
        summary.append({'profile':profile,'material':material,'paragraphs':len(p),'pdfPages':pages,'exactWordParagraphs':True,'exactPDFAndTXTContent':True,'originalRecovered':True,'pendingExcluded':True,
                        'files':{name:hashlib.sha256((folder/name).read_bytes()).hexdigest() for name in ['final.docx','final.pdf','final.txt','original.txt','draft.gongwen.json']}})
result={'cases':summary,'verifiedSources':{name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in ['web/write.js','web/write.html','web/write-boot.js','web/write-model.js','web/write-materials.js','web/write-checks.js','web/browser-api.js']}}
for name in ['write.js','write-model.js','write-materials.js','write-checks.js','browser-api.js','write.css','fonts/ui-400.woff','fonts/ui-700.woff']:
    assert (root/'web'/name).read_bytes()==(root/'build/qa/ceo-004-web'/name).read_bytes(), 'Stale build: '+name
(out/'verified-outputs.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),'utf-8')
print(json.dumps({'verified':True,'cases':len(summary),'pdfPages':sum(row['pdfPages'] for row in summary)}))
