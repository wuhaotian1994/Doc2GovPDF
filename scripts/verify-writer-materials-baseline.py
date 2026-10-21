import json
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET

root=Path(__file__).resolve().parent.parent / 'build/qa/ceo-004'
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
cases=json.loads((root/'baseline.json').read_text('utf-8'))
summary=[]
for case in cases:
    folder=root/(case['id']+'-baseline')
    naive,manual=paragraphs(folder/'naive.docx'),paragraphs(folder/'manual.docx')
    if case['id']=='notice':
        signature=case['savedFields']['signature']
        assert next(p for p in naive if p['text']==signature)['align']!='right'
        assert next(p for p in manual if p['text']==signature)['align']=='right'
        recipient=case['savedFields']['recipient']+'：'
        assert next(p for p in naive if p['text']==recipient)['firstLine']!=next(p for p in manual if p['text']==recipient)['firstLine']
    else:
        assert len(naive)==5 and len(manual)==3
    assert not case['originalMaterialFieldPresent']
    summary.append({'id':case['id'],'logicalPreparation':case['logicalPreparation'],'naiveParagraphs':len(naive),'manualParagraphs':len(manual),
                    'hasOriginalMaterialField':case['originalMaterialFieldPresent'],'leftGuided':case['leavesGuidedFlow']})
(root/'baseline-verified.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),'utf-8')
print(json.dumps({'baselineVerified':True,'cases':summary}))
