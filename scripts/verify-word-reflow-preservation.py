#!/usr/bin/env python3
"""Read-only comparison of actual widow-control QA downloads.

No source text, font names/programs or page pixels are included in JSON. PDF
changes are measurements for review, not automatic layout failures. DOCX bytes
expected to preserve a native input are an explicit invariant. This helper never
launches Office, builds product assets, or operates a service.
"""
import argparse
from collections import Counter
import hashlib
from io import BytesIO
import json
import logging
import os
from pathlib import Path
import subprocess
import tempfile

import pdfplumber
from pypdf import PdfReader
from PIL import Image, ImageChops


def sha(value):
    return hashlib.sha256(value).hexdigest()


def digest(value):
    return sha(json.dumps(value, ensure_ascii=False, sort_keys=True,
                          separators=(',', ':')).encode('utf-8'))


def resolved(value):
    return value.get_object() if hasattr(value, 'get_object') else value


def number(value):
    return round(float(value), 6)


def resources_signature(reader):
    """Preserve actual program/map/resource evidence without exposing identities."""
    font_records, image_records, form_records = [], [], []
    for page_index, page in enumerate(reader.pages, 1):
        visited = set()

        def visit(resources, chain):
            resources = resolved(resources)
            if not resources or id(resources) in visited:
                return
            visited.add(id(resources))
            for resource, reference in resolved(resources.get('/Font', {})).items():
                font = resolved(reference)
                descendant = resolved(font['/DescendantFonts'][0]) if '/DescendantFonts' in font else font
                descriptor = resolved(descendant.get('/FontDescriptor', {}))
                programs = []
                for key in ('/FontFile', '/FontFile2', '/FontFile3'):
                    if key in descriptor:
                        program = resolved(descriptor[key])
                        programs.append({'kind': key[1:], 'sha256': sha(program.get_data()),
                                         'bytes': len(program.get_data())})
                maps = {}
                if '/ToUnicode' in font:
                    maps['toUnicode'] = sha(resolved(font['/ToUnicode']).get_data())
                if '/CIDToGIDMap' in descendant:
                    mapping = resolved(descendant['/CIDToGIDMap'])
                    maps['cidToGID'] = sha(mapping.get_data()) if hasattr(mapping, 'get_data') else digest(str(mapping))
                properties = {}
                for key in ('/Subtype', '/Encoding', '/BaseFont', '/FirstChar', '/LastChar', '/Widths'):
                    if key in font:
                        properties[key] = str(resolved(font[key]))
                for key in ('/W', '/DW', '/W2', '/DW2'):
                    if key in descendant:
                        properties[key] = str(resolved(descendant[key]))
                for key in ('/Flags', '/FontBBox', '/Ascent', '/Descent', '/ItalicAngle', '/StemV'):
                    if key in descriptor:
                        properties['descriptor'+key] = str(resolved(descriptor[key]))
                font_records.append({'page': page_index, 'resourceIdentitySHA256': digest([chain, str(resource)]),
                                     'propertiesSHA256': digest(properties), 'maps': maps, 'programs': programs})
            for resource, reference in resolved(resources.get('/XObject', {})).items():
                item = resolved(reference)
                identity = digest([chain, str(resource)])
                if item.get('/Subtype') == '/Image':
                    image_records.append({'page': page_index, 'resourceIdentitySHA256': identity,
                                          'decodedSHA256': sha(item.get_data()),
                                          'propertiesSHA256': digest({key: str(resolved(item.get(key))) for key in
                                              ('/Width', '/Height', '/ColorSpace', '/BitsPerComponent', '/Decode', '/ImageMask')})})
                elif item.get('/Subtype') == '/Form':
                    form_records.append({'page': page_index, 'resourceIdentitySHA256': identity,
                                         'decodedSHA256': sha(item.get_data()),
                                         'geometrySHA256': digest([str(item.get('/BBox')), str(item.get('/Matrix'))])})
                    visit(item.get('/Resources', {}), chain+[str(resource)])
        visit(page.get('/Resources', {}), [])
    return {'fonts': font_records, 'images': image_records, 'forms': form_records}


def measure_pdf(path):
    raw = path.read_bytes()
    reader = PdfReader(BytesIO(raw))
    resources = resources_signature(reader)
    pages, all_text, all_sizes, all_fonts = [], [], [], []
    with pdfplumber.open(BytesIO(raw)) as document:
        for index, page in enumerate(document.pages, 1):
            characters = []
            for char in page.chars:
                row = [char['text'], char.get('fontname'),
                       [number(x) for x in char.get('matrix', [])],
                       [number(char.get(key, 0)) for key in ('x0', 'x1', 'top', 'bottom', 'size', 'adv')]]
                characters.append(row)
                all_sizes.append(number(char.get('size', 0)))
                all_fonts.append(str(char.get('fontname', '')))
            text = ''.join(char['text'] for char in page.chars)
            extracted = page.extract_text() or ''
            all_text.append(text)
            content = reader.pages[index-1].get_contents()
            boxes = [list(map(number, reader.pages[index-1].mediabox)),
                     list(map(number, reader.pages[index-1].cropbox)),
                     int(reader.pages[index-1].get('/Rotate', 0))]
            sizes = Counter(number(char.get('size', 0)) for char in page.chars)
            pages.append({'page': index, 'widthPoints': number(page.width), 'heightPoints': number(page.height),
                          'characters': len(page.chars), 'characterTextSHA256': sha(text.encode()),
                          'extractedTextSHA256': sha(extracted.encode()), 'extractedTextLength': len(extracted),
                          'characterMatrixAndTextSHA256': digest(characters), 'pageBoxesSHA256': digest(boxes),
                          'decodedPageContentSHA256': sha(content.get_data() if content else b''),
                          'sizeCountsPoints': [{'size': key, 'characters': value} for key, value in sorted(sizes.items())],
                          'actualFontIdentitySetSHA256': digest(sorted(set(str(c.get('fontname', '')) for c in page.chars)))})
    return {'sha256': sha(raw), 'bytes': len(raw), 'pages': len(pages),
            'characters': sum(page['characters'] for page in pages),
            'characterTextWithoutPageBreaksSHA256': sha(''.join(all_text).encode()),
            'textPerPageSHA256': digest(all_text), 'sizeSequenceSHA256': digest(all_sizes),
            'actualFontIdentitySequenceSHA256': digest(all_fonts), 'pageMeasurements': pages,
            'resourceSignatureSHA256': digest(resources),
            'embeddedProgramInstances': sum(len(font['programs']) for font in resources['fonts']),
            'fontResources': len(resources['fonts']), 'imageResources': len(resources['images']),
            'embeddedPrograms': [program for font in resources['fonts'] for program in font['programs']]}


def compare_pixels(old, new, pages, binary):
    if binary is None or not binary.is_file():
        return {'status': 'unsupported', 'reason': 'poppler_path_not_available'}
    rows = []
    # Actual page images exist only inside an automatically removed local temp
    # directory. No page image bytes or paths are emitted into the report.
    with tempfile.TemporaryDirectory(prefix='widow-equal-pixels-') as directory:
        folder = Path(directory)
        for label, source in [('old', old), ('new', new)]:
            subprocess.run([str(binary), '-png', '-r', '96', str(source), str(folder/label)],
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, timeout=120,
                           creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        for index in range(1, pages+1):
            with Image.open(folder/f'old-{index}.png') as a, Image.open(folder/f'new-{index}.png') as b:
                a, b = a.convert('RGB'), b.convert('RGB')
                equal = a.size == b.size and ImageChops.difference(a, b).getbbox() is None
                rows.append({'page': index, 'equal': equal, 'oldWidth': a.width, 'oldHeight': a.height,
                             'newWidth': b.width, 'newHeight': b.height})
    return {'status': 'equal' if all(row['equal'] for row in rows) else 'changed', 'pages': rows}


def compare_pdf(old_path, new_path, poppler):
    old, new = measure_pdf(old_path), measure_pdf(new_path)
    keys = ['pages', 'characters', 'characterTextWithoutPageBreaksSHA256', 'textPerPageSHA256',
            'sizeSequenceSHA256', 'actualFontIdentitySequenceSHA256', 'resourceSignatureSHA256']
    equalities = {key+'Equal': old[key] == new[key] for key in keys}
    equalities['pageMeasurementsEqual'] = old['pageMeasurements'] == new['pageMeasurements']
    strict_equal = all(equalities.values())
    pixel = compare_pixels(old_path, new_path, new['pages'], poppler) if strict_equal else {
        'status': 'not-run', 'reason': 'measured_content_geometry_or_resources_changed; review actual pages separately'}
    status = 'equal' if strict_equal and pixel['status'] == 'equal' else 'changed' if not strict_equal or pixel['status'] == 'changed' else 'equal-measurements-pixels-unsupported'
    return {'status': status, 'equalities': equalities, 'old': old, 'new': new, 'pixelComparison': pixel,
            'boundary': 'All character text includes page numbers and repeated table headers. A changed hash does not identify a manuscript edit or establish a layout defect. Font-container validity remains a separate strict validator.'}


def default_manifest():
    rows = []
    for name, old, native in [('town19', 'widow-baseline-town19', 'town-day19'),
                               ('town23', 'widow-baseline-town23', 'town-day23'),
                               ('joint', 'receiver-final-word-joint', 'joint-fallback'),
                               ('health', 'receiver-final-word-health', 'health-original')]:
        for phase in ('opened', 'reloaded'):
            rows.append({'id': name+'-'+phase, 'oldPDF': f'{old}/{phase}.pdf',
                         'newPDF': f'widow-current-{name}/{phase}.pdf',
                         'oldDOCX': f'{old}/{phase}.docx', 'newDOCX': f'widow-current-{name}/{phase}.docx',
                         'expectedNativeDOCX': f'receiver-final-native/inputs/{native}.docx'})
    # Normal new-manuscript exports are comparisons, not original-file-save
    # invariants. Override their pending path conventions with --manifest if the
    # final browser harness chooses a different output directory.
    rows.extend([
        {'id': 'new-joint', 'oldPDF': 'receiver-final-joint/chrome/joint-signers.pdf',
         'newPDF': 'widow-current-new-joint/chrome/joint-signers.pdf',
         'oldDOCX': 'receiver-final-joint/chrome/joint-signers.docx',
         'newDOCX': 'widow-current-new-joint/chrome/joint-signers.docx'},
        {'id': 'new-health', 'oldPDF': 'receiver-final-health/original.pdf',
         'newPDF': 'widow-current-new-health/original.pdf',
         'oldDOCX': 'receiver-final-health/original.docx',
         'newDOCX': 'widow-current-new-health/original.docx'},
    ])
    return rows


def resolve_path(root, value):
    path = Path(value)
    return path if path.is_absolute() else root/path


def compare_docx(old, new, expected):
    old_raw, new_raw = old.read_bytes(), new.read_bytes()
    result = {'oldSHA256': sha(old_raw), 'newSHA256': sha(new_raw), 'oldBytes': len(old_raw),
              'newBytes': len(new_raw), 'sameAsPreviousDOCX': old_raw == new_raw,
              'expectedNativeInvariant': 'not-requested'}
    if expected is not None:
        original = expected.read_bytes()
        result.update({'expectedNativeSHA256': sha(original), 'exactNativeInputBytesPreserved': new_raw == original,
                       'expectedNativeInvariant': 'pass' if new_raw == original else 'fail'})
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--qa-root', type=Path, default=Path('build/qa'))
    parser.add_argument('--manifest', type=Path, help='Optional JSON array replacing the default 10 pairs. Each row has id, oldPDF, newPDF, oldDOCX, newDOCX, and optional expectedNativeDOCX. Paths relative to qa-root or absolute.')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--poppler', type=Path, default=os.environ.get('PDFTOPPM'))
    parser.add_argument('--write-default-manifest', type=Path, help='Write path-only template and exit; does not inspect candidate inputs.')
    args = parser.parse_args()
    if args.write_default_manifest:
        args.write_default_manifest.write_text(json.dumps(default_manifest(), indent=2)+'\n', encoding='utf-8')
        print(json.dumps({'status': 'manifest-only', 'pairs': len(default_manifest())}))
        return 0
    rows = json.loads(args.manifest.read_text(encoding='utf-8-sig')) if args.manifest else default_manifest()
    logging.getLogger('pypdf').setLevel(logging.CRITICAL)
    report = {'schemaVersion': 1, 'method': 'Read-only actual PDF measurements and optional exact-equality raster comparison; native DOCX preservation checked byte-for-byte.',
              'scriptSHA256': sha(Path(__file__).read_bytes()), 'pairs': [],
              'boundary': 'No original text, personal names, font identities/programs, or page pixels are reported. Changed PDFs require review and are not automatic failures. Missing or unsupported inputs cannot pass. Accurate CEO61458 is not supplied and is not accepted by these other actual manuscripts.'}
    for index, row in enumerate(rows, 1):
        # Labels are caller-controlled identifiers; never copy arbitrary source
        # strings into a report. The numeric pair index remains authoritative.
        label = row.get('id', '')
        label = label if isinstance(label, str) and all(c.isascii() and (c.isalnum() or c in '-_.') for c in label) else 'unlabelled'
        result = {'pairIndex': index, 'id': label}
        try:
            required = {key: resolve_path(args.qa_root, row[key]) for key in ('oldPDF', 'newPDF', 'oldDOCX', 'newDOCX')}
            expected = resolve_path(args.qa_root, row['expectedNativeDOCX']) if row.get('expectedNativeDOCX') else None
            missing = [key for key, path in required.items() if not path.is_file()]
            if expected is not None and not expected.is_file():
                missing.append('expectedNativeDOCX')
            if missing:
                result.update({'status': 'unsupported', 'missingInputKinds': missing})
            else:
                result['docx'] = compare_docx(required['oldDOCX'], required['newDOCX'], expected)
                result['pdf'] = compare_pdf(required['oldPDF'], required['newPDF'], args.poppler)
                result['status'] = 'invariant-failure' if result['docx']['expectedNativeInvariant'] == 'fail' else result['pdf']['status']
        except Exception as error:
            result.update({'status': 'unsupported', 'errorType': type(error).__name__})
        report['pairs'].append(result)
    states = Counter(row['status'] for row in report['pairs'])
    report['counts'] = dict(states)
    report['status'] = 'invariant-failure' if states['invariant-failure'] else 'unsupported' if states['unsupported'] else 'measured-changes' if states['changed'] else 'equal-measurements-pixels-unsupported' if states['equal-measurements-pixels-unsupported'] else 'equal'
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=True, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'status': report['status'], 'pairCount': len(report['pairs']), 'counts': report['counts']}))
    return 1 if report['status'] == 'invariant-failure' else 2 if report['status'] == 'unsupported' else 0


if __name__ == '__main__':
    raise SystemExit(main())
