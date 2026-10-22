from pathlib import Path
import zipfile
r=Path(__file__).resolve().parent.parent;source=r/'tmp/unified-word/hebtu-lab-safety.docx';target=r/'tmp/unified-word/continuous-boundary.docx'
with zipfile.ZipFile(source) as z,zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as out:
 for name in z.namelist():
  data=z.read(name)
  if name=='word/document.xml':
   at=data.rfind(b'</w:sectPr>');assert at>=0;data=data[:at]+b'<w:type w:val="continuous"/>'+data[at:]
  out.writestr(name,data)
print('Synthetic fixture now preserves all original namespace prefixes')
