from pathlib import Path
import json,hashlib
import pdfplumber
from pypdf import PdfReader
r=Path(__file__).resolve().parent.parent;q=r/'build/qa/native-format';records=[]
for name,nominal in [('before/edited',10.5),('chrome/edited',11),('chrome/legacy-restored',16)]:
 file=q/(name+'.word.pdf');reader=PdfReader(file)
 with pdfplumber.open(file) as pages:
  page=pages.pages[3];word=next(w for w in page.extract_words() if w['text']=='模拟待核');chars=[c for c in page.chars if c['x0']>=word['x0']-.1 and c['x1']<=word['x1']+.1 and abs(c['top']-word['top'])<.2];assert ''.join(c['text'] for c in chars)=='模拟待核';assert all(abs(c['size']-nominal)<.1 for c in chars)
  fonts=[]
  for ref in reader.pages[3]['/Resources']['/Font'].values():
   f=ref.get_object();base=str(f.get('/BaseFont'));descriptor=f.get('/FontDescriptor');descendants=f.get('/DescendantFonts');descriptor=descriptor or (descendants[0].get_object().get('/FontDescriptor') if descendants else None)
   if base.removeprefix('/') not in {c['fontname'] for c in chars}:continue
   descriptor=descriptor.get_object();stream=descriptor.get('/FontFile2');fonts.append({'baseFont':base,'descriptorFontName':str(descriptor['/FontName']),'embeddedTrueTypeSHA256':hashlib.sha256(stream.get_object().get_data()).hexdigest() if stream else None})
  if nominal==11:assert all('SimSun' in c['fontname'] for c in chars) and fonts and all(f['embeddedTrueTypeSHA256'] for f in fonts)
  records.append({'file':name+'.word.pdf','fileSHA256':hashlib.sha256(file.read_bytes()).hexdigest(),'sourceDOCXSHA256':hashlib.sha256((q/(name+'.docx')).read_bytes()).hexdigest(),'page':4,'text':'模拟待核','nominalWordSizePt':nominal,'renderedGlyphSizesPt':sorted(set(round(c['size'],5) for c in chars)),'glyphFontNames':sorted(set(c['fontname'] for c in chars)),'fontResources':fonts})
(q/'native-rendered-fonts.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf8');print('Native Word-rendered actual glyph sizes and embedded font resource bound to source DOCX')
