import hashlib,json,re
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
from pypdf import PdfReader
root=Path(__file__).resolve().parent.parent
notice=json.loads((root/'scripts/fixtures/writer-inline-notice.json').read_text('utf-8'))
composite=json.loads((root/'scripts/fixtures/writer-composite-notice.json').read_text('utf-8'))
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'};attribute=lambda key:'{'+ns['w']+'}'+key
compact=lambda text:''.join(text.split())
paragraph_text=lambda p:''.join(t.text or '' for t in p.findall('.//w:t',ns))
results=[]
for profile in ['chrome','firefox','webkit']:
 for scenario in ['notice','composite']:
  folder=root/'build/qa/inline-workspace'/profile/scenario
  saved=json.loads((folder/'final.json').read_text('utf-8'))
  assert saved['version']==4 and saved['content']['version']==1
  with ZipFile(folder/'final.docx') as package:
   assert package.testzip() is None;document=ET.fromstring(package.read('word/document.xml'))
  body=document.find('w:body',ns);paras=body.findall('w:p',ns);tables=body.findall('w:tbl',ns)
  if scenario=='notice':
   expected_paragraphs=[notice['latestTitle'],notice['body'].split('\n')[0],notice['caption'],notice['body'].split('\n')[1],notice['signature'],'2026年10月21日']
   assert [paragraph_text(p) for p in paras if paragraph_text(p)]==expected_paragraphs,(profile,'notice paragraphs')
   assert len(tables)==1
   actual_rows=[['\n'.join(paragraph_text(p) for p in cell.findall('w:p',ns)) for cell in row.findall('w:tc',ns)] for row in tables[0].findall('w:tr',ns)]
   assert actual_rows==notice['cells'],(profile,'table data')
   elements=list(body);table_at=elements.index(tables[0]);before=''.join(paragraph_text(p) for p in elements[:table_at] if p.tag==attribute('p'));after=''.join(paragraph_text(p) for p in elements[table_at+1:] if p.tag==attribute('p'))
   assert before==''.join(expected_paragraphs[:3]) and after==''.join(expected_paragraphs[3:]),'Middle table position'
   paragraph=next(p for p in paras if paragraph_text(p)==notice['body'].split('\n')[0]);assert paragraph.find('w:pPr/w:jc',ns).get(attribute('val'))=='center'
   indent=paragraph.find('w:pPr/w:ind',ns);assert indent is None or int(indent.get(attribute('firstLine'),'0'))==0
   spacing=paragraph.find('w:pPr/w:spacing',ns);assert int(spacing.get(attribute('before')))==289 and int(spacing.get(attribute('after')))==579
   expected=notice['latestTitle']+notice['body'].split('\n')[0]+notice['caption']+''.join(text for row in notice['cells'] for text in row)+notice['body'].split('\n')[1]+notice['signature']+'2026年10月21日'
   txt=(folder/'final.txt').read_text('utf-8-sig');assert '\t'.join(notice['cells'][0]) in txt and notice['cells'][1][0] in txt
   assert saved['fields']['title']==notice['latestTitle'] and saved['fields']['signature']==notice['signature'] and saved['fields']['date']==notice['date']
  else:
   assert not tables
   actual=[compact(paragraph_text(p)) for p in paras if compact(paragraph_text(p))];assert actual==list(map(compact,composite['lines'])),profile
   expected=composite['raw']
   for title in [composite['title'],composite['innerTitle']]:
    paragraph=next(p for p in paras if compact(paragraph_text(p))==compact(title));assert paragraph.find('w:pPr/w:jc',ns).get(attribute('val'))=='center';assert '44' in [node.get(attribute('val')) for node in paragraph.findall('.//w:sz',ns)]
   for text in ['国务院办公厅','2025年1月9日']:
    paragraph=next(p for p in paras if paragraph_text(p)==text);assert paragraph.find('w:pPr/w:jc',ns).get(attribute('val'))=='right'
  pdf=PdfReader(folder/'final.pdf');pages=[re.sub(r'\s*—\s*'+str(i)+r'\s*—\s*$','',page.extract_text() or '') for i,page in enumerate(pdf.pages,1)]
  assert compact(''.join(pages))==compact(expected),(profile,scenario,'PDF text and order')
  assert '_table_' not in ''.join(pages)
  results.append({'profile':profile,'scenario':scenario,'exactContentAndOrder':True,'tables':len(tables),'pdfPages':len(pages),'wordSHA256':hashlib.sha256((folder/'final.docx').read_bytes()).hexdigest()})
names=['web/write.js','web/write-engine.js','web/write-content.js','web/write-content-editor.js','web/write-model.js','web/write-checks.js','web/write-library.js','web/write-boot.js','web/browser-api.js','web/write.css','web/write-workspace.css','web/fonts/ui-400.woff','web/fonts/ui-700.woff']
for name in names:assert (root/name).read_bytes()==(root/'build/qa/inline-workspace-web'/name.removeprefix('web/')).read_bytes(),'Stale build '+name
html=(root/'web/write.html').read_text('utf-8').replace('<script src="write-boot.js"></script>','<script>'+(root/'web/write-boot.js').read_text('utf-8')+'</script>');assert html==(root/'build/qa/inline-workspace-web/index.html').read_text('utf-8')
record={'cases':results,'sources':{name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in names+['web/write.html']}}
(root/'build/qa/inline-workspace/verified.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),'utf-8')
print(json.dumps({'verified':True,'cases':len(results),'pdfPages':sum(r['pdfPages'] for r in results)}))
