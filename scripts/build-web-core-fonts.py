"""Create exact-outline common-character copies; keep complete originals for Word/rare text.

Requires FontTools 4.60.1. Normal builds use the committed generated files.
"""
from pathlib import Path
import hashlib
import json
from fontTools.ttLib import TTFont
from fontTools import subset

root = Path(__file__).resolve().parent.parent
output = root / 'assets/fonts/web'
output.mkdir(parents=True, exist_ok=True)
common = set(range(0x20, 0x250)) | set(range(0x2000, 0x2070)) | set(range(0x3000, 0x3100)) | set(range(0xFF00, 0xFFF0))
for lead in range(0xB0, 0xD8):
    for trail in range(0xA1, 0xFF):
        try:
            common.update(map(ord, bytes([lead, trail]).decode('gb2312')))
        except UnicodeDecodeError:
            pass
coverage = None
for name, digest in [
    ('NotoSerifSC.ttf', '9502147ceba7b5bc7fd3415083f6a5d133f22d8f9efb4974d4b85f3a97ea2d3a'),
    ('NotoSerifSC-Black.ttf', '0f048849cd9c0514f9915e25673801d37196c57af8e3b804f0185a3b23b53ac1'),
]:
    source = root / 'assets/fonts' / name
    assert hashlib.sha256(source.read_bytes()).hexdigest() == digest
    original = TTFont(source, recalcTimestamp=False)
    font = TTFont(source, recalcTimestamp=False)
    options = subset.Options()
    options.glyph_names = True
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=common)
    subsetter.subset(font)
    font.save(output / name)
    original_map = original.getBestCmap()
    selected = set(font.getBestCmap())
    assert selected == set(original_map).intersection(common)
    for code, glyph in font.getBestCmap().items():
        source_glyph = original_map[code]
        assert font['hmtx'][glyph] == original['hmtx'][source_glyph]
        assert font['glyf'][glyph].getCoordinates(font['glyf']) == original['glyf'][source_glyph].getCoordinates(original['glyf'])
    if coverage is not None:
        assert coverage == selected
    coverage = selected
ranges = []
for code in sorted(coverage):
    if ranges and code == ranges[-1][1] + 1:
        ranges[-1][1] = code
    else:
        ranges.append([code, code])
(output / 'coverage.json').write_text(json.dumps(ranges, separators=(',', ':')), encoding='utf-8')
print(f'Generated {len(coverage)} exact-outline characters in both weights.')
