"""Check actual browser downloads independently and prepare Word/PDF review pairs."""
import hashlib,json,re,zipfile
from pathlib import Path
from pypdf import PdfReader
import xml.etree.ElementTree as ET
root=Path(__file__).resolve().parent.parent
run=json.loads((root/'build/qa/web-result.json').read_text('utf-8'))
folder=Path(run['downloadDir']);audit=root/'build/qa/web-documents';audit.mkdir(exist_ok=True)
hashes={hashlib.sha256(p.read_bytes()).hexdigest() for p in (root/'testdata/upstream/gongwen-kit/docx').glob('*.docx')}
found={hashlib.sha256(p.read_bytes()).hexdigest() for p in folder.glob('*.docx')}
assert hashes==found,'Browser changed an unedited original'
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
results=[]
for template in run['templates']:
    file=folder/template['files'][0]
    case=audit/template['kind'];case.mkdir(exist_ok=True)
    with zipfile.ZipFile(file) as archive:
        assert len(archive.namelist())==2
        for ext,name in [('.docx','document.docx'),('.pdf','go.pdf')]:
            matches=[n for n in archive.namelist() if n.endswith(ext)];assert len(matches)==1
            (case/name).write_bytes(archive.read(matches[0]))
    pdf=PdfReader(case/'go.pdf');text=re.sub(r'\s+','',''.join(p.extract_text() for p in pdf.pages))
    assert f'网页版{template["kind"]}验收' in text and '附件内容完整。' in text
    if template['kind']=='rules':assert text.count('第一条')==1 and text.count('第二条')==1
    with zipfile.ZipFile(case/'document.docx') as archive:
        doc=ET.fromstring(archive.read('word/document.xml'))
        for p in doc.findall('.//w:body//w:p',ns):
            visible=re.sub(r'\s+','',''.join(t.text or '' for t in p.findall('.//w:t',ns)))
            assert not visible or visible in text,(template['kind'],visible)
    results.append({'kind':template['kind'],'pages':len(pdf.pages),'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
(audit/'verification.json').write_text(json.dumps({'passed':True,'unchangedOriginals':7,'templates':results},indent=2),'utf-8')
print('PASS: seven original DOCX byte-identical; all seven browser ZIPs contain complete Word/PDF and attachments.')
