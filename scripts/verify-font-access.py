from pathlib import Path
import os,json,re,hashlib,zipfile,posixpath,struct,xml.etree.ElementTree as ET
from pypdf import PdfReader

r=Path(__file__).resolve().parent.parent
q=r/os.environ.get('FONT_ACCESS_OUTPUT','build/qa/font-access')
BODY='请各科室核对库存12箱，编号A-17。'
EXPECTED='Noto Serif SC Black'
W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
sha=lambda b:hashlib.sha256(b).hexdigest()
DERIVED_REGULAR='Doc2GovPDF Serif SC 3429e'
DERIVED_BLACK=DERIVED_REGULAR+' Black'
# Independent exact contracts: names are never evidence of a payload's source/license.
BUILTIN_CONTRACTS={
    DERIVED_REGULAR:{'source':'NotoSerifSC.ttf','sha256':'9502147ceba7b5bc7fd3415083f6a5d133f22d8f9efb4974d4b85f3a97ea2d3a','sourceFamily':'Noto Serif SC','style':'Regular','weight':400,'postscript':'Doc2GovPDFSerifSC3429e-Regular'},
    DERIVED_BLACK:{'source':'NotoSerifSC-Black.ttf','sha256':'0f048849cd9c0514f9915e25673801d37196c57af8e3b804f0185a3b23b53ac1','sourceFamily':'Noto Serif SC Black','style':'Black','weight':900,'postscript':'Doc2GovPDFSerifSC3429e-Black'},
}
verified_builtin_cache={}

def sfnt_checksum(data):
    padded=bytes(data)+b'\0'*((-len(data))%4)
    return sum(value[0] for value in struct.iter_unpack('>I',padded))&0xffffffff

def sfnt_tables(data):
    data=bytes(data)
    assert len(data)>=12 and data[:4]==b'\0\1\0\0','Expected a complete standalone TrueType SFNT'
    count=int.from_bytes(data[4:6],'big');assert 0<count<=4096 and 12+16*count<=len(data),'Invalid SFNT directory'
    power=1<<(count.bit_length()-1)
    assert struct.unpack('>HHH',data[6:12])==(power*16,power.bit_length()-1,count*16-power*16),'Invalid SFNT search fields'
    tables={};spans=[];tags=[]
    for i in range(count):
        record=12+16*i;tag=data[record:record+4].decode('ascii');checksum,offset,length=struct.unpack('>III',data[record+4:record+16])
        assert tag not in tables and offset%4==0 and offset>=12+16*count and offset+length<=len(data),'Invalid SFNT table boundary'
        table=data[offset:offset+length];checked=table
        if tag=='head':
            assert length>=54 and table[12:16]==b'\x5f\x0f\x3c\xf5','Invalid TrueType head'
            checked=table[:8]+b'\0'*4+table[12:]
        assert sfnt_checksum(checked)==checksum,'SFNT table checksum mismatch: '+tag
        tables[tag]=table;spans.append((offset,offset+length));tags.append(tag)
    assert tags==sorted(tags),'SFNT directory tags are not ordered'
    assert all(a[1]<=b[0] for a,b in zip(sorted(spans),sorted(spans)[1:])),'Overlapping SFNT tables'
    end=12+16*count
    for start,stop in sorted(spans):
        assert not any(data[end:start]),'Unexplained data between SFNT tables'
        end=stop
    assert len(data)==(end+3)//4*4 and not any(data[end:]),'Unexplained SFNT tail beyond alignment padding'
    assert {'head','name','OS/2'}<=tables.keys() and sfnt_checksum(data)==0xb1b0afba,'Invalid whole-SFNT checksum'
    return tables

def font_name_records(table):
    assert len(table)>=6 and table[:2]==b'\0\0','Expected fixed OFL name format 0'
    count,start=struct.unpack('>HH',table[2:6]);assert 6+12*count<=start<=len(table),'Invalid name table boundary'
    records={};used=bytearray(len(table));used[:6+12*count]=b'\1'*(6+12*count)
    for i in range(count):
        platform,encoding,language,kind,length,offset=struct.unpack('>HHHHHH',table[6+i*12:18+i*12]);key=(platform,encoding,language,kind)
        assert key not in records and start+offset+length<=len(table),'Invalid/duplicate name record'
        records[key]=table[start+offset:start+offset+length];used[start+offset:start+offset+length]=b'\1'*length
    assert all(mark or value==0 for mark,value in zip(used,table)),'Unreferenced nonzero data in name table'
    return records

def verify_derived_builtin(raw,declared_family):
    assert declared_family in BUILTIN_CONTRACTS,'Embedding is not an explicitly pinned OFL derived family'
    raw=bytes(raw);digest=sha(raw);cache_key=(digest,declared_family)
    if cache_key in verified_builtin_cache:return verified_builtin_cache[cache_key]
    contract=BUILTIN_CONTRACTS[declared_family];source=(r/'assets/fonts'/contract['source']).read_bytes()
    assert sha(source)==contract['sha256'],'Pinned OFL source bytes changed'
    original=sfnt_tables(source);derived=sfnt_tables(raw)
    assert original.keys()==derived.keys(),'Derived SFNT changed the table set'
    exact=[]
    for tag in original:
        if tag=='name':continue
        if tag=='head':assert original[tag][:8]+original[tag][12:]==derived[tag][:8]+derived[tag][12:],'Derived font changed head beyond checksumAdjustment'
        else:assert original[tag]==derived[tag],'Derived font changed non-name OFL table: '+tag
        if tag!='head':exact.append(tag)
    before=font_name_records(original['name']);after=font_name_records(derived['name']);changed_ids={1,3,4,6,16,25}
    assert before.keys()<=after.keys(),'Derived font discarded original name records'
    for key,value in before.items():
        if key[3] not in changed_ids:assert after[key]==value,'Original copyright/license/other name record changed'
    added=set(after)-set(before)
    assert (added<={(3,1,0x409,16),(3,1,0x409,17)} and contract['style']=='Regular') or not added,'Unexpected added name records'
    expected={1:declared_family,2:'Regular',3:'Doc2GovPDF;3429e;'+contract['postscript'],4:declared_family+(' Regular' if contract['style']=='Regular' else ''),6:contract['postscript'],16:DERIVED_REGULAR,17:contract['style'],25:'Doc2GovPDFSerifSC3429e'}
    for key,value in after.items():
        if key[3] not in expected:continue
        assert key[0] in (0,3) and value.decode('utf-16be',errors='strict')==expected[key[3]],'Derived identity differs from the exact expected name contract'
    assert {1,2,3,4,6,16,17}<= {key[3] for key in after},'Derived font family/style identity missing'
    assert all(any(key[3]==kind and value for key,value in before.items()) for kind in (0,13,14)),'Pinned copyright/license records absent'
    assert int.from_bytes(derived['OS/2'][4:6],'big')==contract['weight'],'Pinned OFL weight changed'
    result={'declaredFamily':declared_family,'decodedSHA256':digest,'knownBuiltinFamily':contract['sourceFamily'],'fixedSourceSHA256':contract['sha256'],'nameIDs':names(raw),'weightClass':contract['weight'],'exactNonNameTables':sorted(exact),'headOnlyChecksumAdjustmentChanged':True,'copyrightAndLicenseRecordsPreserved':True,'allTableAndWholeFontChecksumsValid':True}
    verified_builtin_cache[cache_key]=result
    return result

report={'profiles':[],'files':[],'boundary':'Selected OFL fixture font legacy ID1 is declared in generated Word. Embedded DOCX payloads must match exact derived identities and every pinned OFL table except name/head checksumAdjustment, retain copyright/license records and valid SFNT checksums. Receiving Word may substitute. Native Word glyph equality and conformance are not inferred from font declarations.'}

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
            if fallback:assert all(slots[k]==DERIVED_REGULAR for k in ('ascii','hAnsi','eastAsia')) and slots['cs'] in (None,DERIVED_REGULAR),(file.name,slots)
            else:assert all(slots[k]==EXPECTED for k in ('ascii','hAnsi','eastAsia')) and slots['cs'] in (None,EXPECTED),(file.name,slots)
            runs.append({'slots':slots,'sizePt':16})
        assert runs
        table=ET.fromstring(z.read('word/fontTable.xml')) if 'word/fontTable.xml' in z.namelist() else None
        target_name=DERIVED_REGULAR if fallback else EXPECTED
        target=[f for f in table.findall(W+'font') if f.get(W+'name')==target_name] if table is not None else []
        embeds=[child for f in target for child in f if child.tag.startswith(W+'embed')]
        parts=[n for n in z.namelist() if n.startswith('word/fonts/')]
        if fallback:assert embeds and parts,(file.name,'OFL fallback embedding behavior changed')
        else:assert not embeds,(file.name,'Selected real-family declaration must not be silently replaced by a builtin embedding relationship')
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
                charset=f.find(W+'charset');assert charset is not None and charset.get(W+'val')=='86',(file.name,'Embedded Chinese fallback lacks explicit PRC charset')
                assert embed.tag==W+'embedRegular',(file.name,'Unexpected embedding slot')
                checked.append({'part':part,'charset':'86',**verify_derived_builtin(raw,f.get(W+'name'))})
        assert set(parts)=={v['part'] for v in checked},(file.name,'unreferenced or unexplained font part')
    return {'docxSHA256':sha(file.read_bytes()),'wordRuns':runs,'wordRequestedFamily':target_name,'selectedBodyRequiresReceivingFont':not fallback,'bodyUsesVerifiedEmbeddedOFL':fallback and bool(embeds),'embeddedBuiltinSources':checked,'fallbackFontParts':len(parts),'embeddingBoundary':'Each embedded derived SFNT has only the permitted name and head checksumAdjustment differences from a hash-pinned OFL asset, with all other tables exact and all checksums valid. Selected-body legacy ID1 is unchanged; custom/system-font provenance must still be proved by independent Go marker fixtures, never by the family name.'}

runs=json.loads((q/'report.json').read_text(encoding='utf8'))
expected_profiles=set(os.environ.get('FONT_ACCESS_PROFILES','chrome,firefox,webkit').split(','))
assert {run['profile'] for run in runs}==expected_profiles,'Browser report is incomplete for the requested profiles'
for run in runs:
    assert run['passed'] and not run['errors'];profile=run['profile'];assert run.get('wasm'),'Missing actual engine byte binding'
    report['profiles'].append({'profile':profile,'browserVersion':run['browserVersion'],'checks':len(run['checks']),'actualWasmSHA256':sorted(set(run['wasm']))})
    for phase in ('','-restored','-reopened','-fallback','-fallback-reopened'):
        label=profile+phase;fallback=phase in ('-fallback','-fallback-reopened');pdf=q/(label+'.pdf');docx=q/(label+'.docx')
        result={'profile':profile,'phase':phase or 'selected','fallback':fallback,**inspect_pdf(pdf,fallback),**inspect_docx(docx,fallback)}
        if phase=='-reopened':assert docx.read_bytes()==(q/(profile+'-restored.docx')).read_bytes(),'Unedited source Word was rewritten';result['nativeWordBytesUnchanged']=True
        if phase=='-fallback-reopened':assert docx.read_bytes()==(q/(profile+'-fallback.docx')).read_bytes(),'Unedited embedded-fallback Word was rewritten';result['nativeWordBytesUnchanged']=True
        report['files'].append(result)
report['passed']=True
(q/'verified.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print('Actual selected/restored/reopened PDF face and Word legacy identity, independently verified derived OFL table provenance/rights/checksums/PRC charset, and unchanged native Word bytes verified')
