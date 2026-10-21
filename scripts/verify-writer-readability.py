from pathlib import Path
import json,re,hashlib,copy,sys
from zipfile import ZipFile
from xml.etree import ElementTree as ET
from pypdf import PdfReader
root=Path(__file__).resolve().parent.parent;ceo='--ceo-drafts' in sys.argv;qa=root/('build/qa/readability-ceo' if ceo else 'build/qa/readability');ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'};compact=lambda t:re.sub(r'\s+','',t)
def pdf_pages(path):
 r=PdfReader(path);return [compact(re.sub(r'\s*—\s*'+str(i)+r'\s*—\s*$','',p.extract_text() or '')) for i,p in enumerate(r.pages,1)]
def normalize_model(value):
 if isinstance(value,dict):return {k:normalize_model(v) for k,v in value.items() if k!='keepNext'}
 if isinstance(value,list):return [normalize_model(v) for v in value]
 return value
records=[]
for profile in ['chrome','firefox','webkit']:
 for name in ['education','composite']:
  previous=None;before_model=None;before_pages=None;expected=None;pair=[]
  for phase in ['before','after']:
   folder=qa/phase/(name if profile=='chrome' else profile+'/'+name);docx=folder/'final.docx'
   with ZipFile(docx) as z:assert z.testzip() is None;xml=ET.fromstring(z.read('word/document.xml'))
   raw_text=''.join(t.text or '' for t in xml.findall('.//w:t',ns));body=xml.find('w:body',ns);flags=len(xml.findall('.//w:keepNext',ns))
   for pp in xml.findall('.//w:pPr',ns):
    for keep in pp.findall('w:keepNext',ns):pp.remove(keep)
   canonical=ET.tostring(xml);draft=json.loads((folder/'draft.json').read_text('utf-8'));model=json.loads((folder/'model.json').read_text('utf-8'));pages=pdf_pages(folder/'final.pdf')
   assert ''.join(pages)==compact(raw_text),(profile,name,phase,'PDF exact content')
   assert not any('_table_' in page for page in pages)
   if phase=='before':previous=(canonical,draft,raw_text);before_model=model;before_pages=pages;expected=compact(raw_text)
   else:
    assert canonical==previous[0],(profile,name,'Word formatting changed beyond keepNext')
    assert draft['id']==previous[1]['id'] and draft['fields']==previous[1]['fields'] and draft.get('content')==previous[1].get('content')
    assert raw_text==previous[2] and normalize_model(model)==normalize_model(before_model)
   if ceo:
    seed=json.loads((root/('docs/evidence/ceo-readability-20261022/'+name+'.gongwen.json')).read_text('utf-8'));assert draft['id']==seed['id'] and draft['fields']==seed['fields'] and draft['content']==seed['content']
   table_count=len(body.findall('w:tbl',ns));assert table_count==(1 if name=='education' else 0)
   if name=='education':
    rows=body.find('w:tbl',ns).findall('w:tr',ns);assert len(rows)==3 and all(len(r.findall('w:tc',ns))==4 for r in rows);assert all(not ''.join(t.text or '' for t in c.findall('.//w:t',ns)) for r in rows[1:] for c in r.findall('w:tc',ns))
   pair.append({'phase':phase,'pages':len(pages),'keepNextFlags':flags,'wordSHA256':hashlib.sha256(docx.read_bytes()).hexdigest(),'pdfSHA256':hashlib.sha256((folder/'final.pdf').read_bytes()).hexdigest()})
  if name=='composite':
   headings=[]
   for i,b in enumerate(before_model['blocks']):
    p=b.get('paragraph',{})
    if p.get('role')!='heading':continue
    heading=compact(p['text']);following=next(b['paragraph']['text'] for b in before_model['blocks'][i+1:] if b.get('paragraph',{}).get('text','').strip());first=compact(following)[:24];old=next(j for j,q in enumerate(before_pages) if heading in q);new=next(j for j,q in enumerate(pages) if heading in q);assert first in pages[new],(profile,heading,'orphaned after');headings.append({'heading':heading,'beforePage':old+1,'beforeWithContent':first in before_pages[old],'afterPage':new+1,'afterWithContent':True})
   assert len(headings)==6;checks={'sectionHeadingContinuity':headings}
  else:
   sentence='学校代表，学生及家长代表苏州市教育局单独通知。';assert before_pages[2].endswith('单') and before_pages[3].startswith('独通知。');assert compact(sentence) in pages[2] and not pages[3].startswith('独通知。');date=next(i for i,p in enumerate(pages) if '苏州市教育局2024年6月28日' in p);assert '（此件公开发布）' in pages[date];checks={'shortTailResolved':True,'dateAndPublicNoteSamePDFPage':date+1}
  records.append({'profile':profile,'name':name,'exactCharacters':len(expected),'sameDraftAndStructure':True,'onlyWordKeepNextChanged':True,'variants':pair,**checks})
# Native Word artifacts are bound to the actual current downloads, not an older run.
word=json.loads((qa/'word/word-render.json').read_text('utf-8-sig'));native=[]
assert isinstance(word,list) and len(word)==4,'Wait for all four native Word exports to finish'
for row in word:
 phase,name=row['file'].removesuffix('.docx').split('-',1);docx=qa/phase/name/'final.docx';assert hashlib.sha256(docx.read_bytes()).hexdigest()==row['sha256'].lower();positions=next(v for v in json.loads((qa/'word/native-pagination.json').read_text('utf-8-sig')) if v['file']==row['file'])
 with ZipFile(docx) as package:wordxml=ET.fromstring(package.read('word/document.xml'))
 expected=compact(''.join(t.text or '' for t in wordxml.findall('.//w:t',ns)))
 assert positions['sourceSHA256'].lower()==row['sha256'].lower() and positions['logicalCharacters']==len(expected) and positions['logicalTextSHA256'].lower()==hashlib.sha256(expected.encode('utf-8')).hexdigest()
 if phase=='after':
  page_map=positions['pageMap']
  if name=='education':assert page_map['mainHeading']==page_map['firstBody'] and page_map['date']==page_map['publicNote']
  else:assert all(v['headingPage']==v['contentPage'] for v in page_map['sections'])
 native.append({'file':row['file'],'pages':row['pages'],'wordVersion':row['wordVersion'],'sourceSHA256':row['sha256'].lower(),'exactNativeWordText':True,'pageMap':positions['pageMap']})
sources=['internal/office/pdf.go','internal/office/title_layout.go','web/write.js','web/write-content.js','web/write-content-editor.js','web/write-model.js','web/write-checks.js','web/write-boot.js'];source_hashes={name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in sources};engines={phase:hashlib.sha256((root/('build/qa/readability-baseline-web' if phase=='before' else 'build/qa/readability-web')/'document-engine.wasm').read_bytes()).hexdigest() for phase in ['before','after']};assert engines['before']!=engines['after']
for phase in ['before','after']:
 for profile in ['chrome','firefox','webkit']:
  report=qa/phase/('result.json' if profile=='chrome' else profile+'/result.json');values=json.loads(report.read_text('utf-8'));assert len(values)==2 and all(v['passed'] and v['engineSHA256']==engines[phase] for v in values)
  for name in ['education','composite']:
   current=next(v for v in records if v['profile']==profile and v['name']==name);representative=next(v for v in records if v['profile']=='chrome' and v['name']==name);a=next(v for v in current['variants'] if v['phase']==phase);b=next(v for v in representative['variants'] if v['phase']==phase);assert a['wordSHA256']==b['wordSHA256'],(profile,name,phase,'native Word representative differs')
record={'cases':records,'nativeWord':native,'sources':source_hashes,'engineSHA256':engines,'baselineProductCommit':'7ddb249743b45e4df7c061c939ea8d13a7e34bc6','inputSources':{name:{'path':('docs/evidence/ceo-readability-20261022/'+name+'.gongwen.json' if ceo else 'scripts/fixtures/writer-readability-'+name+'.gongwen.json'),'sha256':hashlib.sha256((root/('docs/evidence/ceo-readability-20261022/'+name+'.gongwen.json' if ceo else 'scripts/fixtures/writer-readability-'+name+'.gongwen.json')).read_bytes()).hexdigest()} for name in ['education','composite']},'visualReview':{'renderedPages':json.loads((qa/'page-review/rendered.json').read_text('utf-8'))['totalPages'] if (qa/'page-review/rendered.json').exists() else None,'uniquePages':json.loads((qa/'page-review/rendered.json').read_text('utf-8'))['uniquePages'] if (qa/'page-review/rendered.json').exists() else None,'manualReviewRecordedSeparately':True},'limitations':[('CEO source drafts received at main3e75fade and verified without changing source fields/content' if ceo else 'CEO exact nine-page composite file was not this fixed eight-page baseline'),'Word and PDF are not claimed page-identical','Normal short final pages and authored blank paragraphs remain allowed']};(qa/'verified.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),'utf-8');print(json.dumps({'verified':True,'pairedCases':len(records),'actualFiles':len(records)*4,'PDFPagesTextVerified':sum(v['pages'] for r in records for v in r['variants']),'nativeWordPages':sum(r['pages'] for r in native)}))
