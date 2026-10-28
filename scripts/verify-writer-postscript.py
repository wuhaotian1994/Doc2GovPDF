import hashlib,json,re
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
from pypdf import PdfReader
root=Path(__file__).resolve().parent.parent
out=root/'build/qa/ceo-004-postscript'
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
compact=lambda text:''.join(text.split()).replace('\ufeff','')
cases=json.loads((out/'result.json').read_text('utf-8'))
assert len(cases)==3 and all(case['passed'] and not case['errors'] for case in cases)
summary=[]
for profile in ['chrome-baseline','chrome','firefox','webkit']:
    folder=out/profile
    base=json.loads((folder/'original.json').read_text('utf-8'))
    source=base['fields']['sourceMaterial'].splitlines()
    assert len([line for line in source if line.strip()])==31
    for variant in ['original'] if profile.endswith('baseline') else ['original','simulated']:
        saved=json.loads((folder/(variant+'.json')).read_text('utf-8'))
        fields=saved['fields'];expected=[line for line in source if line.strip()]
        if not profile.endswith('baseline'):
            assert saved['version']==3 and fields['date']=='2024-04-03'
            assert fields['signature']=='万盛街道办事处'
            assert len(fields['postscript'].splitlines())==2
            assert not fields['signature'].startswith('附件')
            assert fields['postscript'] not in fields['body']
            expected[28]='2024年4月3日'
            if variant=='simulated':expected[0]=fields['title'];expected[-1]='（模拟附注更正，仅供本地验证）'
        with ZipFile(folder/(variant+'.docx')) as package:
            doc=ET.fromstring(package.read('word/document.xml'))
        paragraphs=[p for p in doc.findall('w:body/w:p',ns) if ''.join(n.text or '' for n in p.findall('.//w:t',ns))]
        text=[''.join(n.text or '' for n in p.findall('.//w:t',ns)) for p in paragraphs]
        assert text==expected,(profile,variant,'exact Word paragraph order/source')
        alignment=lambda p:p.find('w:pPr/w:jc',ns).get('{'+ns['w']+'}val')
        if profile.endswith('baseline'):assert alignment(paragraphs[-4])!='right'
        else:
            assert alignment(paragraphs[-4])==alignment(paragraphs[-3])=='right'
            assert alignment(paragraphs[-2])==alignment(paragraphs[-1])=='left'
            assert (folder/'source.txt').read_text('utf-8')==base['fields']['sourceMaterial']
        pdf=PdfReader(folder/(variant+'.pdf'))
        # Content-stream order avoids geometric sorting swapping a hanging
        # opening quote with the preceding glyph. Matching remains exact.
        pdf_text='\n'.join(re.sub(r'\s*—\s*'+str(i)+r'\s*—\s*$','',page.extract_text() or '') for i,page in enumerate(pdf.pages,1))
        assert compact(pdf_text)==compact(''.join(expected)),(profile,variant,'PDF source/order')
        pages=len(pdf.pages)
        assert compact((folder/(variant+'.txt')).read_text('utf-8-sig'))==compact(''.join(expected))
        summary.append({'profile':profile,'variant':variant,'wordParagraphs':len(paragraphs),'pdfPages':pages,'exactWordPDFTXT':True,'signingAndDateRightAligned':not profile.endswith('baseline'),'annotationsAfterDate':not profile.endswith('baseline'),'docxSHA256':hashlib.sha256((folder/(variant+'.docx')).read_bytes()).hexdigest()})
source_names=['web/write.js','web/write.html','web/write-model.js','web/write-materials.js','web/write-checks.js','web/write-boot.js','web/fonts/ui-400.woff','web/fonts/ui-700.woff']
for name in source_names:
    if name not in ['web/write.html','web/write-boot.js']:assert (root/name).read_bytes()==(root/'build/qa/ceo-004-postscript-web'/name.removeprefix('web/')).read_bytes(),'Stale build '+name
(out/'verified.json').write_text(json.dumps({'cases':summary,'sources':{name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in source_names}},ensure_ascii=False,indent=2),'utf-8')
print(json.dumps({'verified':True,'cases':len(summary),'pages':[(item['profile'],item['variant'],item['pdfPages']) for item in summary]}))
