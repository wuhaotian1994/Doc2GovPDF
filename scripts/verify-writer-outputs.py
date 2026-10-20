"""Independently parse actual cross-browser downloads and retain the QA summary."""
import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree
from pypdf import PdfReader

parser = argparse.ArgumentParser()
parser.add_argument("--rerun", help="Optional targeted rerun result that replaces matching profiles")
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
folder = root / "build/qa/returning"
cases = json.loads((folder / "matrix.json").read_text(encoding="utf-8"))
if args.rerun:
    updates = json.loads((folder / args.rerun).read_text(encoding="utf-8"))
    by_name = {case["profile"]: case for case in cases}
    by_name.update({case["profile"]: case for case in updates})
    cases = list(by_name.values())
expected = {"chrome-desktop", "edge-desktop", "firefox-desktop", "webkit-desktop",
            "android-emulated", "iphone-emulated", "ipad-emulated"}
assert {case["profile"] for case in cases} == expected
assert all(case["passed"] for case in cases), "A browser case has not passed"
reference_text = reference_xml = reference_txt = None
outputs = []
for case in cases:
    path = folder / case["profile"]
    pdf = next(p for p in path.glob("*.pdf") if not p.name.endswith(".word.pdf"))
    docx = next(path.glob("*.docx"))
    txt = next(path.glob("*.txt"))
    reader = PdfReader(pdf)
    assert len(reader.pages) == 1
    text = "\n".join(page.extract_text() for page in reader.pages)
    with ZipFile(docx) as package:
        assert package.testzip() is None
        xml = package.read("word/document.xml")
        ElementTree.fromstring(xml)
    plain = txt.read_text(encoding="utf-8-sig")
    assert "为做好资料整理工作" in text and "综合办公室" in text
    if reference_text is None:
        reference_text, reference_xml, reference_txt = text, xml, plain
    assert text == reference_text, f"PDF text differs in {case['profile']}"
    assert xml == reference_xml, f"DOCX document differs in {case['profile']}"
    assert plain == reference_txt, f"TXT differs in {case['profile']}"
    outputs.append({"profile": case["profile"], "pages": 1, "pdfTextCharacters": len(text),
                    "docxDocumentSHA256": hashlib.sha256(xml).hexdigest(),
                    "pdf": str(pdf.relative_to(root)), "docx": str(docx.relative_to(root))})
source_files = ["write.html", "write.css", "write.js", "write-model.js",
                "write-library.js", "write-engine.js"]
hashes = {}
for name in source_files:
    source = (root / "web" / name).read_bytes()
    built = (root / "build/qa/returning-web" / name).read_bytes()
    assert source == built, f"QA build is stale: {name}"
    hashes[name] = hashlib.sha256(source).hexdigest()
summary = {"passed": True, "checks": sum(len(case["checks"]) for case in cases),
           "profiles": cases, "outputs": outputs, "sourceHashes": hashes,
           "physicalDevicesTested": False,
           "evidence": ["matrix.json"] + ([args.rerun] if args.rerun else [])}
(folder / "verified-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"PASS: {len(cases)} configurations, {summary['checks']} checks; "
      "all actual PDF texts, DOCX document XML, and TXT outputs agree.")
