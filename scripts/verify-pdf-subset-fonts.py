#!/usr/bin/env python3
"""Strictly inspect actual PDF FontFile2 TrueType subset containers.

Usage: FONTTOOLS_PATH=/existing/offline/fonttools python verify-pdf-subset-fonts.py
       first.pdf second.pdf --output /ignored/qa/report.json
No dependencies are installed and no font programs or manuscript text are saved.
This checks font containers/cmaps, not PDF text fidelity or visual conformance.
"""
import argparse
from io import BytesIO
import hashlib
import json
import logging
import os
from pathlib import Path
import struct
import sys
import warnings

MAGIC = 0xB1B0AFBA
STANDARDS = [
    'https://learn.microsoft.com/en-us/typography/opentype/spec/otff',
    'https://learn.microsoft.com/en-us/typography/opentype/spec/head',
    'https://learn.microsoft.com/en-us/typography/opentype/spec/cmap',
]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def checksum(data):
    padded = bytes(data) + b'\0' * (-len(data) % 4)
    return sum(value[0] for value in struct.iter_unpack('>I', padded)) & 0xFFFFFFFF


class InvalidFont(Exception):
    def __init__(self, code, **details):
        self.code, self.details = code, details


def need(ok, code, **details):
    if not ok:
        raise InvalidFont(code, **details)


def u16(data, at):
    need(0 <= at <= len(data) - 2, 'uint16_out_of_bounds', offset=at)
    return struct.unpack_from('>H', data, at)[0]


def u32(data, at):
    need(0 <= at <= len(data) - 4, 'uint32_out_of_bounds', offset=at)
    return struct.unpack_from('>I', data, at)[0]


def format4(data, glyph_count):
    length, doubled = u16(data, 2), u16(data, 6)
    need(length >= 24 and length % 2 == 0, 'format4_length_not_valid_uint16_arrays', declaredLength=length)
    need(length <= len(data), 'format4_declared_length_outside_cmap', declaredLength=length, available=len(data))
    need(doubled >= 2 and doubled % 2 == 0, 'format4_invalid_segment_count')
    count = doubled // 2
    minimum = 16 + 8 * count
    need(minimum <= length, 'format4_segment_arrays_outside_declared_length', declaredLength=length, minimum=minimum)
    data = data[:length]
    power = 1 << (count.bit_length() - 1)
    need((u16(data, 8), u16(data, 10), u16(data, 12)) ==
         (power * 2, power.bit_length() - 1, count * 2 - power * 2), 'format4_invalid_search_fields')
    end_at, start_at, delta_at, range_at = 14, 16 + 2 * count, 16 + 4 * count, 16 + 6 * count
    need(u16(data, 14 + 2 * count) == 0, 'format4_reserved_pad_nonzero')
    need(u16(data, end_at + 2 * (count - 1)) == 0xFFFF and
         u16(data, start_at + 2 * (count - 1)) == 0xFFFF, 'format4_missing_terminal_segment')
    mapping, previous, indirect = {}, -1, 0
    for index in range(count):
        start, end = u16(data, start_at + index * 2), u16(data, end_at + index * 2)
        need(start <= end and start > previous, 'format4_unsorted_or_overlapping_segments', segmentIndex=index)
        previous = end
        delta, offset = u16(data, delta_at + index * 2), u16(data, range_at + index * 2)
        need(offset % 2 == 0, 'format4_odd_range_offset', segmentIndex=index)
        if offset:
            indirect += 1
            first = range_at + index * 2 + offset
            last = first + (end - start) * 2
            need(first >= minimum and last + 2 <= length, 'format4_range_lookup_outside_glyph_array', segmentIndex=index)
        for code in range(start, end + 1):
            if offset:
                glyph = u16(data, first + (code - start) * 2)
                if glyph:
                    glyph = (glyph + delta) & 0xFFFF
            else:
                glyph = (code + delta) & 0xFFFF
            need(glyph < glyph_count, 'format4_glyph_index_exceeds_maxp', segmentIndex=index)
            if glyph:
                mapping[code] = glyph
    return mapping, {'segments': count, 'indirectSegments': indirect, 'mappedCharacters': len(mapping),
                     'glyphArrayWords': (length - minimum) // 2, 'terminalValid': True}


def format12_or13(data, glyph_count, unicode_encoding):
    kind, length, groups = u16(data, 0), u32(data, 4), u32(data, 12)
    need(u16(data, 2) == 0, 'format12_13_reserved_nonzero')
    need(length <= len(data) and length == 16 + 12 * groups, 'format12_13_group_array_length_invalid', declaredLength=length, groups=groups)
    mapping, previous, non_bmp, covered = {}, -1, 0, 0
    for index in range(groups):
        start, end, first_glyph = struct.unpack_from('>III', data, 16 + 12 * index)
        need(start <= end and start > previous, 'format12_13_unsorted_or_overlapping_groups', groupIndex=index)
        previous = end
        covered += end-start+1
        need(covered<=0x110000,'cmap_mapping_expansion_exceeds_verifier_budget')
        if unicode_encoding:
            need(end <= 0x10FFFF, 'format12_13_outside_unicode_range', groupIndex=index)
        final_glyph = first_glyph + (end - start if kind == 12 else 0)
        need(final_glyph < glyph_count, 'format12_13_glyph_index_exceeds_maxp', groupIndex=index)
        # Mapping dictionaries stay solely in memory and never enter the report.
        for code in range(start, end + 1):
            glyph = first_glyph + (code - start if kind == 12 else 0)
            if glyph:
                mapping[code] = glyph
                non_bmp += code > 0xFFFF
    return mapping, {'groups': groups, 'mappedCharacters': len(mapping), 'nonBMPMappings': non_bmp}


def inspect_cmap(data, glyph_count, failures):
    need(len(data) >= 4 and u16(data, 0) == 0, 'cmap_header_invalid')
    count = u16(data, 2)
    need(4 + count * 8 <= len(data), 'cmap_encoding_records_out_of_bounds')
    summaries, manual, record_keys = [], {}, []
    for index in range(count):
        platform, encoding = u16(data, 4 + index * 8), u16(data, 6 + index * 8)
        offset = u32(data, 8 + index * 8)
        summary = {'platformID': platform, 'encodingID': encoding, 'offset': offset}
        summaries.append(summary)
        try:
            need(offset >= 4 + count * 8 and offset + 2 <= len(data), 'cmap_subtable_overlaps_records_or_outside_table')
            available = data[offset:]
            kind = u16(available, 0)
            summary['format'] = kind
            if kind in (0, 2, 4, 6):
                length, language, minimum = u16(available, 2), u16(available, 4), 6
            elif kind in (8, 10, 12, 13):
                need(u16(available, 2) == 0, 'cmap_reserved_nonzero')
                length, language, minimum = u32(available, 4), u32(available, 8), 12
            elif kind == 14:
                length, language, minimum = u32(available, 2), 0, 10
            else:
                raise InvalidFont('cmap_unknown_format_not_verified', format=kind)
            summary.update({'declaredLength': length, 'language': language})
            need(minimum <= length <= len(available), 'cmap_subtable_declared_length_out_of_bounds')
            record_keys.append((platform, encoding, language))
            bounded = available[:length]
            mapping = None
            if kind == 4:
                mapping, extra = format4(bounded, glyph_count)
                summary.update(extra)
            elif kind in (12, 13):
                mapping, extra = format12_or13(bounded, glyph_count, platform == 0 or platform == 3 and encoding in (1, 10))
                summary.update(extra)
            if mapping is not None:
                manual[(platform, encoding, kind, language)] = mapping
            summary['structuralChecksPassed'] = True
        except InvalidFont as error:
            summary['structuralChecksPassed'] = False
            summary['failure'] = {'code': error.code, **error.details}
            failures.append({'stage': 'cmap', 'subtableIndex': index, 'code': error.code, **error.details})
    if record_keys != sorted(record_keys) or len(record_keys) != len(set(record_keys)):
        failures.append({'stage': 'cmap', 'code': 'encoding_records_unsorted_or_duplicate'})
    # Declared subtables can share storage. Gaps and bytes after a subtable are
    # not errors: other subtables, legal alignment, or unused glyph words may exist.
    return summaries, manual


def inspect_sfnt(data, TTFont):
    result = {'sha256': sha(data), 'bytes': len(data), 'failures': [], 'tables': [], 'cmapPresent': False, 'advisories': []}
    failures, tables, manual = result['failures'], {}, {}
    try:
        need(len(data) >= 12 and data[:4] in (b'\0\1\0\0', b'true'), 'not_standalone_truetype_sfnt')
        count = u16(data, 4)
        need(count > 0 and 12 + 16 * count <= len(data), 'sfnt_directory_out_of_bounds')
        power = 1 << (count.bit_length() - 1)
        if (u16(data, 6), u16(data, 8), u16(data, 10)) != (power * 16, power.bit_length() - 1, count * 16 - power * 16):
            result['advisories'].append({'stage':'sfnt','code':'redundant_directory_search_hints_differ','stored':[u16(data,6),u16(data,8),u16(data,10)],'derived':[power*16,power.bit_length()-1,count*16-power*16],'note':'Search addresses are derived independently from numTables. OpenType recommends parsers not rely on these redundant legacy hints; this is retained as a compatibility advisory, not a boundary/checksum/cmap exemption.'})
        tags, spans = [], []
        for index in range(count):
            at = 12 + index * 16
            raw_tag = data[at:at + 4]
            need(all(0x20 <= value <= 0x7E for value in raw_tag), 'invalid_sfnt_table_tag')
            tag = raw_tag.decode('ascii')
            stored, offset, length = struct.unpack_from('>III', data, at + 4)
            need(tag not in tables, 'duplicate_sfnt_table_tag', table=tag)
            need(offset % 4 == 0 and offset >= 12 + 16 * count and offset + length <= len(data), 'sfnt_table_out_of_bounds_or_unaligned', table=tag)
            block = data[offset:offset + length]
            checked = block
            if tag == 'head':
                need(length >= 54 and u32(block, 12) == 0x5F0F3CF5, 'invalid_required_head_table')
                checked = block[:8] + b'\0' * 4 + block[12:]
            calculated = checksum(checked)
            entry = {'tag': tag, 'offset': offset, 'length': length, 'storedChecksum': f'{stored:08x}', 'calculatedChecksum': f'{calculated:08x}', 'checksumValid': stored == calculated}
            result['tables'].append(entry)
            if stored != calculated:
                failures.append({'stage': 'sfnt', 'code': 'table_checksum_mismatch', 'table': tag})
            tables[tag] = (offset, block)
            tags.append(tag)
            if length:
                spans.append((offset, offset + length))
        if tags != sorted(tags):
            failures.append({'stage': 'sfnt', 'code': 'directory_tags_not_sorted'})
        if any(a[1] > b[0] for a, b in zip(sorted(spans), sorted(spans)[1:])):
            failures.append({'stage': 'sfnt', 'code': 'sfnt_tables_overlap'})
        need('head' in tables, 'required_head_absent')
        head_at, head = tables['head']
        stored_adjustment = u32(head, 8)
        zeroed = data[:head_at + 8] + b'\0' * 4 + data[head_at + 12:]
        expected_adjustment = (MAGIC - checksum(zeroed)) & 0xFFFFFFFF
        whole = checksum(data)
        result['head'] = {'storedAdjustment': f'{stored_adjustment:08x}', 'expectedAdjustment': f'{expected_adjustment:08x}', 'wholeFontChecksum': f'{whole:08x}', 'expectedWholeFontChecksum': f'{MAGIC:08x}', 'full32BitAdjustmentValid': stored_adjustment == expected_adjustment and whole == MAGIC}
        if stored_adjustment != expected_adjustment or whole != MAGIC:
            failures.append({'stage': 'sfnt', 'code': 'head_full32bit_adjustment_or_whole_checksum_mismatch'})
        need('maxp' in tables and len(tables['maxp'][1]) >= 6, 'required_maxp_glyph_count_absent')
        glyph_count = u16(tables['maxp'][1], 4)
        need(glyph_count > 0, 'invalid_maxp_glyph_count')
        result['glyphCount'] = glyph_count
        if 'cmap' in tables:
            result['cmapPresent'] = True
            result['cmapSubtables'], manual = inspect_cmap(tables['cmap'][1], glyph_count, failures)
        else:
            result['cmapNote'] = 'Absent cmap is not itself rejected for a PDF subset; there is no cmap structure to verify. PDF encoding/ToUnicode are outside this container check.'
    except InvalidFont as error:
        failures.append({'stage': 'sfnt', 'code': error.code, **error.details})
    ft = {'opened': False, 'getBestCmapCalled': False, 'getBestCmapSucceeded': False}
    result['fontTools'] = ft
    try:
        with warnings.catch_warnings(record=True) as caught:
            font = TTFont(BytesIO(data), lazy=False, checkChecksums=0, recalcBBoxes=False, recalcTimestamp=False)
            ft['opened'] = True
            if 'name' in font:
                metadata = {}
                for record in font['name'].names:
                    if record.nameID not in (1, 2, 4, 6, 16, 17):
                        continue
                    try:
                        value = record.toUnicode()
                    except Exception:
                        continue
                    if value and len(value) <= 160:
                        metadata.setdefault(str(record.nameID), set()).add(value)
                result['nameIDs'] = {key: sorted(values) for key, values in metadata.items()}
            if 'cmap' in font:
                ft['getBestCmapCalled'] = True
                best = font.getBestCmap()
                ft['getBestCmapSucceeded'] = True
                ft['bestCmapMappings'] = len(best) if best is not None else None
                ft['bestCmapNonBMPMappings'] = sum(code > 0xFFFF for code in best) if best else 0
                order = font.getGlyphOrder()
                ft['glyphOrderCount'] = len(order)
                checked = 0
                for table in font['cmap'].tables:
                    key = (table.platformID, table.platEncID, table.format, getattr(table, 'language', 0))
                    if key not in manual:
                        continue
                    decoded = {code: font.getGlyphID(name) for code, name in table.cmap.items() if font.getGlyphID(name) != 0}
                    if decoded != manual[key]:
                        failures.append({'stage': 'fontTools', 'code': 'independent_cmap_mapping_disagrees', 'format': table.format})
                    checked += 1
                ft['independentlyComparedSubtables'] = checked
                if best is not None:
                    best_ids = {code: font.getGlyphID(name) for code, name in best.items() if font.getGlyphID(name) != 0}
                    # The selected best Unicode subtable may also be format 0/6/14,
                    # so compare only when its actual mapping is one we parsed.
                    candidates = [mapping for key, mapping in manual.items() if key[0] == 0 or key[0] == 3 and key[1] in (1, 10)]
                    selected_is_manual = any(table.format in (4, 12, 13) and table.cmap is best for table in font['cmap'].tables)
                    if selected_is_manual and candidates and not any(best_ids == mapping for mapping in candidates):
                        failures.append({'stage': 'fontTools', 'code': 'best_cmap_disagrees_with_independent_mapping'})
            else:
                ft['getBestCmapNote'] = 'No cmap table; getBestCmap is inapplicable rather than falsely reported successful.'
            ft['warningCategories'] = sorted(set(type(item.message).__name__ for item in caught))
            font.close()
    except Exception as error:
        ft['failureType'] = type(error).__name__
        failures.append({'stage': 'fontTools', 'code': 'actual_ttfont_or_getBestCmap_failed', 'errorType': type(error).__name__})
    result['passed'] = not failures
    return result


def embedded_programs(reader):
    from pypdf.generic import IndirectObject
    seen_references, seen_direct, programs = set(), set(), []

    def walk(value):
        if isinstance(value, IndirectObject):
            identity = (value.idnum, value.generation)
            if identity in seen_references:
                return
            seen_references.add(identity)
            value = value.get_object()
        if isinstance(value, dict):
            if id(value) in seen_direct:
                return
            seen_direct.add(id(value))
            if '/FontFile2' in value:
                stream = value['/FontFile2'].get_object()
                programs.append((stream.get_data(), str(value.get('/FontName', ''))[:160]))
            for child in value.values():
                walk(child)
        elif isinstance(value, (list, tuple)):
            for child in value:
                walk(child)

    walk(reader.trailer)
    return programs


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdfs', nargs='+', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--fonttools-path', default=os.environ.get('FONTTOOLS_PATH'))
    args = parser.parse_args()
    if args.fonttools_path:
        sys.path.insert(0, str(Path(args.fonttools_path).resolve()))
    import fontTools
    from fontTools.ttLib import TTFont
    import pypdf
    from pypdf import PdfReader
    logging.getLogger('fontTools').setLevel(logging.CRITICAL)
    logging.getLogger('pypdf').setLevel(logging.CRITICAL)
    report = {'method': 'Independent decoded FontFile2 SFNT/checksum/cmap validation plus actual fontTools parse/getBestCmap; not manuscript extraction or a visual conformance certificate.', 'boundary':'Missing optional tables are not rejected. Redundant SFNT search hints are advisory; bounds, table/whole checksums, head adjustment, implemented cmap structures and actual fontTools parse remain fatal checks. No full OpenType or PDF visual-conformance claim.', 'standards': STANDARDS, 'fontToolsVersion': fontTools.__version__, 'pypdfVersion': pypdf.__version__, 'inputs': []}
    cache = {}
    for index, path in enumerate(args.pdfs, 1):
        item = {'inputIndex': index, 'fonts': [], 'failures': []}
        report['inputs'].append(item)
        try:
            data = path.read_bytes()
            item['pdfSHA256'], item['pdfBytes'] = sha(data), len(data)
            reader = PdfReader(BytesIO(data), strict=True)
            item['pages'] = len(reader.pages)
            unique = {}
            for program, name in embedded_programs(reader):
                digest = sha(program)
                if digest not in unique:
                    if digest not in cache:
                        cache[digest] = inspect_sfnt(program, TTFont)
                    unique[digest] = {'descriptorFontNames': [], 'references': 0, **cache[digest]}
                unique[digest]['references'] += 1
                if name and name not in unique[digest]['descriptorFontNames']:
                    unique[digest]['descriptorFontNames'].append(name)
            item['fonts'] = list(unique.values())
            item['applicable'] = bool(item['fonts'])
            item['passed'] = all(font['passed'] for font in item['fonts']) if item['fonts'] else None
            if not item['fonts']:
                item['note'] = 'No reachable FontFile2 program was inspected; this is not font validation success or a claim that a scanned/non-TrueType PDF is invalid.'
        except Exception as error:
            item['failures'].append({'code': 'pdf_or_font_stream_read_failed', 'errorType': type(error).__name__})
            item['passed'] = False
    report['fontProgramsChecked'] = sum(len(item['fonts']) for item in report['inputs'])
    report['failedFontPrograms'] = sum(not font['passed'] for item in report['inputs'] for font in item['fonts'])
    report['passed'] = bool(report['fontProgramsChecked']) and all(item['passed'] is True for item in report['inputs'])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=True, indent=2), encoding='utf-8')
    print(json.dumps({'passed': report['passed'], 'inputs': len(report['inputs']), 'fontProgramsChecked': report['fontProgramsChecked'], 'failedFontPrograms': report['failedFontPrograms']}))
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    sys.exit(main())
