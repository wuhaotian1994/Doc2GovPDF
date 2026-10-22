#!/usr/bin/env python3
"""Reproduce 17 synthetic, in-memory checks of the subset-font validator itself.

No PDF or font artifact is written. These are not real product-font acceptance
results. Set FONTTOOLS_PATH to an existing offline fontTools directory; no install.
"""
import argparse
from io import BytesIO
import hashlib
import json
import os
from pathlib import Path
import runpy
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--fonttools-path', default=os.environ.get('FONTTOOLS_PATH'))
parser.add_argument('--output', type=Path, default=ROOT / 'build/qa/pdf-subset-fonts/mechanisms.json')
args = parser.parse_args()
if args.fonttools_path:
    sys.path.insert(0, str(Path(args.fonttools_path).resolve()))
from fontTools.ttLib import TTFont
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

validator = ROOT / 'scripts/verify-pdf-subset-fonts.py'
n = runpy.run_path(str(validator), run_name='validator_mechanism')
checks = []


def ok(label, value):
    assert value, label
    checks.append(label)


def rejected(label, fn):
    try:
        fn()
    except n['InvalidFont']:
        checks.append(label)
    else:
        raise AssertionError(label)


def cmap4(length=32, offset=0, end=0xFFFF):
    return (struct.pack('>7H', 4, length, 0, 4, 4, 1, 0) +
            struct.pack('>2H', 65, end) + b'\0\0' +
            struct.pack('>2H', 65, end) +
            struct.pack('>2H', 0 if offset else 0xFFC0, 1) +
            struct.pack('>2H', offset, 0) +
            (struct.pack('>H', 1) if offset else b''))


ok('valid direct format4 mapping and terminal', len(n['format4'](cmap4(), 2)[0]) == 1)
ok('unused bytes after declared subtable are not mistaken for an error', len(n['format4'](cmap4() + b'external-padding', 2)[0]) == 1)
ok('valid indirect idRangeOffset resolves inside the actual glyph array', len(n['format4'](cmap4(34, 4), 2)[0]) == 1)
rejected('odd declared format4 length rejected', lambda: n['format4'](cmap4(31), 2))
rejected('format4 arrays outside declared length rejected', lambda: n['format4'](cmap4(30), 2))
rejected('format4 missing terminal segment rejected', lambda: n['format4'](cmap4(end=0xFFFE), 2))
rejected('format4 range offset outside array rejected', lambda: n['format4'](cmap4(34, 6), 2))
rejected('format4 glyph index outside maxp rejected', lambda: n['format4'](cmap4(), 1))


def cmap12(groups):
    return (struct.pack('>HHIII', 12, 0, 16 + 12 * len(groups), 0, len(groups)) +
            b''.join(struct.pack('>III', *group) for group in groups))


mapping, summary = n['format12_or13'](cmap12([(0x10000, 0x10001, 1)]), 3, True)
ok('valid non-BMP format12 groups fully checked', len(mapping) == 2 and summary['nonBMPMappings'] == 2)
rejected('format12 beyond Unicode range rejected', lambda: n['format12_or13'](cmap12([(0x110000, 0x110000, 1)]), 3, True))
rejected('format12 overlapping groups rejected', lambda: n['format12_or13'](cmap12([(0x10000, 0x10001, 1), (0x10001, 0x10001, 2)]), 3, True))
rejected('format12 glyph range outside maxp rejected', lambda: n['format12_or13'](cmap12([(0x10000, 0x10001, 1)]), 2, True))
bad_length = bytearray(cmap12([(0x10000, 0x10001, 1)]))
bad_length[4:8] = (16).to_bytes(4, 'big')
rejected('format12 group declaration length mismatch rejected', lambda: n['format12_or13'](bad_length, 3, True))
shared = struct.pack('>HHHHIHHI', 0, 2, 0, 3, 24, 3, 1, 24) + b'\0' * 4 + cmap4() + b'external bytes'
issues = []
rows, manual = n['inspect_cmap'](shared, 2, issues)
ok('shared subtable offsets and intervening/outside bytes are accepted', not issues and len(rows) == 2 and len(manual) == 2)

# A tiny synthetic SFNT is built only in memory, never saved as a font or PDF.
pen = TTGlyphPen(None)
blank = pen.glyph()
pen = TTGlyphPen(None)
pen.moveTo((0, 0))
pen.lineTo((200, 0))
pen.lineTo((100, 200))
pen.closePath()
shape = pen.glyph()
fb = FontBuilder(1000, isTTF=True)
fb.setupGlyphOrder(['.notdef', 'sampleglyph'])
fb.setupCharacterMap({65: 'sampleglyph'})
fb.setupGlyf({'.notdef': blank, 'sampleglyph': shape})
fb.setupHorizontalMetrics({'.notdef': (500, 0), 'sampleglyph': (500, 0)})
fb.setupHorizontalHeader(ascent=800, descent=-200)
fb.setupNameTable({'familyName': 'Local Validator Mechanism', 'styleName': 'Regular'})
fb.setupOS2()
fb.setupPost()
fb.setupMaxp()
for tag in ('OS/2', 'name', 'post'):
    del fb.font[tag]
output = BytesIO()
fb.font.save(output)
font = output.getvalue()
result = n['inspect_sfnt'](font, TTFont)
ok('missing optional OS2 name and post do not invalidate a usable subset', result['passed'])
head = next(row['offset'] for row in result['tables'] if row['tag'] == 'head')
broken = bytearray(font)
broken[head + 8] ^= 1
bad = n['inspect_sfnt'](broken, TTFont)
ok('full 32-bit head adjustment corruption remains fatal', not bad['passed'] and any(value['code'] == 'head_full32bit_adjustment_or_whole_checksum_mismatch' for value in bad['failures']))
fb2 = TTFont(BytesIO(font))
del fb2['cmap']
output = BytesIO()
fb2.save(output)
without = n['inspect_sfnt'](output.getvalue(), TTFont)
ok('absent cmap is explicitly inapplicable rather than fake getBestCmap success', without['passed'] and not without['cmapPresent'] and not without['fontTools']['getBestCmapSucceeded'])

assert len(checks) == 17
report = {'method': 'Synthetic in-memory validator mechanisms only; no product document or font bytes written. Separate from actual PDF acceptance.', 'validatorSHA256': hashlib.sha256(validator.read_bytes()).hexdigest(), 'checks': checks, 'passed': True}
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps({'syntheticMechanismsPassed': True, 'checks': len(checks)}))
