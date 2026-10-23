#!/usr/bin/env python3
"""Compare actual PDFs across a font-container-only repair, without text output.

Usage: python compare-pdf-subset-repair.py OLD NEW OUT_DIR --poppler PATH
All rendered pages stay in OUT_DIR. The JSON report contains hashes/counts only.
This comparison does not certify font-container validity; use the independent
verify-pdf-subset-fonts.py validator as well.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import struct
import subprocess
import pdfplumber
from pypdf import PdfReader
from PIL import Image, ImageChops


def sha(data):
    return hashlib.sha256(data).hexdigest()


def tables(data):
    count = struct.unpack_from('>H', data, 4)[0]
    result = {}
    for index in range(count):
        tag, _, offset, length = struct.unpack_from('>4sIII', data, 12 + 16 * index)
        assert offset + length <= len(data), 'SFNT table boundary'
        value = data[offset:offset+length]
        if tag == b'head':
            value = value[:8] + b'\0'*4 + value[12:]
        if tag != b'cmap':
            result[tag.decode('ascii')] = sha(value)
    return result


def resolved(value):
    return value.get_object() if hasattr(value, 'get_object') else value


def font_records(reader):
    result = {}
    for page in reader.pages:
        fonts = resolved(resolved(page['/Resources']).get('/Font', {}))
        for name, ref in fonts.items():
            font = resolved(ref)
            descendant = resolved(font['/DescendantFonts'][0]) if '/DescendantFonts' in font else font
            descriptor = resolved(descendant.get('/FontDescriptor', {}))
            if '/FontFile2' not in descriptor:
                continue
            program = resolved(descriptor['/FontFile2']).get_data()
            record = {'nonCmapTables': tables(program)}
            for key in ['/ToUnicode']:
                if key in font:
                    record[key] = sha(resolved(font[key]).get_data())
            for key in ['/CIDToGIDMap']:
                if key in descendant:
                    obj = resolved(descendant[key])
                    record[key] = sha(obj.get_data()) if hasattr(obj, 'get_data') else str(obj)
            for key in ['/W', '/DW', '/Widths', '/FirstChar', '/LastChar']:
                if key in descendant:
                    record[key] = str(resolved(descendant[key]))
            if str(name) in result:
                assert result[str(name)] == record, 'Resource font identity changes between pages'
            result[str(name)] = record
    return result


def geometry(path):
    result = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            records = [[c['text'], *[round(float(c[k]), 5) for k in ['x0', 'x1', 'top', 'bottom', 'size']], c.get('fontname')] for c in page.chars]
            result.append({'characters': len(records), 'characterGeometrySHA256': sha(json.dumps(records, ensure_ascii=False, separators=(',', ':')).encode())})
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('old', type=Path)
    parser.add_argument('new', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--poppler', required=True, type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    old, new = PdfReader(args.old), PdfReader(args.new)
    report = {'method': 'All decoded page content streams, actual character geometry, PDF Unicode/CID maps, non-cmap font tables and Poppler pixels; no manuscript strings emitted', 'oldSHA256': sha(args.old.read_bytes()), 'newSHA256': sha(args.new.read_bytes()), 'oldPages': len(old.pages), 'newPages': len(new.pages), 'checks': {}, 'pixelPages': [], 'boundary': 'Equality to the old output is a regression check, not proof of layout correctness or a valid font container. Raw task pages remain local.'}
    try:
        assert len(old.pages) == len(new.pages), 'Page count changed'
        checks = report['checks']
        checks['decodedPageContentEqual'] = all(a.get_contents().get_data() == b.get_contents().get_data() for a,b in zip(old.pages,new.pages))
        checks['pageBoxesEqual'] = all(a.mediabox == b.mediabox and a.cropbox == b.cropbox for a,b in zip(old.pages,new.pages))
        before, after = font_records(old), font_records(new)
        checks['fontResourcesAndNonCmapTablesEqual'] = before == after
        report['fontResourceCount'] = len(before)
        g1, g2 = geometry(args.old), geometry(args.new)
        checks['characterTextAndGeometryEqual'] = g1 == g2
        report['geometry'] = g2
        for label, path in [('old', args.old), ('new', args.new)]:
            subprocess.run([str(args.poppler), '-png', '-r', '96', str(path), str(args.output/label)], check=True, capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        for index in range(1, len(old.pages)+1):
            with Image.open(args.output/f'old-{index}.png') as a, Image.open(args.output/f'new-{index}.png') as b:
                a,b = a.convert('RGB'),b.convert('RGB')
                assert a.size == b.size, 'Rendered page size changed'
                diff = ImageChops.difference(a,b)
                report['pixelPages'].append({'page': index, 'width': a.width, 'height': a.height, 'equal': diff.getbbox() is None, 'oldPixelSHA256': sha(a.tobytes()), 'newPixelSHA256': sha(b.tobytes())})
        checks['allRenderedPixelsEqual'] = all(p['equal'] for p in report['pixelPages'])
        assert all(checks.values()), 'Font repair changed document content, geometry, a non-cmap font table, or rendered pixels'
        report['passed'] = True
    except Exception as error:
        report['passed'] = False
        report['failure'] = str(error)
        raise
    finally:
        (args.output/'comparison.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'passed': True, 'pages': report['newPages'], 'fonts': report['fontResourceCount'], 'report': str(args.output/'comparison.json')}))


if __name__ == '__main__':
    main()
