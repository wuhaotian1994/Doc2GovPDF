from pathlib import Path
import hashlib,json,zipfile,xml.etree.ElementTree as E,sys,re
from pypdf import PdfReader
r=Path(__file__).resolve().parent.parent;q=Path(sys.argv[1]);final=Path(sys.argv[2]);W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}';sha=lambda b:hashlib.sha256(b).hexdigest()
def document(p):
 with zipfile.ZipFile(p) as z:return z.read('word/document.xml'),{i.filename:z.read(i) for i in z.infolist() if i.filename!='word/document.xml'}
old,oldparts=document(q/'baseline/original.docx');new,newparts=document(final/'original.docx');assert oldparts==newparts,'Other DOCX package members changed'
def sans_keep(data):
 root=E.fromstring(data)
 for p in root.iter():
  for c in list(p):
   if c.tag==W+'keepNext':p.remove(c)
 return E.tostring(root)
assert sans_keep(old)==sans_keep(new),'Content/format changed beyond keepNext'
source=json.loads((q/'original.gongwen.json').read_text(encoding='utf8'));report=json.loads((final/'report.json').read_text(encoding='utf8'));assert report['restoredExactly'] and report['reopenedExactly'] and report['exportKeptOriginal'] and report['passed'] and not report['errors']
integrity=json.loads((final/'integrity.local.json').read_text(encoding='utf8'));native=json.loads((final/'word-native.local.json').read_text(encoding='utf-8-sig'));assert native['sourceSHA256']==sha((final/'original.docx').read_bytes())
def norm(s):return re.sub(r'\s','',s)
def locations(pdf):
 pages=[norm(p.extract_text() or '') for p in PdfReader(pdf).pages]
 text=lambda i:norm(source['content']['blocks'][i]['text'])
 where=lambda marker:[i+1 for i,p in enumerate(pages) if marker in p]
 # All text is unchanged by the stronger Word package/XML check above.
 # These shorter markers are derived from the supplied input, not replacement text.
 title=where(text(33)[:14]);unit=where(text(34)[:5]);lead=where(text(35)[:14]);note=where(text(26)[:14])
 grids=[b for b in source['content']['blocks'] if b['type']=='table'];headers=[where(norm(''.join(c['text'] for c in b['rows'][0]['cells']))) for b in grids]
 caption=where(text(24)[:12]);assert title and unit and lead and set(title)&set(unit)&set(lead)&set(headers[2]),'Receipt lead-in separated'
 assert caption and note and set(caption)&set(note)&set(headers[0]),'Compact table and note separated'
 return {'pages':len(pages),'receiptTitlePages':title,'unitPages':unit,'receiptLeadPages':lead,'tableHeaderPages':headers,'compactCaptionPages':caption,'compactNotePages':note}
def native_locations():
 # Native Word's exact Find/Range page positions are authoritative here.
 # Word PDF text extraction splits some runs in a different order; use its
 # original source hash, COM pagination and visually inspected rendered pages.
 positions=[x['page'] for x in native['positions']];tables=native['tables']
 assert positions[0]==positions[1]==tables[0]['startPage']==tables[0]['endPage']
 assert positions[2]==positions[3]==positions[4]==tables[2]['startPage']==tables[2]['endPage']
 return {'pages':native['pages'],'receiptTitlePages':[positions[2]],'unitPages':[positions[3]],'receiptLeadPages':[positions[4]],'tables':tables,'compactCaptionPages':[positions[0]],'compactNotePages':[positions[1]],'method':'Word16 Find/Range.Information with source DOCX SHA256 plus all-page rendered PDF inspection; not PDF text-prefix inference.'}
summary={'sourceSHA256':sha((q/'original.gongwen.json').read_bytes()),'sourceBytes':(q/'original.gongwen.json').stat().st_size,'blocks':39,'tables':integrity['tables'],'formatUnchangedExceptKeepNext':True,'otherDOCXMembersByteIdentical':True,'wordSizeHalfPoints':integrity['sizesHalfPoints'],'restoredExactly':True,'reopenedExactly':True,'exportKeptOriginal':True,'browserErrors':report['errors'],'directPDF':locations(final/'original.pdf'),'nativeWordPDF':native_locations(),'wordVersion':native['wordVersion'],'outputHashes':{p.name:sha(p.read_bytes()) for p in final.glob('original.*') if p.suffix in ['.pdf','.docx']},'sourceFiles':{name:sha((r/name).read_bytes()) for name in ['web/write-content.js','internal/office/pdf.go','internal/office/title_layout.go']},'pageImages':{p.name:sha(p.read_bytes()) for p in final.glob('*.png') if p.name.startswith(('actual-','native-'))},'method':'Supplied original through normal visible import, save/reopen and actual exports. Original manuscript and rendered pages remain local, not committed. No deletion, smaller fonts or margin changes.'}
(final/'verified.local.json').write_text(json.dumps(summary,indent=2),encoding='utf8');print(json.dumps(summary))
