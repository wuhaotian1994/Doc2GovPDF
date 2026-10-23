# Browser fallback fonts

These OFL Noto Serif SC Regular/Black subsets retain 4,510 existing characters,
including GB2312 level-one Chinese and common Latin/punctuation. The source
copyright and license remain in `../OFL.txt`. They are fallback faces, not
standards-compliant substitutes for the named Chinese document roles.

Regenerate with FontTools 4.60.1 and `python scripts/build-web-core-fonts.py`.
The script verifies source SHA256 and every retained glyph outline and horizontal
metric. Normal builds use these committed files; Python is not a build dependency.

The browser downloads a core face only when needed. A character outside coverage
loads the complete original of that same face. Newly generated editable Word
files require complete fallback faces; a common-character subset must never be
embedded as if it supported arbitrary later editing. User-selected fonts that
cover the document avoid fallback downloads. Those selected fonts remain local.
