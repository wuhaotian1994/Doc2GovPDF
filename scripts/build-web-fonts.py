"""Subset the OFL UI font; input is the verified Google Fonts source download."""
from pathlib import Path
import hashlib
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset
root=Path(__file__).resolve().parent.parent
assert hashlib.sha256((root/'tmp/NotoSansSC.ttf').read_bytes()).hexdigest()=='a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da','Unexpected UI font source'
text=''.join(p.read_text('utf-8') for folder in ['web','internal/office'] for p in (root/folder).glob('*') if p.suffix in ['.go','.js','.html'])
for weight in [400,700]:
    font=TTFont(root/'tmp/NotoSansSC.ttf')
    font=instantiateVariableFont(font,{'wght':weight},inplace=True)
    options=subset.Options();options.flavor='woff'
    sub=subset.Subsetter(options=options);sub.populate(text=text+''.join(chr(n) for n in range(32,127)));sub.subset(font)
    font.flavor='woff';font.save(root/f'web/fonts/ui-{weight}.woff')
    print(weight,(root/f'web/fonts/ui-{weight}.woff').stat().st_size)
