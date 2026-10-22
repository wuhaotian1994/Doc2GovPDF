#!/usr/bin/env python3
"""Verify the three-person header's actual FangSong/KaiTi glyphs, locally.

Usage: python scripts/verify-joint-signer-fonts.py PDF SOURCE_JSON FONT_MAP OUTPUT
FONTTOOLS_PATH may point to an existing offline fontTools directory. pypdf is
also required. No dependencies are installed, fonts copied, or Word started.
Only the first-page label/reference/three authored names are verified. Reports
contain hashes, role/font summaries and counts, never manuscript/name text or
per-character sequences. This does not certify the title or the entire document.
"""
import argparse
import hashlib
import importlib.util
from io import BytesIO
import json
import os
from pathlib import Path
import re
import sys

FANGSONG = '仿宋'
KAITI = '楷体'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def file_sha(path):
    value = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024*1024), b''):
            value.update(chunk)
    return value.hexdigest()


def postscript_names(font):
    return sorted({record.toUnicode() for record in font['name'].names if record.nameID == 6})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for argument in ['pdf', 'source_json', 'font_map', 'output']:
        parser.add_argument(argument, type=Path)
    args = parser.parse_args()
    if os.environ.get('FONTTOOLS_PATH'):
        sys.path.insert(0, os.environ['FONTTOOLS_PATH'])
    try:
        from fontTools.ttLib import TTFont
        from fontTools.pens.recordingPen import DecomposingRecordingPen
        from pypdf import PdfReader
        from pypdf.generic import ContentStream
    except ImportError as error:
        parser.exit(2, 'Missing offline Python dependency: ' + error.name + '. Use an environment with pypdf and set FONTTOOLS_PATH to an existing fontTools folder. No dependency was installed.\n')
    # Reuse the tested CMap parser (unused surrogate ranges are retained, never
    # globally ignored). Importing helpers does not invoke the fictional probe.
    sys.dont_write_bytecode = True
    spec = importlib.util.spec_from_file_location('word_font_pdf_helpers', Path(__file__).with_name('verify-word-fallback-glyphs.py'))
    helpers = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helpers)

    report = {'passed': False, 'sources': [], 'actualPrograms': [], 'counts': {}, 'checks': {},
              'structureNotes': [], 'failures': [],
              'boundary': 'First-page three-person header only. Correct actual label/reference/name glyphs do not certify the fallback title, other document text, font-container compatibility, receiving-machine behavior, or full-document standards compliance. Source font files are read locally and are not copied or redistributed; technical fsType is not an independent licence grant.'}
    sources = {}
    opened_fonts = []

    def fail(message):
        if message not in report['failures']:
            report['failures'].append(message)

    try:
        source_data = args.source_json.read_bytes()
        map_data = args.font_map.read_bytes()
        pdf_data = args.pdf.read_bytes()
        report.update({'sourceJSONSHA256': sha(source_data), 'fontMapSHA256': sha(map_data), 'pdfSHA256': sha(pdf_data)})
        source = json.loads(source_data.decode('utf-8-sig'))
        font_map = json.loads(map_data.decode('utf-8-sig'))
        fields = source['fields']
        people = [line.strip() for line in fields['signer'].splitlines() if line.strip()]
        reference = fields['reference'].strip()
        if len(people) != 3 or not reference:
            raise ValueError('This verifier requires the three-person authored header and explicit reference')
        if source.get('pdfPath') and source.get('pdfSHA256'):
            original_pdf = Path(source['pdfPath'])
            if not original_pdf.is_absolute():
                original_pdf = args.source_json.parent / original_pdf
            if file_sha(original_pdf) != source['pdfSHA256']:
                raise ValueError('Original source PDF fingerprint mismatch')
            report['officialSourcePDFSHA256'] = source['pdfSHA256']
        for entry in font_map['roles']:
            role = entry['role']
            if role not in [FANGSONG, KAITI] or role in sources:
                raise ValueError('Font map roles are missing, duplicated or unsupported')
            path = Path(entry['path'])
            if not path.is_absolute():
                path = args.font_map.parent / path
            actual_sha = file_sha(path)
            if actual_sha != entry['sha256']:
                raise ValueError('Pinned local font fingerprint mismatch')
            font = TTFont(str(path), lazy=True, recalcTimestamp=False)
            opened_fonts.append(font)
            names = postscript_names(font)
            families = {record.toUnicode() for record in font['name'].names if record.nameID == 1}
            if not names or entry['name6'] not in names or entry['name1'] not in families or font['OS/2'].fsType != entry['fsType']:
                raise ValueError('Pinned local font metadata mismatch')
            cmap = font.getBestCmap()
            if not cmap:
                raise ValueError('Pinned full source cmap is unavailable')
            sources[role] = (font, cmap, set(names))
            report['sources'].append({'role': role, 'sha256': actual_sha, 'postscriptNames': names, 'fsType': font['OS/2'].fsType})
        if set(sources) != {FANGSONG, KAITI}:
            raise ValueError('Both pinned role sources are required')

        expected = []
        def add_expected(text, role):
            expected.extend((char, role) for char in text if not char.isspace())
        # Same row-major four-slot protocol as the generated header. Whitespace
        # layout and page geometry are checked separately, not inferred here.
        add_expected('签发人：', FANGSONG)
        add_expected(people[0], KAITI)
        add_expected(people[1], KAITI)
        add_expected(reference, FANGSONG)
        add_expected(people[2], KAITI)
        expected_text = ''.join(char for char, role in expected)

        reader = PdfReader(BytesIO(pdf_data))
        page = reader.pages[0]
        resources = page['/Resources']
        font_dicts = {str(key): ref.get_object() for key, ref in resources['/Font'].items()}
        unicode_maps = {key: helpers.to_unicode(font['/ToUnicode'].get_data()) if '/ToUnicode' in font else {} for key, font in font_dicts.items()}
        active = None
        records = []
        for operands, operator in ContentStream(page.get_contents(), reader).operations:
            if operator == b'Tf':
                active = str(operands[0])
            if operator not in [b'Tj', b'TJ']:
                continue
            if active not in font_dicts:
                raise ValueError('Unresolved text font')
            font = font_dicts[active]
            if font['/Subtype'] == '/Type0' and font.get('/Encoding') != '/Identity-H':
                raise ValueError('Unsupported Type0 character encoding')
            step = 2 if font['/Subtype'] == '/Type0' else 1
            values = operands[0] if operator == b'TJ' else operands
            for value in values:
                if not isinstance(value, (str, bytes)):
                    continue
                try:
                    raw = value.original_bytes
                except AttributeError:
                    raw = value if isinstance(value, bytes) else value.encode('latin-1')
                if len(raw) % step:
                    raise ValueError('Truncated actual character code')
                for at in range(0, len(raw), step):
                    code = int.from_bytes(raw[at:at+step], 'big')
                    char = unicode_maps[active].get(code)
                    if char is None and step == 1:
                        char = bytes([code]).decode('cp1252')
                    if char is None or len(char) != 1 or 0xD800 <= ord(char) <= 0xDFFF:
                        raise ValueError('Actual text character has invalid Unicode')
                    if not char.isspace():
                        records.append((char, active, code))
        actual_text = ''.join(char for char, font, code in records)
        first = actual_text.find(expected_text)
        if first < 0 or actual_text.find(expected_text, first+1) >= 0:
            fail('Exact authored header sequence is missing or ambiguous on the first page')
            raise ValueError('Header not uniquely identifiable')
        selected = records[first:first+len(expected)]
        report['checks']['exactHeaderOperatorOrder'] = True
        extracted = helpers.compact(page.extract_text() or '')
        report['checks']['exactExtractedHeader'] = extracted.count(expected_text) == 1
        if not report['checks']['exactExtractedHeader']:
            fail('Extracted first-page text does not preserve the unique header sequence')

        programs = {}
        def actual_program(key):
            if key in programs:
                return programs[key]
            font = font_dicts[key]
            descendant = font['/DescendantFonts'][0].get_object() if '/DescendantFonts' in font else font
            descriptor = descendant['/FontDescriptor']
            if '/FontFile2' not in descriptor:
                raise ValueError('Header font lacks an embedded TrueType program')
            data = descriptor['/FontFile2'].get_data()
            parsed = TTFont(BytesIO(data), recalcTimestamp=False)
            opened_fonts.append(parsed)
            numeric = font['/Subtype'] == '/Type0'
            if numeric:
                parsed.setGlyphOrder(['.notdef'] + [f'gid{index:05d}' for index in range(1, parsed['maxp'].numGlyphs)])
            try:
                parsed['cmap'].buildReversedMin()
                cmap_ok = True
            except Exception:
                cmap_ok = False
                if not numeric:
                    raise ValueError('Simple-font cmap rejected')
                note = 'Selected Type0 subset cmap rejected by fontTools; numeric CID-to-GID verifies actual outlines only. The font-container compatibility issue remains separate and open.'
                if note not in report['structureNotes']:
                    report['structureNotes'].append(note)
            names = postscript_names(parsed)
            summary = {'resource': key, 'programSHA256': sha(data), 'postscriptNames': names,
                       'nonNameTableSHA256': {str(tag): sha(parsed.reader[tag]) for tag in parsed.reader.keys() if str(tag) != 'name'},
                       'fontToolsCmapAccepted': cmap_ok, 'rolesChecked': [], 'nonemptyGlyphs': 0,
                       'matchedOutlines': 0, 'unmatchedOutlines': 0, 'metadataMatches': 0}
            report['actualPrograms'].append(summary)
            programs[key] = (font, descendant, parsed, names, summary)
            return programs[key]

        outline_cache = {}
        def outline(font, glyph):
            key = (id(font), glyph)
            if key not in outline_cache:
                glyphs = font.getGlyphSet()
                pen = DecomposingRecordingPen(glyphs)
                glyphs[glyph].draw(pen)
                outline_cache[key] = (sha(repr(pen.value).encode()), bool(pen.value))
            return outline_cache[key]

        counts = {role: {'characters': 0, 'nonemptyGlyphs': 0, 'matchedOutlines': 0, 'metadataMatches': 0} for role in [FANGSONG, KAITI]}
        for (char, key, code), (expected_char, role) in zip(selected, expected):
            if char != expected_char:
                raise ValueError('Header alignment changed')
            source_font, cmap, source_names = sources[role]
            font, descendant, parsed, actual_names, summary = actual_program(key)
            if role not in summary['rolesChecked']:
                summary['rolesChecked'].append(role)
            counts[role]['characters'] += 1
            canonical_names = {re.sub(r'^[A-Z]{6}\+', '', value) for value in actual_names}
            metadata_ok = bool(canonical_names) and canonical_names.issubset(source_names)
            if metadata_ok:
                summary['metadataMatches'] += 1
                counts[role]['metadataMatches'] += 1
            else:
                fail('Actual header program PostScript identity does not match its pinned role source')
            if font['/Subtype'] == '/Type0':
                cid_map = descendant.get('/CIDToGIDMap', '/Identity')
                if cid_map == '/Identity':
                    gid = code
                else:
                    raw_map = cid_map.get_data()
                    if len(raw_map) < 2*code+2:
                        raise ValueError('Truncated CID-to-GID map')
                    gid = int.from_bytes(raw_map[2*code:2*code+2], 'big')
                glyph = parsed.getGlyphOrder()[gid]
            else:
                glyph = parsed.getBestCmap().get(ord(char))
            source_glyph = cmap.get(ord(char))
            if glyph is None or source_glyph is None:
                raise ValueError('Actual or pinned source glyph missing')
            actual_outline, nonempty = outline(parsed, glyph)
            if not nonempty:
                fail('Nonblank header character renders an empty glyph')
                continue
            summary['nonemptyGlyphs'] += 1
            counts[role]['nonemptyGlyphs'] += 1
            source_outline, _ = outline(source_font, source_glyph)
            good = parsed['head'].unitsPerEm == source_font['head'].unitsPerEm and actual_outline == source_outline
            if good:
                summary['matchedOutlines'] += 1
                counts[role]['matchedOutlines'] += 1
            else:
                summary['unmatchedOutlines'] += 1
                fail('Actual header outline differs from its corresponding pinned role source')
        report['counts'] = {'authorsChecked': len(people), 'headerCharacters': len(expected), 'roles': counts}
        report['checks']['allHeaderMetadataMatches'] = all(value['metadataMatches'] == value['characters'] for value in counts.values())
        report['checks']['allHeaderNonemptyGlyphsMatch'] = all(value['matchedOutlines'] == value['characters'] for value in counts.values())
        report['passed'] = not report['failures'] and all(report['checks'].values())
    except Exception as error:
        # Parser exceptions can contain source text; keep diagnostics categorical.
        fail('Header verification could not complete (' + type(error).__name__ + ')')
    finally:
        for font in opened_fonts:
            font.close()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=True, indent=2), encoding='utf-8')
    print(json.dumps({'passed': report['passed'], 'counts': report['counts'], 'failures': report['failures']}))
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    sys.exit(main())
