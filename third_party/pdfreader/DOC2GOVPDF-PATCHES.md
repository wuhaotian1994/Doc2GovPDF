# Local compatibility patches

Source: github.com/ledongthuc/pdf, revision 6c8c28e0e8a0 (2026-09-07), BSD-3-Clause. Production Go files, original module declaration and license are preserved. This is a local module replacement; user documents are not sent upstream.

Changes in page.go:

- CMap `bfrange` offsets use the complete big-endian source code and carry through every destination byte. The original only incremented the final byte, turning identity-mapped Chinese characters into Latin bytes.
- CID font widths read `DescendantFonts/W` and `DW`.
- Type0 glyph advances consume two-byte character codes, instead of treating each decoded CJK rune as one raw byte.
- Decoded streams are capped at 64 MiB and predictor rows at 1 MiB. User-file parsing also runs in a separate hidden process with a 20-second deadline.

Regression evidence: `internal/office/pdf_inspection_test.go` uses generated CJK PDFs, intentionally substitutes the title font, and reads all seven upstream sample PDFs. A failed font fallback negative case exposed the CMap issue before delivery.
