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
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
def val(e,key='val',default=''):
    return e.get('{'+ns['w']+'}'+key,default) if e is not None else default
def chinese(n):
    digits='零一二三四五六七八九'
    if n==0:return digits[0]
    if n>=10000:
        q,r=divmod(n,10000)
        return chinese(q)+'万'+(('零' if r<1000 else '')+chinese(r) if r else '')
    out='';zero=False
    for unit,label in [(1000,'千'),(100,'百'),(10,'十'),(1,'')]:
        d,n=divmod(n,unit)
        if not d:
            if out and n:zero=True
            continue
        if zero:out+='零';zero=False
        if not(unit==10 and d==1 and not out):out+=digits[d]
        out+=label
    return out
def word_text(archive,doc):
    abstract={};numbers={};counts={}
    if 'word/numbering.xml' in archive.namelist():
        numbering=ET.fromstring(archive.read('word/numbering.xml'))
        for a in numbering.findall('w:abstractNum',ns):
            abstract[val(a,'abstractNumId')]={int(val(l,'ilvl')):l for l in a.findall('w:lvl',ns)}
        for n in numbering.findall('w:num',ns):numbers[val(n,'numId')]=abstract[val(n.find('w:abstractNumId',ns))]
    output=[]
    for p in doc.findall('.//w:body//w:p',ns):
        prefix='';np=p.find('w:pPr/w:numPr',ns)
        if np is not None:
            ident=val(np.find('w:numId',ns));level=int(val(np.find('w:ilvl',ns),default='0'));defs=numbers[ident];c=counts.setdefault(ident,[0]*9);c[level]+=1
            for deeper,l in defs.items():
                restart=int(val(l.find('w:lvlRestart',ns),default='-1'))
                if deeper>level and restart!=0 and (restart<0 or level==restart-1):c[deeper]=0
            current=defs[level];prefix=val(current.find('w:lvlText',ns))
            for i,l in defs.items():
                number=c[i]+int(val(l.find('w:start',ns),default='1'))-1
                formatted=chinese(number) if 'chinese' in val(l.find('w:numFmt',ns)).lower() else str(number)
                prefix=prefix.replace('%'+str(i+1),formatted)
        output.append(prefix+''.join(t.text or '' for t in p.findall('.//w:t',ns)))
    return '\n'.join(output)
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
                text=word_text(archive,doc)
                if item.get('expectComments'):
                    comments=ET.fromstring(archive.read('word/comments.xml'))
                    assert '营业收入' in ''.join(comments.itertext()), 'numeric review comments missing'
                    assert doc.findall('.//w:commentReference',ns), 'comment not anchored in the document'
            if item.get('original'):
                assert path.read_bytes()==Path(item['original']).read_bytes(), 'source changed'
        if not item.get('source'):
            content=re.sub(r'\s+','',text)
            for para in item['paragraphs']:
                wanted=re.sub(r'\s+','',para)
                assert not wanted or wanted in content, f'{path.name}: content missing: {wanted[:40]}'
        count+=1
print(f'PASS: {count} UI-exported files independently parsed; expected content and unchanged originals retained.')
