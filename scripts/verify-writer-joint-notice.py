import hashlib,json,re
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
import pdfplumber
root=Path(__file__).resolve().parent.parent
out=root/'build/qa/ceo-004-joint'
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
compact=lambda s:''.join(s.split()).replace('\ufeff','')
results=json.loads((out/'result.json').read_text('utf-8'))
assert len(results)==3 and all(case['passed'] and not case['errors'] for case in results)
summary=[]
for profile in ['chrome','firefox','webkit']:
    folder=out/profile
    original=json.loads((folder/'original-draft.json').read_text('utf-8'))['fields']
    simulated=json.loads((folder/'simulated-draft.json').read_text('utf-8'))['fields']
    names=original['signature'].splitlines()
    assert names==['济源市北海街道办事处','济源市公安局交通管理支队']
    assert original['date']=='2024-05-15' and simulated['date']=='2024-05-16'
    assert all(original[key]==simulated[key] for key in original if key not in ['title','date'])
    for variant in ['preserved-in-body','arranged','simulated']:
        fields=simulated if variant=='simulated' else original
        source=fields['sourceMaterial'].splitlines()
        expected=([line for line in source if line.strip()] if variant=='preserved-in-body' else [fields['title'],*[line for line in fields['body'].splitlines() if line.strip()],*names,'2024年5月16日' if variant=='simulated' else '2024年5月15日'])
        with ZipFile(folder/(variant+'.docx')) as package:
            document=ET.fromstring(package.read('word/document.xml'))
        paragraphs=[p for p in document.findall('w:body/w:p',ns) if ''.join(n.text or '' for n in p.findall('.//w:t',ns))]
        texts=[''.join(n.text or '' for n in p.findall('.//w:t',ns)) for p in paragraphs]
        assert texts==expected,(profile,variant,'Word source/order mismatch')
        if variant!='preserved-in-body':
            assert texts[-3:-1]==names
            for p in paragraphs[-3:]:assert p.find('w:pPr/w:jc',ns).get('{'+ns['w']+'}val')=='right'
        with pdfplumber.open(folder/(variant+'.pdf')) as pdf:
            text='\n'.join(re.sub(r'\s*—\s*'+str(i)+r'\s*—\s*$','',p.extract_text() or '') for i,p in enumerate(pdf.pages,1))
            assert compact(text)==compact(''.join(expected)),(profile,variant,'PDF source/order mismatch')
            pages=len(pdf.pages)
        assert compact((folder/(variant+'.txt')).read_text('utf-8-sig'))==compact(''.join(expected))
        assert all(texts.count(name)==1 for name in names)
        summary.append({'profile':profile,'variant':variant,'pages':pages,'exactWordPDFTXT':True,'jointOrderPreserved':True,'noDuplicateSignature':True,'docxSHA256':hashlib.sha256((folder/(variant+'.docx')).read_bytes()).hexdigest()})
(out/'verified.json').write_text(json.dumps({'cases':summary},ensure_ascii=False,indent=2),'utf-8')
print(json.dumps({'verified':True,'cases':len(summary),'pdfPages':sum(case['pages'] for case in summary)}))
