#!/usr/bin/env python3
"""Read-only receiver PDF measurements, bound to local source JSON and DOCX.

python scripts/verify-receiver-layout.py --source ignored/source.json \
  --docx ignored/actual.docx --pdf ignored/receiver.pdf \
  --renderer libreoffice --output ignored/receiver-layout.json

Set FONTTOOLS_PATH to an existing offline fontTools directory. Never launches
LibreOffice/Word, installs fonts, edits input artifacts, or saves page/font data.
Optional --imprint-only checks no signer layout or name glyph identity.
Explicit --renderer product requires Producer="FPDF 1.7" and Creator="Doc2GovPDF";
that attribution never represents native Word/LibreOffice rendering.
Optional --font-map reads only explicitly listed local QA font paths after SHA256
and real family-name checks. Without it, glyph sources remain DOCX-embedded only.
Exit 0 = all checks within the explicitly reported scope pass; 1 = an observed failure; 2 = unsupported /
insufficient evidence. A requested renderer label alone is not renderer proof.
"""
import argparse
from collections import defaultdict
import hashlib
from io import BytesIO
import json
import logging
import math
import os
from pathlib import Path
import re
import statistics
import subprocess
import shutil
import tempfile
import sys
import xml.etree.ElementTree as ET
import zipfile

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
RELS = '{http://schemas.openxmlformats.org/package/2006/relationships}'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def compact(text):
    return ''.join(str(text).split())


class Unsupported(Exception):
    def __init__(self, code):
        self.code = code


def unsupported_if(value, code):
    if value:
        raise Unsupported(code)


def check(code, value, **measurements):
    return {'code': code, 'status': 'pass' if value else 'fail', **measurements}


def rollup(checks):
    states = [item['status'] for item in checks]
    return 'fail' if 'fail' in states else 'unsupported' if 'unsupported' in states or not states else 'pass'


def unicode_map(data):
    # Mapping remains private in memory. It is never included in the report.
    text = data.decode('ascii')
    result = {}
    for block in re.findall(r'beginbfchar(.*?)endbfchar', text, re.S):
        for first, target in re.findall(r'<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>', block):
            result[int(first, 16)] = bytes.fromhex(target).decode('utf-16be', errors='surrogatepass')
    for block in re.findall(r'beginbfrange(.*?)endbfrange', text, re.S):
        for first, last, target in re.findall(r'<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>', block):
            start, end = int(first, 16), int(last, 16)
            unsupported_if(end < start or end-start > 0x110000, 'unicode_range_unmeasurable')
            for code in range(start, end+1):
                result[code] = (int(target, 16)+code-start).to_bytes(len(target)//2, 'big').decode('utf-16be', errors='surrogatepass')
        for first, last, array in re.findall(r'<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\[(.*?)\]', block, re.S):
            start, end = int(first, 16), int(last, 16)
            values = re.findall(r'<([0-9a-fA-F]+)>', array)
            unsupported_if(len(values) != end-start+1, 'unicode_range_array_unmeasurable')
            for code, value in zip(range(start, end+1), values):
                result[code] = bytes.fromhex(value).decode('utf-16be', errors='surrogatepass')
    return result


def font_names(font):
    if 'name' not in font:
        return {}
    result = defaultdict(set)
    for record in font['name'].names:
        if record.nameID in (1, 2, 4, 6, 16, 17):
            try:
                value = record.toUnicode()
                if value and len(value) <= 160:
                    result[str(record.nameID)].add(value)
            except Exception:
                pass
    return {key: sorted(values) for key, values in result.items()}


def section_geometry(document):
    sections = list(document.iter(W+'sectPr'))
    if not sections:
        return None
    size, margin = sections[-1].find(W+'pgSz'), sections[-1].find(W+'pgMar')
    if size is None or margin is None or not all(size.get(W+key) for key in ('h','w')) or margin.get(W+'bottom') is None:
        return None
    height, width, bottom = float(size.get(W+'h'))/20, float(size.get(W+'w'))/20, float(margin.get(W+'bottom'))/20
    if height>0 and width>0 and 0<=bottom<height:
        return {'lastSectionHeightPoints':height,'lastSectionWidthPoints':width,'bottomMarginPoints':bottom,'bodyBottomFromTopPoints':height-bottom}
    return None


def docx_page_geometry(data):
    with zipfile.ZipFile(BytesIO(data)) as package:
        return section_geometry(ET.fromstring(package.read('word/document.xml')))


def docx_inputs(data, people, TTFont):
    requests = []
    with zipfile.ZipFile(BytesIO(data)) as package:
        document = ET.fromstring(package.read('word/document.xml'))
        page_geometry = section_geometry(document)
        paragraphs = []
        for paragraph in document.iter(W+'p'):
            characters = []
            for run in paragraph.iter(W+'r'):
                props = run.find(W+'rPr')
                fonts = props.find(W+'rFonts') if props is not None else None
                size = props.find(W+'sz') if props is not None else None
                family = (fonts.get(W+'eastAsia') or fonts.get(W+'hAnsi') or fonts.get(W+'ascii')) if fonts is not None else None
                points = float(size.get(W+'val'))/2 if size is not None else None
                for text in run.iter(W+'t'):
                    characters.extend((letter, family, points) for letter in text.text or '')
            paragraphs.append(characters)
        for index, person in enumerate(people, 1):
            matches = []
            for paragraph in paragraphs:
                text = ''.join(value[0] for value in paragraph)
                start = text.find(person)
                if start >= 0:
                    matches.append(paragraph[start:start+len(person)])
            unsupported_if(len(matches) != 1, 'docx_name_binding_not_unique')
            unsupported_if(any(not value[1] or value[2] is None for value in matches[0]), 'docx_requested_font_or_size_requires_inheritance_resolution')
            requests.append({'sourceIndex': index, 'characters': matches[0]})
        sources = {}
        if 'word/fontTable.xml' in package.namelist() and 'word/_rels/fontTable.xml.rels' in package.namelist():
            table = ET.fromstring(package.read('word/fontTable.xml'))
            rels = ET.fromstring(package.read('word/_rels/fontTable.xml.rels'))
            targets = {item.get('Id'): item.get('Target') for item in rels.findall(RELS+'Relationship')}
            import posixpath
            for entry in table.findall(W+'font'):
                family = entry.get(W+'name')
                for embedded in entry:
                    if not embedded.tag.startswith(W+'embed'):
                        continue
                    target = targets.get(embedded.get(R+'id'))
                    unsupported_if(not target, 'docx_font_relationship_missing')
                    part = posixpath.normpath('word/'+target)
                    unsupported_if(not part.startswith('word/fonts/'), 'docx_font_relationship_outside_font_parts')
                    key = bytes.fromhex(embedded.get(W+'fontKey', '').strip('{}').replace('-', ''))
                    unsupported_if(len(key) != 16, 'docx_obfuscation_key_unmeasurable')
                    raw = bytearray(package.read(part))
                    unsupported_if(len(raw) < 32, 'docx_font_program_truncated')
                    for i in range(32):
                        raw[i] ^= key[15-i%16]
                    program = bytes(raw)
                    parsed = TTFont(BytesIO(program), recalcTimestamp=False)
                    sources.setdefault(family, []).append({'font': parsed, 'programSHA256': sha(program), 'nameIDs': font_names(parsed), 'sourceKind':'docx-embedded', 'sourceRoles':[], 'embeddedInDOCX':True})
    return requests, sources, page_geometry


def add_explicit_qa_fonts(path, sources, TTFont):
    raw = path.read_bytes()
    font_map = json.loads(raw.decode('utf-8-sig'))
    roles = font_map.get('roles')
    unsupported_if(not isinstance(roles, list) or not roles or len(roles)>32, 'explicit_font_map_roles_invalid')
    summary = []
    for entry in roles:
        unsupported_if(not isinstance(entry, dict), 'explicit_font_map_entry_invalid')
        role, family, postscript, declared = (entry.get(key) for key in ('role','name1','name6','sha256'))
        unsupported_if(not all(isinstance(value,str) and value for value in (role,family,postscript,declared)) or not re.fullmatch(r'[0-9a-fA-F]{64}', declared), 'explicit_font_map_identity_or_hash_invalid')
        local_path = entry.get('path')
        unsupported_if(not isinstance(local_path,str) or not local_path, 'explicit_font_map_path_missing')
        program = Path(local_path).read_bytes()
        actual_hash = sha(program)
        unsupported_if(actual_hash != declared.lower(), 'explicit_font_map_sha256_mismatch')
        unsupported_if(program[:4] == b'ttcf', 'explicit_font_map_collection_face_not_explicit')
        font = TTFont(BytesIO(program), recalcTimestamp=False)
        names = font_names(font)
        unsupported_if(family not in names.get('1',[]) or postscript not in names.get('6',[]), 'explicit_font_map_actual_name_identity_mismatch')
        existing = sources.setdefault(family, [])
        same = next((value for value in existing if value['programSHA256']==actual_hash), None)
        if same is not None:
            if role not in same['sourceRoles']:
                same['sourceRoles'].append(role)
            embedded = same['embeddedInDOCX']
        else:
            existing.append({'font':font,'programSHA256':actual_hash,'nameIDs':names,'sourceKind':'explicit-local-qa-map','sourceRoles':[role],'embeddedInDOCX':False})
            embedded = False
        summary.append({'role':role,'family':family,'programSHA256':actual_hash,'programEmbeddedInDOCX':embedded})
    return {'fontMapSHA256':sha(raw),'fontMapSources':summary,'fontMapBoundary':'Explicit local QA inputs only; no automatic system-font lookup, installation, copying or uploading.'}


def lines_of_text(page):
    groups = []
    for char in page.chars:
        if not char['text'].strip():
            continue
        matrix = char.get('matrix')
        if matrix is None or len(matrix) != 6 or abs(matrix[1]) > .001 or abs(matrix[2]) > .001:
            continue
        if len(char['text']) != 1:
            continue
        baseline = float(page.height)-float(matrix[5])
        group = next((value for value in groups if abs(value['baseline']-baseline) < .2), None)
        if group is None:
            group = {'baseline': baseline, 'chars': []}
            groups.append(group)
        group['chars'].append(char)
    for group in groups:
        group['chars'].sort(key=lambda char: char['x0'])
    return groups


def occurrences(page, text):
    matches = []
    for group in lines_of_text(page):
        chars = group['chars']
        flat = ''.join(char['text'] for char in chars)
        at = flat.find(compact(text))
        while at >= 0:
            chosen = chars[at:at+len(compact(text))]
            matches.append({'chars': chosen, 'page': page.page_number, 'left': float(chosen[0]['matrix'][4]), 'right': max(float(c['x1']) for c in chosen), 'top': min(float(c['top']) for c in chosen), 'bottom': max(float(c['bottom']) for c in chosen), 'baseline': float(page.height)-statistics.mean(float(c['matrix'][5]) for c in chosen), 'sizes': sorted(set(round(float(c['size']), 3) for c in chosen))})
            at = flat.find(compact(text), at+1)
    return matches


def public_position(value):
    return {key: item for key, item in value.items() if key != 'chars'}


def normalize_font_name(value):
    text = str(value).lstrip('/')
    return re.sub(r'#([0-9a-fA-F]{2})', lambda match: chr(int(match[1], 16)), text)


def receiver_fonts(page, TTFont):
    fonts = defaultdict(list)
    seen = set()
    def collect(resources):
        resources = resources.get_object() if hasattr(resources, 'get_object') else resources
        if not resources or id(resources) in seen:
            return
        seen.add(id(resources))
        for ref in resources.get('/Font', {}).values():
            item = ref.get_object()
            base = normalize_font_name(item.get('/BaseFont', ''))
            data = {'pdfFont': item, 'baseName': base}
            type0 = item.get('/Subtype') == '/Type0' and item.get('/Encoding') == '/Identity-H'
            cid = item['/DescendantFonts'][0].get_object() if type0 else item
            descriptor = cid.get('/FontDescriptor', {})
            descriptor = descriptor.get_object() if hasattr(descriptor, 'get_object') else descriptor
            flags = int(descriptor.get('/Flags', 0))
            simple_symbol = item.get('/Subtype') == '/TrueType' and '/Encoding' not in item and flags & 4 and not flags & 32
            if (type0 or simple_symbol) and '/ToUnicode' in item and '/FontFile2' in descriptor:
                program = descriptor['/FontFile2'].get_data()
                parsed = TTFont(BytesIO(program), recalcTimestamp=False)
                mapping = unicode_map(item['/ToUnicode'].get_data())
                inverse = defaultdict(set)
                for code, char in mapping.items():
                    if len(char) == 1:
                        inverse[char].add(code)
                extra = {}
                if type0:
                    gid_map = cid.get('/CIDToGIDMap', '/Identity')
                    if hasattr(gid_map, 'get_object'):
                        gid_map = gid_map.get_object()
                    extra = {'gidMap': gid_map if gid_map == '/Identity' else gid_map.get_data(), 'encodingMode': 'Identity-H CIDToGID'}
                else:
                    # PDF Reference TrueType symbolic selection: the embedded
                    # (1,0) byte cmap, and compatible (3,0) symbol cmap if present.
                    # This is the actual byte-code map, never Unicode-name guessing.
                    by_code = defaultdict(set)
                    for table in parsed['cmap'].tables:
                        if (table.platformID, table.platEncID) not in ((1, 0), (3, 0)):
                            continue
                        for code in mapping:
                            if not 0 <= code <= 255:
                                continue
                            choices = [code] if table.platformID == 1 else [code, 0xF000+code]
                            for target in choices:
                                glyph = table.cmap.get(target)
                                if glyph is not None:
                                    by_code[code].add(parsed.getGlyphID(glyph))
                    extra = {'byteGIDs': dict(by_code), 'encodingMode': 'symbolic TrueType embedded byte cmap (1,0)/(3,0)'}
                parsed.setGlyphOrder(['.notdef']+[f'gid{index:05d}' for index in range(1, parsed['maxp'].numGlyphs)])
                data.update({'font': parsed, 'programSHA256': sha(program), 'nameIDs': font_names(parsed), 'inverse': inverse, **extra})
            fonts[base].append(data)
        for ref in resources.get('/XObject', {}).values():
            item = ref.get_object()
            if item.get('/Subtype') == '/Form':
                collect(item.get('/Resources', {}))
    collect(page.get('/Resources', {}))
    return fonts


def match_name_fonts(positions, requests, sources, pdf_page, TTFont, RecordingPen):
    available = receiver_fonts(pdf_page, TTFont)
    cache = {}
    def outline(font, glyph):
        key = id(font), glyph
        if key not in cache:
            glyphs = font.getGlyphSet()
            pen = RecordingPen(glyphs)
            glyphs[glyph].draw(pen)
            cache[key] = (sha(repr(pen.value).encode()), bool(pen.value))
        return cache[key]
    checks = []
    for position, request in zip(positions, requests):
        summaries, matched = {}, 0
        try:
            unsupported_if(len(position['chars']) != len(request['characters']), 'name_character_binding_ambiguous')
            for char, expected in zip(position['chars'], request['characters']):
                letter, family, points = expected
                unsupported_if(char['text'] != letter, 'name_character_binding_disagrees')
                font_sources = sources.get(family, [])
                unsupported_if(len(font_sources) != 1, 'requested_docx_font_has_no_unique_verified_source')
                source = font_sources[0]
                glyph = source['font'].getBestCmap().get(ord(letter))
                unsupported_if(glyph is None, 'requested_font_lacks_measurable_character')
                expected_outline = outline(source['font'], glyph)
                candidates = available.get(normalize_font_name(char['fontname']), [])
                unsupported_if(not candidates or any('font' not in candidate for candidate in candidates), 'actual_name_has_no_supported_embedded_truetype_encoding')
                actual_results = []
                for candidate in candidates:
                    codes = candidate['inverse'].get(letter, set())
                    unsupported_if(not codes, 'actual_name_has_no_reliable_to_unicode_binding')
                    for code in codes:
                        if 'byteGIDs' in candidate:
                            gids = candidate['byteGIDs'].get(code, set())
                            unsupported_if(not gids, 'symbolic_byte_code_has_no_embedded_glyph_mapping')
                        else:
                            mapping = candidate['gidMap']
                            if mapping == '/Identity':
                                gids = {code}
                            else:
                                unsupported_if(2*code+2 > len(mapping), 'actual_CIDToGID_truncated')
                                gids = {int.from_bytes(mapping[2*code:2*code+2], 'big')}
                        order = candidate['font'].getGlyphOrder()
                        for gid in gids:
                            unsupported_if(gid >= len(order), 'actual_name_glyph_outside_font_program')
                            actual_outline = outline(candidate['font'], order[gid])
                            actual_results.append(candidate['font']['head'].unitsPerEm == source['font']['head'].unitsPerEm and actual_outline == expected_outline and actual_outline[1])
                    summaries[(candidate['programSHA256'], source['programSHA256'])] = {'actualEmbeddedProgramSHA256': candidate['programSHA256'], 'requestedEmbeddedDOCXProgramSHA256': source['programSHA256'] if source['embeddedInDOCX'] else None, 'requestedProgramSHA256':source['programSHA256'], 'requestedSourceKind':source['sourceKind'], 'requestedSourceRoles':source['sourceRoles'], 'requestedProgramEmbeddedInDOCX':source['embeddedInDOCX'], 'requestedFamily': family, 'actualEncodingMode': candidate['encodingMode'], 'actualEmbeddedNameIDs': candidate['nameIDs']}
                unsupported_if(len(set(actual_results)) > 1, 'duplicate_unicode_or_font_resource_glyph_binding_ambiguous')
                if not all(actual_results):
                    checks.append({'code': 'actual_name_outline_differs_from_requested_embedded_face', 'sourceIndex': request['sourceIndex'], 'status': 'fail'})
                    break
                matched += 1
            else:
                checks.append({'code': 'actual_name_embedded_face_and_size', 'sourceIndex': request['sourceIndex'], 'status': 'pass' if all(abs(value-16) <= .1 for value in position['sizes']) and all(abs(item[2]-16) <= .1 for item in request['characters']) else 'fail', 'sizePoints': position['sizes'], 'matchedNonemptyGlyphs': matched, 'fonts': list(summaries.values())})
        except Unsupported as error:
            checks.append({'code': error.code, 'sourceIndex': request['sourceIndex'], 'status': 'unsupported'})
        except Exception as error:
            checks.append({'code': 'font_identity_measurement_unavailable', 'sourceIndex': request['sourceIndex'], 'status': 'unsupported', 'errorType': type(error).__name__})
    return checks


def dark_color(value):
    if value is None:
        return True  # The raster check still has to prove dark visible coverage.
    if isinstance(value, (int, float)):
        return value < .8
    if len(value) == 3:
        return .2126*value[0]+.7152*value[1]+.0722*value[2] < .8
    if len(value) == 4:
        return (1-value[3])*(1-sum(value[:3])/3) < .8
    return False


def actual_horizontal_edges(page):
    edges = []
    for primitive in list(page.lines)+list(page.rect_edges)+list(page.curve_edges):
        if abs(float(primitive['top'])-float(primitive['bottom'])) > .6 or float(primitive['x1'])-float(primitive['x0']) < 20:
            continue
        if primitive.get('stroke') is False or not dark_color(primitive.get('stroking_color')):
            continue
        edges.append({'left': float(primitive['x0']), 'right': float(primitive['x1']), 'y': (float(primitive['top'])+float(primitive['bottom']))/2, 'thickness': float(primitive.get('linewidth') or 0), 'primitive': primitive.get('object_type', 'line')})
    for rect in page.rects:
        if rect.get('fill') and dark_color(rect.get('non_stroking_color')) and float(rect['bottom'])-float(rect['top']) <= 3 and float(rect['x1'])-float(rect['x0']) >= 20:
            edges.append({'left': float(rect['x0']), 'right': float(rect['x1']), 'y': (float(rect['top'])+float(rect['bottom']))/2, 'thickness': float(rect['bottom'])-float(rect['top']), 'primitive': 'thin-filled-rect'})
    merged = []
    for edge in sorted(edges, key=lambda value: (round(value['y']), value['left'])):
        candidate = next((item for item in merged if abs(item['y']-edge['y']) <= .8 and edge['left'] <= item['right']+2 and edge['right'] >= item['left']-2), None)
        if candidate is None:
            merged.append({**edge, 'parts': 1})
        else:
            candidate['left'] = min(candidate['left'], edge['left'])
            candidate['right'] = max(candidate['right'], edge['right'])
            candidate['thickness'] = max(candidate['thickness'], edge['thickness'])
            candidate['parts'] += 1
    return merged


def raster_coverage(page, image, edge):
    image = image.convert('L')
    scale_x, scale_y = image.width/float(page.width), image.height/float(page.height)
    left, right = max(0, math.ceil(edge['left']*scale_x)+2), min(image.width, math.floor(edge['right']*scale_x)-2)
    y = edge['y']*scale_y
    radius = max(2, math.ceil(edge['thickness']*scale_y)+1)
    top, bottom = max(0, math.floor(y)-radius), min(image.height, math.ceil(y)+radius+1)
    unsupported_if(right <= left or bottom <= top, 'line_raster_region_outside_page')
    pixels = image.load()
    columns = [any(pixels[x, row] < 180 for row in range(top, bottom)) for x in range(left, right)]
    longest, current = 0, 0
    for covered in columns:
        current = 0 if covered else current+1
        longest = max(longest, current)
    return {'darkColumnCoverage': sum(columns)/len(columns), 'longestClearGapFraction': longest/len(columns)}


def render_actual_page(page, pdf_path):
    binary = os.environ.get('PDFTOPPM') or shutil.which('pdftoppm') or shutil.which('pdftoppm.exe')
    if binary:
        from PIL import Image
        with tempfile.TemporaryDirectory(prefix='doc2gov-receiver-readonly-') as folder:
            prefix = str(Path(folder)/'page')
            subprocess.run([binary, '-f', str(page.page_number), '-singlefile', '-r', '144', '-png', str(pdf_path), prefix], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)
            with Image.open(prefix+'.png') as image:
                return image.convert('RGB').copy(), 'Poppler pdftoppm'
    return page.to_image(resolution=144, antialias=True).original, 'PDFium via pdfplumber'


def physical_bottom_check(page, text_bottom, font_size, lower_rule, section):
    if section is None:
        return {'code':'imprint_physical_bottom_placement','status':'unsupported','reason':'docx_last_section_page_height_or_bottom_margin_not_explicit'}
    if abs(float(page.height)-section['lastSectionHeightPoints'])>1 or abs(float(page.width)-section['lastSectionWidthPoints'])>1:
        return {'code':'imprint_physical_bottom_placement','status':'unsupported','reason':'receiver_page_geometry_differs_from_last_docx_section','section':section,'actualPageHeightPoints':float(page.height),'actualPageWidthPoints':float(page.width)}
    expected=section['bodyBottomFromTopPoints']
    # Six points covers this host's Word/LO rounding and rule stroke centering
    # (observed correct Word rule differs by 0.41pt), but not a line-height drift.
    # The actual glyph box must also remain in the final imprint row: a border
    # at the page bottom cannot excuse text that has floated far above it.
    tolerance=6.0
    text_gap=expected-text_bottom
    text_near_bottom=-tolerance<=text_gap<=font_size+tolerance
    rule_delta=lower_rule['y']-expected if lower_rule is not None else None
    rule_near_bottom=abs(rule_delta)<=tolerance if rule_delta is not None else True
    return {'code':'imprint_physical_bottom_placement','status':'pass' if text_near_bottom and rule_near_bottom else 'fail','section':section,'tolerancePoints':tolerance,'actualTextBottomPoints':text_bottom,'textBottomGapPoints':text_gap,'allowedTextBottomGapPoints':[-tolerance,font_size+tolerance],'actualLowerRulePoints':lower_rule['y'] if lower_rule is not None else None,'lowerRuleDeltaPoints':rule_delta,'basis':'actual glyph boxes and lower-rule geometry; rule visibility separately checked' if lower_rule is not None else 'actual glyph boxes only; missing lower rule remains a separate failure'}


def imprint_checks(document, fields, pdf_path, section):
    issuer = fields.get('issuer', '')
    date = fields.get('issueDate', '')
    unsupported_if(not issuer or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', date), 'source_has_no_explicit_complete_imprint')
    year, month, day = map(int, date.split('-'))
    date_text = f'{year}年{month}月{day}日印发'
    issuer_matches = [value for page in document.pages for value in occurrences(page, issuer)]
    date_matches = [value for page in document.pages for value in occurrences(page, date_text)]
    unsupported_if(not issuer_matches or not date_matches, 'imprint_text_not_reliably_measurable')
    issuer_match = max(issuer_matches, key=lambda value: (value['page'], value['baseline']))
    dates = [value for value in date_matches if value['page'] == issuer_match['page']]
    unsupported_if(not dates, 'imprint_fields_not_on_a_common_measurable_page')
    date_match = min(dates, key=lambda value: abs(value['baseline']-issuer_match['baseline']))
    page = document.pages[issuer_match['page']-1]
    top, bottom = min(issuer_match['top'], date_match['top']), max(issuer_match['bottom'], date_match['bottom'])
    left, right = min(issuer_match['left'], date_match['left']), max(issuer_match['right'], date_match['right'])
    # A scanned/raster band cannot prove vector rule absence or actual glyph identity.
    for image in page.images:
        if float(image['x0']) < right and float(image['x1']) > left and float(image['top']) < bottom+30 and float(image['bottom']) > top-30:
            raise Unsupported('raster_image_overlaps_imprint_measurement_band')
    edges = [value for value in actual_horizontal_edges(page) if value['left'] <= left+3 and value['right'] >= right-3 and value['right']-value['left'] >= page.width*.5]
    upper = [value for value in edges if top-30 <= value['y'] <= top+1]
    lower = [value for value in edges if bottom-1 <= value['y'] <= bottom+30]
    checks = [check('imprint_fields_share_baseline', abs(issuer_match['baseline']-date_match['baseline']) <= 2)]
    actual_font_size=max(issuer_match['sizes']+date_match['sizes'])
    checks.append(check('imprint_actual_fields_are_14pt',all(abs(size-14)<=.1 for size in issuer_match['sizes']+date_match['sizes']),actualSizesPoints=sorted(set(issuer_match['sizes']+date_match['sizes']))))
    checks.append(check('imprint_is_on_last_pdf_page',issuer_match['page']==len(document.pages),actualPage=issuer_match['page'],pdfPageCount=len(document.pages)))
    measurements = {'page': issuer_match['page'], 'issuer': public_position(issuer_match), 'printingDate': public_position(date_match), 'horizontalCandidates': len(edges)}
    if not upper or not lower:
        # Curve-only objects that could be a rule but were not measured make the
        # result unsupported; otherwise two required vector rules are absent.
        uncertain = any(value.get('width', 0) >= page.width*.5 and top-30 <= value.get('top', -1000) <= bottom+30 for value in page.curves)
        checks.append({'code': 'imprint_two_rules_not_measured', 'status': 'unsupported' if uncertain else 'fail', 'upperCandidates': len(upper), 'lowerCandidates': len(lower)})
        checks.append(physical_bottom_check(page,bottom,actual_font_size,min(lower,key=lambda value:abs(value['y']-bottom)) if lower else None,section))
        return checks, measurements
    try:
        image, rasterizer = render_actual_page(page, pdf_path)
        measurements['visibilityRasterizer'] = rasterizer
    except Exception as error:
        checks.append({'code': 'imprint_actual_raster_visibility_unavailable', 'status': 'unsupported', 'errorType': type(error).__name__})
        return checks, measurements
    selected = []
    for side, values in (('upper', upper), ('lower', lower)):
        measured = [(edge, raster_coverage(page, image, edge)) for edge in values]
        edge, coverage = max(measured, key=lambda value: value[1]['darkColumnCoverage'])
        selected.append({**edge, **coverage, 'side': side})
        checks.append(check('imprint_'+side+'_rule_actually_visible', coverage['darkColumnCoverage'] >= .9 and coverage['longestClearGapFraction'] <= .05, darkColumnCoverage=coverage['darkColumnCoverage'], longestClearGapFraction=coverage['longestClearGapFraction']))
    measurements['rules'] = selected
    checks.append(physical_bottom_check(page,bottom,actual_font_size,next(value for value in selected if value['side']=='lower'),section))
    return checks, measurements


def renderer_family(producer, creator):
    # Product classification is deliberately an exact two-field contract. The
    # CLI choice does not grant attribution, and product output is never native
    # Word/LibreOffice evidence. Metadata is attribution, not authenticity proof.
    if producer == 'FPDF 1.7' and creator == 'Doc2GovPDF':
        return 'product'
    technical = ' '.join(str(value or '') for value in (producer, creator)).lower()
    return 'libreoffice' if 'libreoffice' in technical else 'word' if 'word' in technical else 'unknown'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--docx', type=Path, required=True)
    parser.add_argument('--pdf', type=Path, required=True)
    parser.add_argument('--renderer', choices=('libreoffice', 'word', 'product'), required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--imprint-only', action='store_true', help='Explicit narrow scope: receiver attribution and actual imprint fields/14pt/rules/final-page bottom only; no signer/glyph checks are counted.')
    parser.add_argument('--font-map', type=Path, help='Explicit local QA font map: roles with path, sha256, name1 and name6; no implicit system-font discovery. Only used for full signer/glyph scope.')
    parser.add_argument('--fonttools-path', default=os.environ.get('FONTTOOLS_PATH'))
    args = parser.parse_args()
    if args.fonttools_path:
        sys.path.insert(0, str(Path(args.fonttools_path).resolve()))
    import pdfplumber
    from pypdf import PdfReader
    TTFont, DecomposingRecordingPen = None, None
    if not args.imprint_only:
        from fontTools.ttLib import TTFont
        from fontTools.pens.recordingPen import DecomposingRecordingPen
    logging.getLogger('pypdf').setLevel(logging.CRITICAL)
    logging.getLogger('fontTools').setLevel(logging.CRITICAL)
    report = {'schemaVersion':4,'verifierVersion':'receiver-layout-v4-explicit-product','scope':'imprint-only' if args.imprint_only else 'joint-signers-and-imprint','excludedChecks':['signer-source-order','signer-two-column-layout','signer-font-glyph-identity'] if args.imprint_only else [],'fullJointLayoutVerdict':None,'verifierSHA256':sha(Path(__file__).read_bytes()),'status': 'unsupported', 'passed': False, 'checks': [], 'boundary': 'Only the explicitly reported scope is evaluated; excluded signer/name-glyph checks are not passed. Bounded measurements of the supplied receiver PDF only. DOCX declarations are expectations, not rendering proof. Missing text/programs or unsupported encodings cannot pass; raw text, names, glyph sequences, font programs and rendered pages are never written. LO/Word are never launched. Product attribution requires the exact FPDF 1.7 / Doc2GovPDF metadata pair and is never native Office evidence; metadata is not authenticity proof. Optional local QA font-map candidates require exact input SHA256 and actual name records; absent that explicit flag, only DOCX embedded font programs are used. Font containers and complete standards/whole-page visual QA remain separate.'}
    try:
        source_bytes, docx_bytes, pdf_bytes = args.source.read_bytes(), args.docx.read_bytes(), args.pdf.read_bytes()
        report.update({'sourceJSONSHA256': sha(source_bytes), 'docxSHA256': sha(docx_bytes), 'receiverPDFSHA256': sha(pdf_bytes), 'requestedRenderer': args.renderer, 'pdfplumberVersion': pdfplumber.__version__})
        source = json.loads(source_bytes.decode('utf-8-sig'))
        fields = source['fields']
        people = []
        if not args.imprint_only:
            people = [value.strip() for value in fields['signer'].splitlines() if value.strip()]
            unsupported_if(len(people) != 3 or len(set(people)) != 3, 'source_needs_three_unambiguous_ordered_lines')
            report['sourceSignerCount'] = 3
            report['sourceSignersSHA256'] = sha(fields['signer'].encode())
        reader = PdfReader(BytesIO(pdf_bytes))
        metadata = reader.metadata
        producer, creator = (metadata.producer if metadata else ''), (metadata.creator if metadata else '')
        technical = ' '.join(str(value or '') for value in (producer, creator)).lower()
        actual = renderer_family(producer, creator)
        report['detectedRendererFamily'] = actual
        report['renderer'] = actual
        report['nativeOfficeReceiver'] = actual in ('word', 'libreoffice')
        report['rendererVersionHints'] = sorted(set(re.findall(r'\b\d+\.\d+(?:\.\d+){0,3}\b', technical)))
        report['checks'].append({'code': 'receiver_renderer_attribution', 'status': 'unsupported' if actual == 'unknown' else 'pass' if actual == args.renderer else 'fail'})
        if args.imprint_only:
            page_geometry = docx_page_geometry(docx_bytes)
        else:
            requests, sources, page_geometry = docx_inputs(docx_bytes, people, TTFont)
            if args.font_map:
                report.update(add_explicit_qa_fonts(args.font_map, sources, TTFont))
            report['docxRequestedNames'] = [{'sourceIndex': item['sourceIndex'], 'families': sorted(set(value[1] for value in item['characters'])), 'sizePoints': sorted(set(value[2] for value in item['characters']))} for item in requests]
        with pdfplumber.open(BytesIO(pdf_bytes)) as document:
            report['pages'] = len(document.pages)
            unsupported_if(not document.pages,'pdf_has_no_measurable_pages')
            if not args.imprint_only:
                unsupported_if(not document.pages[0].chars, 'first_page_has_no_measurable_character_layer')
                positions = []
                try:
                    for person in people:
                        matches = occurrences(document.pages[0], person)
                        unsupported_if(not matches, 'expected_name_not_reliably_measurable')
                        positions.append(min(matches, key=lambda value: (value['baseline'], value['left'])))
                    references = occurrences(document.pages[0], fields['reference'])
                    unsupported_if(not references, 'reference_not_reliably_measurable')
                    ref = min(references, key=lambda value: (value['baseline'], value['left']))
                    a, b, c = positions
                    report['signers'] = [{'sourceIndex': index+1, **public_position(value)} for index, value in enumerate(positions)]
                    report['reference'] = public_position(ref)
                    report['checks'].extend([check('source_first_two_on_first_row', abs(a['baseline']-b['baseline']) <= 1.25 and a['right']+1 <= b['left']), check('source_third_on_continuation_row', c['baseline']-a['baseline'] >= 16), check('continuation_aligns_first_name_column', abs(c['left']-a['left']) <= 1.25), check('reference_with_last_signer_baseline', abs(ref['baseline']-c['baseline']) <= 1.25 and ref['right']+1 <= c['left'])])
                    report['checks'].extend(match_name_fonts(positions, requests, sources, reader.pages[0], TTFont, DecomposingRecordingPen))
                except Unsupported as error:
                    report['checks'].append({'code': error.code, 'status': 'unsupported'})
            try:
                checks, measurements = imprint_checks(document, fields, args.pdf, page_geometry)
                report['checks'].extend(checks)
                report['imprint'] = measurements
            except Unsupported as error:
                report['checks'].append({'code': error.code, 'status': 'unsupported'})
    except Unsupported as error:
        report['checks'].append({'code': error.code, 'status': 'unsupported'})
    except Exception as error:
        report['checks'].append({'code': 'measurement_could_not_complete', 'status': 'unsupported', 'errorType': type(error).__name__})
    report['status'] = rollup(report['checks'])
    report['passed'] = report['status'] == 'pass'
    report['scopePassed'] = report['passed']
    if not args.imprint_only:
        report['fullJointLayoutVerdict'] = report['status']
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=True, indent=2), encoding='utf-8')
    print(json.dumps({'schemaVersion':4,'scope':report['scope'],'status': report['status'], 'checks': len(report['checks']), 'failures': sum(value['status']=='fail' for value in report['checks']), 'unsupported': sum(value['status']=='unsupported' for value in report['checks'])}))
    return 0 if report['status'] == 'pass' else 1 if report['status'] == 'fail' else 2


if __name__ == '__main__':
    sys.exit(main())
