from pathlib import Path
import os,json,re,hashlib,zipfile,posixpath,xml.etree.ElementTree as ET
from pypdf import PdfReader

r=Path(__file__).resolve().parent.parent
q=r/os.environ.get('FONT_ACCESS_OUTPUT','build/qa/font-access')
BODY='请各科室核对库存12箱，编号A-17。'
EXPECTED='Noto Serif SC Black'
W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
sha=lambda b:hashlib.sha256(b).hexdigest()
allowed_builtin={sha((r/'assets/fonts/NotoSerifSC.ttf').read_bytes()):'Noto Serif SC',sha((r/'assets/fonts/NotoSerifSC-Black.ttf').read_bytes()):'Noto Serif SC Black'}
report={'profiles':[],'files':[],'boundary':'Selected OFL fixture font legacy ID1 is declared in generated Word. Embedded payloads are checked against fixed builtin OFL sources; a same-name relationship alone cannot prove selected-font provenance. Receiving Word may substitute. Native Word glyph equality and conformance are not inferred from font declarations.'}

def names(b,start=0):
    n=int.from_bytes(b[start+4:start+6],'big')
    for i in range(n):
        p=start+12+16*i
        if b[p:p+4]!=b'name':continue
        at=int.from_bytes(b[p+8:p+12],'big');length=int.from_bytes(b[p+12:p+16],'big');table=b[at:at+length]
        count=int.from_bytes(table[2:4],'big');strings=int.from_bytes(table[4:6],'big');out={}
        for j in range(count):
            p=6+12*j;platform=int.from_bytes(table[p:p+2],'big');kind=int.from_bytes(table[p+6:p+8],'big');size=int.from_bytes(table[p+8:p+10],'big');offset=int.from_bytes(table[p+10:p+12],'big')
            if platform in (0,3) and kind in (1,2,4,6,16,17):out.setdefault(str(kind),set()).add(table[strings+offset:strings+offset+size].decode('utf-16be',errors='strict'))
        return {k:sorted(v) for k,v in out.items()}
    return {}

collection=(r/'build/qa/font-access/two-face.ttc').read_bytes();assert collection[:4]==b'ttcf'
second=int.from_bytes(collection[16:20],'big');fixture=names(collection,second)
assert fixture['1']==[EXPECTED] and fixture['16']==['Noto Serif SC'],fixture
report['fixture']={'ttcSHA256':sha(collection),'selectedIndex':1,'nameIDs':fixture,'expectedLegacyFamily':EXPECTED}

def inspect_pdf(file,fallback=False):
    reader=PdfReader(file);text=''.join(p.extract_text() or '' for p in reader.pages)
    assert BODY in re.sub(r'\s','',text),(file.name,'body lost')
    fonts=[];body=[]
    for page in reader.pages:
        for ref in page['/Resources']['/Font'].values():
            f=ref.get_object();face=f.get('/DescendantFonts',[f])[0].get_object();d=face.get('/FontDescriptor');d=d.get_object() if d else None
            if d and d.get('/FontFile2'):
                data=d['/FontFile2'].get_data();fonts.append({'baseFont':str(f['/BaseFont']),'nameIDs':names(data),'embeddedSHA256':sha(data)})
        def visitor(text,cm,tm,font,size):
            if '请' in text:body.append({'baseFont':str(font['/BaseFont']),'sizePt':size})
        page.extract_text(visitor_text=visitor)
    assert body and all(abs(v['sizePt']-16)<.01 for v in body),(file.name,body)
    expected='Noto Serif SC' if fallback else EXPECTED
    for v in body:
        matches=[f for f in fonts if f['baseFont']==v['baseFont']]
        assert matches and all(expected in f['nameIDs'].get('1',[]) for f in matches),(file.name,v,matches)
    return {'pdfSHA256':sha(file.read_bytes()),'pdfPages':len(reader.pages),'bodyFonts':body,'embeddedFonts':fonts}

def inspect_docx(file,fallback=False):
    with zipfile.ZipFile(file) as z:
        doc=ET.fromstring(z.read('word/document.xml'))
        matches=[p for p in doc.iter(W+'p') if ''.join(t.text or '' for t in p.iter(W+'t'))==BODY]
        assert len(matches)==1,(file.name,'body paragraph absent or duplicated')
        runs=[]
        for run in matches[0].iter(W+'r'):
            if not any((t.text or '') for t in run.iter(W+'t')):continue
            pr=run.find(W+'rPr');assert pr is not None
            font=pr.find(W+'rFonts');size=pr.find(W+'sz');assert font is not None and size is not None
            slots={name:font.get(W+name) for name in ('ascii','hAnsi','eastAsia','cs')};assert float(size.get(W+'val'))/2==16
            if fallback:assert slots['eastAsia']=='Noto Serif SC',(file.name,slots)
            else:assert all(slots[k]==EXPECTED for k in ('ascii','hAnsi','eastAsia')) and slots['cs'] in (None,EXPECTED),(file.name,slots)
            runs.append({'slots':slots,'sizePt':16})
        assert runs
        table=ET.fromstring(z.read('word/fontTable.xml')) if 'word/fontTable.xml' in z.namelist() else None
        target_name='Noto Serif SC' if fallback else EXPECTED
        target=[f for f in table.findall(W+'font') if f.get(W+'name')==target_name] if table is not None else []
        embeds=[child for f in target for child in f if child.tag.startswith(W+'embed')]
        parts=[n for n in z.namelist() if n.startswith('word/fonts/')]
        if fallback:assert embeds and parts,(file.name,'OFL fallback embedding behavior changed')
        relns='{http://schemas.openxmlformats.org/package/2006/relationships}';rns='{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
        rels=ET.fromstring(z.read('word/_rels/fontTable.xml.rels')) if 'word/_rels/fontTable.xml.rels' in z.namelist() else None
        targets={n.get('Id'):n.get('Target') for n in rels.findall(relns+'Relationship')} if rels is not None else {}
        checked=[]
        for f in table.findall(W+'font') if table is not None else []:
            for embed in f:
                if not embed.tag.startswith(W+'embed'):continue
                target=targets[embed.get(rns+'id')];part=posixpath.normpath('word/'+target);assert part.startswith('word/fonts/'),part
                key=bytes.fromhex(embed.get(W+'fontKey').strip('{}').replace('-',''));assert len(key)==16
                raw=bytearray(z.read(part));assert len(raw)>32
                for i in range(32):raw[i]^=key[15-i%16]
                digest=sha(raw);assert digest in allowed_builtin,(file.name,'unexpected font payload beyond fixed OFL assets',part,digest)
                checked.append({'part':part,'declaredFamily':f.get(W+'name'),'decodedSHA256':digest,'knownBuiltinFamily':allowed_builtin[digest],'nameIDs':names(raw)})
        assert set(parts)=={v['part'] for v in checked},(file.name,'unreferenced or unexplained font part')
    return {'docxSHA256':sha(file.read_bytes()),'wordRuns':runs,'wordReliesOnReceiverFont':target_name,'selectedFamilyAlsoHasBuiltinFallbackRelationship':bool(embeds),'embeddedBuiltinSources':checked,'fallbackFontParts':len(parts),'embeddingBoundary':'Every embedded font equals a fixed existing OFL asset; same-name builtin fallback may serve this fixture. Custom-only/non-OFL provenance is separately proved by Go fixtures, not by the family name or these equal-source files.'}

runs=json.loads((q/'report.json').read_text(encoding='utf8'))
for run in runs:
    assert run['passed'] and not run['errors'];profile=run['profile'];assert run.get('wasm'),'Missing actual engine byte binding'
    report['profiles'].append({'profile':profile,'browserVersion':run['browserVersion'],'checks':len(run['checks']),'actualWasmSHA256':sorted(set(run['wasm']))})
    for phase in ('','-restored','-reopened','-fallback'):
        label=profile+phase;fallback=phase=='-fallback';pdf=q/(label+'.pdf');docx=q/(label+'.docx')
        result={'profile':profile,'phase':phase or 'selected','fallback':fallback,**inspect_pdf(pdf,fallback),**inspect_docx(docx,fallback)}
        if phase=='-reopened':assert docx.read_bytes()==(q/(profile+'-restored.docx')).read_bytes(),'Unedited source Word was rewritten';result['nativeWordBytesUnchanged']=True
        report['files'].append(result)
report['passed']=True
(q/'verified.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print('Actual selected/restored/reopened PDF face and Word existing-slot legacy-family identity, fixed OFL embedded byte sources, and unchanged fallback verified')
