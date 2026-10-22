#!/usr/bin/env python3
"""Verify a fictional Word font probe against the repository's fixed OFL faces.

Usage: python scripts/verify-word-fallback-glyphs.py input.pdf output.json
Set FONTTOOLS_PATH (or --fonttools-path) to an existing offline fontTools folder.
Requires pypdf in the selected Python environment. Never installs dependencies.
The report contains hashes, font summaries and counts, never manuscript text or
per-character sequences. This is a controlled font mechanism check, not a general
document/standards validator or a substitute for visual page inspection.
"""
import argparse
import hashlib
from io import BytesIO
import json
import os
from pathlib import Path
import re
import sys

TITLE = '办公室字体核对（模拟）'
BODY = '请各科室核对库存12箱，编号A-17。'
FIXED_SOURCES = {
    400: ('NotoSerifSC.ttf', '9502147ceba7b5bc7fd3415083f6a5d133f22d8f9efb4974d4b85f3a97ea2d3a'),
    900: ('NotoSerifSC-Black.ttf', '0f048849cd9c0514f9915e25673801d37196c57af8e3b804f0185a3b23b53ac1'),
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def compact(text):
    return ''.join(text.split())


def chinese_or_cjk_punctuation(char):
    code = ord(char)
    return 0x3400 <= code <= 0x9FFF or 0x20000 <= code <= 0x323AF or 0x3000 <= code <= 0x303F or 0xFF00 <= code <= 0xFFEF


def to_unicode(data):
    """Read the bfchar/bfrange forms produced by Word, including range arrays."""
    text = data.decode('ascii')
    result = {}
    for block in re.findall(r'beginbfchar(.*?)endbfchar', text, re.S):
        for start, target in re.findall(r'<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>', block):
            result[int(start, 16)] = bytes.fromhex(target).decode('utf-16-be', errors='surrogatepass')
    for block in re.findall(r'beginbfrange(.*?)endbfrange', text, re.S):
        for start, end, target in re.findall(r'<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>', block):
            first, last = int(start, 16), int(end, 16)
            for code in range(first, last + 1):
                result[code] = (int(target, 16) + code - first).to_bytes(len(target) // 2, 'big').decode('utf-16-be', errors='surrogatepass')
        for start, end, targets in re.findall(r'<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\[(.*?)\]', block, re.S):
            values = re.findall(r'<([0-9a-fA-F]+)>', targets)
            first, last = int(start, 16), int(end, 16)
            if len(values) != last - first + 1:
                raise ValueError('Unsupported or malformed Unicode range array')
            for code, target in zip(range(first, last + 1), values):
                result[code] = bytes.fromhex(target).decode('utf-16-be', errors='surrogatepass')
    return result


def image_count(resources, seen):
    count = 0
    for ref in resources.get('/XObject', {}).values():
        obj = ref.get_object()
        identity = (getattr(ref, 'idnum', None), getattr(ref, 'generation', None))
        if identity[0] is None:
            identity = id(obj)
        if identity in seen:
            continue
        seen.add(identity)
        if obj.get('/Subtype') == '/Image':
            count += 1
        elif obj.get('/Subtype') == '/Form':
            count += image_count(obj.get('/Resources', resources), seen)
    return count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--fonttools-path', default=os.environ.get('FONTTOOLS_PATH'))
    args = parser.parse_args()
    if args.fonttools_path:
        sys.path.insert(0, args.fonttools_path)
    try:
        from fontTools.ttLib import TTFont
        from fontTools.pens.recordingPen import DecomposingRecordingPen
        from pypdf import PdfReader
        from pypdf.generic import ContentStream
    except ImportError as error:
        parser.exit(2, 'Missing offline Python dependency: ' + error.name + '. Use an environment with pypdf and set FONTTOOLS_PATH to an existing fontTools folder. No dependency was installed.\n')

    report = {'passed': False, 'sources': [], 'fonts': [], 'counts': {}, 'checks': {}, 'failures': [], 'structureNotes': [],
              'boundary': 'Fixed fictional probe only. Actual CID-to-GID decomposed outlines are compared, without dropping font program tables or treating family names as glyph evidence. Hint byte differences are outside the outline comparison. Visual page verification remains separate.'}
    def fail(message):
        if message not in report['failures']:
            report['failures'].append(message)

    try:
        pdf_bytes = args.pdf.read_bytes()
        report['pdfSHA256'] = digest(pdf_bytes)
        root = Path(__file__).resolve().parent.parent
        sources = {}
        for weight, (filename, expected) in FIXED_SOURCES.items():
            data = (root / 'assets' / 'fonts' / filename).read_bytes()
            actual = digest(data)
            if actual != expected:
                raise ValueError('Repository OFL source fingerprint mismatch')
            font = TTFont(BytesIO(data), recalcTimestamp=False)
            if font['OS/2'].usWeightClass != weight:
                raise ValueError('Repository OFL source weight mismatch')
            sources[weight] = font
            report['sources'].append({'asset': filename, 'sha256': actual, 'weight': weight, 'nonNameTableSHA256': {str(tag): digest(font.reader[tag]) for tag in font.reader.keys() if str(tag) != 'name'}})

        outline_cache = {}
        def outline(font, glyph):
            key = (id(font), glyph)
            if key not in outline_cache:
                glyphs = font.getGlyphSet()
                pen = DecomposingRecordingPen(glyphs)
                glyphs[glyph].draw(pen)
                outline_cache[key] = (digest(repr(pen.value).encode()), bool(pen.value))
            return outline_cache[key]

        reader = PdfReader(BytesIO(pdf_bytes))
        report['counts']['pages'] = len(reader.pages)
        records = []
        extracted = ''
        images = 0
        for page_number, page in enumerate(reader.pages, 1):
            resources = page['/Resources']
            images += image_count(resources, set())
            page_text = compact(page.extract_text() or '')
            footer = '—' + str(page_number) + '—'
            if page_text.startswith(footer):
                page_text = page_text[len(footer):]
            elif page_text.endswith(footer):
                page_text = page_text[:-len(footer)]
            extracted += page_text
            fonts = {}
            for key, ref in resources.get('/Font', {}).items():
                font = ref.get_object()
                cid = font['/DescendantFonts'][0].get_object() if '/DescendantFonts' in font else font
                descriptor = cid.get('/FontDescriptor', {})
                descriptor = descriptor.get_object() if hasattr(descriptor, 'get_object') else descriptor
                if '/FontFile2' not in descriptor:
                    raise ValueError('Font has no supported embedded TrueType program')
                program = descriptor['/FontFile2'].get_data()
                parsed = TTFont(BytesIO(program), recalcTimestamp=False)
                numeric_glyph_order = font['/Subtype'] == '/Type0'
                if numeric_glyph_order:
                    # PDF Identity-H + CIDToGIDMap selects numeric glyph IDs, not
                    # the optional embedded cmap's guessed glyph names. Keep every
                    # embedded table unchanged and record cmap parser compatibility.
                    parsed.setGlyphOrder(['.notdef'] + [f'gid{index:05d}' for index in range(1, parsed['maxp'].numGlyphs)])
                try:
                    parsed['cmap'].buildReversedMin()
                    cmap_accepted = True
                except Exception:
                    cmap_accepted = False
                    if not numeric_glyph_order:
                        raise ValueError('Simple-font cmap cannot be parsed')
                    note = 'Type0 embedded cmap rejected by fontTools; exact PDF CID-to-GID is used for outline identity only. Font-container compatibility remains unresolved.'
                    if note not in report['structureNotes']:
                        report['structureNotes'].append(note)
                weight = parsed['OS/2'].usWeightClass
                summary = {'resource': str(key), 'page': page_number, 'pdfLabel': str(font.get('/BaseFont', '')),
                           'postscriptNames': sorted(set(n.toUnicode() for n in parsed['name'].names if n.nameID == 6)),
                           'programSHA256': digest(program), 'weight': weight,
                           'fontToolsCmapAccepted': cmap_accepted, 'numericCIDGlyphOrder': numeric_glyph_order,
                           'nonNameTableSHA256': {str(tag): digest(parsed.reader[tag]) for tag in parsed.reader.keys() if str(tag) != 'name'},
                           'nonemptyGlyphs': 0, 'matchedOutlines': 0,
                           'unmatchedOutlines': 0, 'cjkCharacters': 0}
                report['fonts'].append(summary)
                mapping = to_unicode(font['/ToUnicode'].get_data()) if '/ToUnicode' in font else {}
                if font['/Subtype'] == '/Type0' and font.get('/Encoding') != '/Identity-H':
                    raise ValueError('Unsupported Type0 character encoding')
                fonts[str(key)] = (font, cid, parsed, mapping, summary)
            active = None
            page_records = []
            for operands, operator in ContentStream(page.get_contents(), reader).operations:
                if operator == b'Tf':
                    active = str(operands[0])
                if operator not in (b'Tj', b'TJ'):
                    continue
                if active not in fonts:
                    raise ValueError('Text font resource cannot be resolved')
                font, cid, parsed, mapping, summary = fonts[active]
                values = operands[0] if operator == b'TJ' else operands
                for value in values:
                    if not isinstance(value, (str, bytes)):
                        continue
                    try:
                        raw = value.original_bytes
                    except AttributeError:
                        raw = value if isinstance(value, bytes) else value.encode('latin-1')
                    step = 2 if font['/Subtype'] == '/Type0' else 1
                    if len(raw) % step:
                        raise ValueError('Incomplete text character code')
                    for at in range(0, len(raw), step):
                        code = int.from_bytes(raw[at:at+step], 'big')
                        char = mapping.get(code)
                        if char is None and step == 1:
                            char = bytes([code]).decode('cp1252')
                        if char is None or len(char) != 1:
                            raise ValueError('Missing or unsupported character-to-Unicode mapping')
                        # Identity CMaps may contain unused surrogate-range entries.
                        # Retain them while parsing, but never accept actual invalid scalars.
                        if 0xD800 <= ord(char) <= 0xDFFF:
                            fail('Actual text character maps to an invalid Unicode scalar')
                            raise ValueError('Invalid Unicode scalar in used text')
                        if char.isspace():
                            continue
                        if step == 2:
                            cid_map = cid.get('/CIDToGIDMap', '/Identity')
                            if cid_map == '/Identity':
                                gid = code
                            else:
                                raw_map = cid_map.get_data()
                                if len(raw_map) < 2*code+2:
                                    raise ValueError('CID-to-glyph mapping is truncated')
                                gid = int.from_bytes(raw_map[2*code:2*code+2], 'big')
                            glyph = parsed.getGlyphOrder()[gid]
                        else:
                            glyph = parsed.getBestCmap().get(ord(char))
                            if glyph is None:
                                raise ValueError('Simple-font Unicode glyph is unavailable')
                        page_records.append((char, parsed, glyph, summary))
            sequence = ''.join(item[0] for item in page_records)
            if sequence.startswith(footer):
                records.extend((item, 400) for item in page_records[:len(footer)])
                page_records = page_records[len(footer):]
            elif sequence.endswith(footer):
                records.extend((item, 400) for item in page_records[-len(footer):])
                page_records = page_records[:-len(footer)]
            records.extend((item, None) for item in page_records)

        expected = compact(TITLE + BODY)
        report['checks']['exactExtractedText'] = extracted == expected
        if extracted != expected:
            fail('Extracted text differs from the fixed fictional probe')
        manuscript = [item[0][0] for item in records if item[1] is None]
        report['checks']['exactOperatorUnicode'] = ''.join(manuscript) == expected
        if ''.join(manuscript) != expected:
            fail('PDF text operators do not preserve the fixed probe character sequence')
        cjk = {400: 0, 900: 0}
        position = 0
        for (char, actual_font, glyph, summary), role_weight in records:
            if role_weight is None:
                role_weight = 900 if position < len(compact(TITLE)) else 400
                position += 1
            source_font = sources[role_weight]
            source_glyph = source_font.getBestCmap().get(ord(char))
            actual_outline, nonempty = outline(actual_font, glyph)
            if not nonempty:
                if not char.isspace():
                    fail('Nonblank character has an empty rendered glyph')
                continue
            summary['nonemptyGlyphs'] += 1
            if source_glyph is None:
                fail('Character is outside the fixed OFL source coverage')
                summary['unmatchedOutlines'] += 1
                continue
            expected_outline, _ = outline(source_font, source_glyph)
            matches = actual_font['head'].unitsPerEm == source_font['head'].unitsPerEm and actual_outline == expected_outline
            if summary['weight'] != role_weight:
                fail('Actual run weight differs from its title/body role')
            if matches:
                summary['matchedOutlines'] += 1
            else:
                summary['unmatchedOutlines'] += 1
                fail('Actual run outline differs from its corresponding fixed OFL face')
            if chinese_or_cjk_punctuation(char):
                summary['cjkCharacters'] += 1
                if matches and summary['weight'] == role_weight:
                    cjk[role_weight] += 1
        report['counts'].update({'images': images, 'nonemptyGlyphs': sum(f['nonemptyGlyphs'] for f in report['fonts']),
                                'matchedOutlines': sum(f['matchedOutlines'] for f in report['fonts']),
                                'unmatchedOutlines': sum(f['unmatchedOutlines'] for f in report['fonts']),
                                'regularCJKMatched': cjk[400], 'blackCJKMatched': cjk[900]})
        report['checks']['noImages'] = images == 0
        report['checks']['bothFacesHaveCorrectCJK'] = all(cjk.values())
        report['checks']['allNonemptyGlyphsMatchRole'] = report['counts']['unmatchedOutlines'] == 0 and not any('weight' in message or 'empty rendered' in message for message in report['failures'])
        if images:
            fail('PDF contains image resources')
        if not all(cjk.values()):
            fail('Both expected OFL faces must render matching Chinese characters')
        report['passed'] = not report['failures'] and all(report['checks'].values())
    except Exception as error:
        # Do not print parser exceptions that may echo source text or glyph data.
        fail('Verification could not complete (' + type(error).__name__ + ')')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=True, indent=2), encoding='utf-8')
    print(json.dumps({'passed': report['passed'], 'counts': report['counts'], 'failures': report['failures']}))
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    sys.exit(main())
