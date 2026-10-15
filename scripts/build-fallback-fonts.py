"""Pin the OFL variable font to real static outlines for the Go PDF engine."""
from pathlib import Path
import hashlib
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

root=Path(__file__).resolve().parent.parent
source=root/'tmp/tooling/NotoSerifSC-variable.ttf'
source.parent.mkdir(parents=True,exist_ok=True)
if not source.exists():raise FileNotFoundError('Place the original variable font at tmp/tooling/NotoSerifSC-variable.ttf; see assets/fonts/README.md')
expected='050080d9255a86808f2945bffac582b31ef32bc36411ce29563b4961670c66f9'
if hashlib.sha256(source.read_bytes()).hexdigest()!=expected:raise ValueError('Unexpected upstream font digest')
for weight,name in [(400,'NotoSerifSC.ttf'),(900,'NotoSerifSC-Black.ttf')]:
    font=TTFont(source,recalcTimestamp=False)
    result=instantiateVariableFont(font,{'wght':weight},inplace=True,updateFontNames=True)
    result.save(root/'assets/fonts'/name)
    print(name,weight,result['name'].getDebugName(1),result['name'].getDebugName(2),hashlib.sha256((root/'assets/fonts'/name).read_bytes()).hexdigest())
