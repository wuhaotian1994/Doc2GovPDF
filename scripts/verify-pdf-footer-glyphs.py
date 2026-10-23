#!/usr/bin/env python3
"""Verify actual default-A4 footer text/CID outlines against an explicit font.

Use --expect-missing only to prove a negative control, never as a pass for output.
Only hashes, counts and numeric geometry are reported; no manuscript or fonts saved.
This does not start Word, infer renderer provenance, or certify document standards.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import struct
import sys
from io import BytesIO

if os.environ.get('FONTTOOLS_PATH'):
    sys.path.insert(0, os.environ['FONTTOOLS_PATH'])
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen
from pypdf import PdfReader
import pdfplumber


def sha(data):
    return hashlib.sha256(data).hexdigest()


def outline(font, glyph):
    glyphs = font.getGlyphSet()
    pen = DecomposingRecordingPen(glyphs)
    glyphs[glyph].draw(pen)
    return pen.value


def inspect(path, expected_font, receiver, body_bottom, expect_missing):
    reader = PdfReader(path)
    records, body = [], []
    with pdfplumber.open(path) as document:
        for number, page in enumerate(document.pages, 1):
            chars = [c for c in page.chars if c['top'] > body_bottom * 72 / 25.4 + 1 and c['text'].strip()]
            text = ''.join(c['text'] for c in sorted(chars, key=lambda c: c['x0']))
            assert text == '—' + str(number) + '—', 'Actual footer text is missing or ambiguous'
            fonts = receiver.receiver_fonts(reader.pages[number - 1], TTFont)
            missing, matched, programs = 0, 0, set()
            for char in chars:
                assert abs(char['size'] - 14) < .11, 'Actual footer size differs from14pt'
                candidates = fonts[receiver.normalize_font_name(char['fontname'])]
                assert len(candidates) == 1, 'Actual footer font resource is ambiguous'
                actual = candidates[0]
                if 'font' not in actual:
                    # Narrow additional path: ordinary WinAnsi decimal digits,
                    # no Differences and a nonsymbolic embedded TrueType (3,1)
                    # cmap. Do not guess missing ToUnicode for arbitrary text.
                    item = actual['pdfFont']
                    assert item.get('/Subtype') == '/TrueType' and item.get('/Encoding') == '/WinAnsiEncoding'
                    assert char['text'] in '0123456789', 'Only decimal footer digits supported on this path'
                    descriptor = item['/FontDescriptor']
                    flags = int(descriptor.get('/Flags', 0))
                    assert flags & 32 and not flags & 4 and '/FontFile2' in descriptor
                    program = descriptor['/FontFile2'].get_data()
                    parsed = TTFont(BytesIO(program), recalcTimestamp=False)
                    tables = [t for t in parsed['cmap'].tables if (t.platformID, t.platEncID) == (3, 1)]
                    assert len(tables) == 1, 'WinAnsi digit lacks unique Microsoft Unicode cmap'
                    code = ord(char['text'])
                    glyph = tables[0].cmap.get(code)
                    assert glyph is not None
                    actual = {'font': parsed, 'programSHA256': sha(program), 'inverse': {char['text']: {code}},
                              'encodingMode': 'WinAnsi decimal digit via Microsoft Unicode3,1',
                              'byteGIDs': {code: {parsed.getGlyphID(glyph)}}}
                codes = actual['inverse'].get(char['text'], set())
                assert codes, 'Actual footer Unicode mapping missing'
                gids = set()
                for code in codes:
                    if actual['encodingMode'] == 'Identity-H CIDToGID':
                        mapping = actual['gidMap']
                        gids.add(code if mapping == '/Identity' else struct.unpack_from('>H', mapping, code * 2)[0])
                    else:
                        gids.update(actual.get('byteGIDs', {}).get(code, set()))
                assert len(gids) == 1, 'Actual footer glyph binding unsupported or ambiguous'
                glyph = next(iter(gids))
                missing += glyph == 0
                programs.add(actual['programSHA256'])
                if glyph:
                    expected_glyph = expected_font.getBestCmap().get(ord(char['text']))
                    assert expected_glyph is not None, 'Explicit expected font lacks footer character'
                    actual_outline = outline(actual['font'], actual['font'].getGlyphName(glyph))
                    same = actual_outline == outline(expected_font, expected_glyph)
                    same = same and actual['font']['head'].unitsPerEm == expected_font['head'].unitsPerEm
                    matched += bool(same and actual_outline)
            if expect_missing:
                assert missing == len(chars), 'Negative control did not reproduce GID0 for all footer characters'
            else:
                assert missing == 0 and matched == len(chars), 'Actual footer outlines differ from explicit source'
            records.append({'page': number, 'nonspaceCharacters': len(chars), 'missingGlyphZeroCount': missing,
                            'matchingNonemptyOutlines': matched, 'programSHA256': sorted(programs),
                            'sizePoints': sorted({round(c['size'], 5) for c in chars})})
            body.extend((c['text'], c['x0'], c['x1'], c['top'], c['bottom'], c['size'], c['fontname'])
                        for c in page.chars if c['top'] <= body_bottom * 72 / 25.4 + 1)
    return {'PDFSHA256': sha(path.read_bytes()), 'pages': len(reader.pages), 'footers': records,
            'bodyCharacterGeometrySHA256': sha(json.dumps(body, ensure_ascii=False).encode())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf', type=Path)
    parser.add_argument('expected_font', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--face-index', type=int, default=-1, help='Explicit face for a TTC; no first-face guessing')
    parser.add_argument('--body-bottom-mm', type=float, default=262, help='Verified source body bottom from top; default297-35')
    parser.add_argument('--expect-missing', action='store_true')
    parser.add_argument('--compare-body-with', type=Path, help='Previous negative control; require identical body text/geometry and page count')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    spec = importlib.util.spec_from_file_location('receiver_font_decoder', root / 'scripts/verify-receiver-layout.py')
    receiver = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(receiver)
    font = TTFont(args.expected_font, fontNumber=args.face_index, recalcTimestamp=False)
    report = {'scope': 'Actual footer source outlines only, not full font/document standards or renderer provenance',
              'scriptSHA256': sha(Path(__file__).read_bytes()), 'expectedFontSHA256': sha(args.expected_font.read_bytes()),
              'expectedFaceIndex': args.face_index, 'bodyBottomMM': args.body_bottom_mm,
              'negativeControl': args.expect_missing, 'passed': False}
    try:
        report['actual'] = inspect(args.pdf, font, receiver, args.body_bottom_mm, args.expect_missing)
        if args.compare_body_with:
            old = inspect(args.compare_body_with, font, receiver, args.body_bottom_mm, True)
            assert old['pages'] == report['actual']['pages'], 'Business task page count changed'
            assert old['bodyCharacterGeometrySHA256'] == report['actual']['bodyCharacterGeometrySHA256'], 'Business body text/geometry changed'
            report['oldNegativeControl'] = old
            report['bodyGeometryUnchanged'] = True
        report['passed'] = True
    except Exception as error:
        report['errorType'] = type(error).__name__
        raise
    finally:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'passed': True, 'negativeControl': args.expect_missing, 'pages': report['actual']['pages'],
                      'nonspaceFooterCharacters': sum(r['nonspaceCharacters'] for r in report['actual']['footers'])}))


if __name__ == '__main__':
    main()
