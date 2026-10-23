"""Validate actual PDF output against the public OFL test font identities."""
from pathlib import Path
from io import BytesIO
import sys, json, re, hashlib
from pypdf import PdfReader
from fontTools.ttLib import TTFont

folder = Path(sys.argv[1])
reader = PdfReader(folder / 'local.pdf')
text = re.sub(r'\s', '', ''.join(page.extract_text() for page in reader.pages))
assert '关于资料整理的通知' in text and '请各部门核对工作记录。' in text
faces = {}
body = []
for page in reader.pages:
    for ref in page['/Resources']['/Font'].values():
        font = ref.get_object()
        face = font['/DescendantFonts'][0].get_object()
        data = face['/FontDescriptor']['/FontFile2'].get_data()
        actual = TTFont(BytesIO(data))
        names = sorted({item.toUnicode() for item in actual['name'].names if item.nameID in (1,4,6)})
        faces[str(font['/BaseFont'])] = names
    def visitor(value, cm, tm, font, size):
        if '请' in value: body.append(str(font['/BaseFont']))
    page.extract_text(visitor_text=visitor)
assert body and all(any('NotoSerifSC-Regular' in name for name in faces[key]) for key in body)
report = {'pages':len(reader.pages),'expectedTextPresent':True,'bodyUsesSelectedRegularFace':True,'embeddedActualNames':faces,'sha256':hashlib.sha256((folder/'local.pdf').read_bytes()).hexdigest(),'fixtureBoundary':'OFL synthetic local-font test, not a standard Chinese office font sample'}
(folder/'verified.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(report))
