package office

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"unicode"

	"doc2govpdf/assets"
	readpdf "github.com/ledongthuc/pdf"
	"golang.org/x/image/font/gofont/goregular"
	"golang.org/x/image/font/sfnt"
	"golang.org/x/image/math/fixed"
)

// Go Regular is distributed under the Go font license. This diagnostic copy
// changes only its Unicode coverage, never the installed/source font or text.
// Keep A mapped to its original outline; em dash and all digits are absent.
func footerOnlyAFont(t *testing.T) []byte {
	t.Helper()
	source := goregular.TTF
	original := append([]byte(nil), source...)
	face, e := sfnt.Parse(source)
	if e != nil {
		t.Fatal(e)
	}
	gid, e := face.GlyphIndex(nil, 'A')
	if e != nil || gid == 0 {
		t.Fatal("Go Regular A absent", e)
	}
	data := append([]byte(nil), source...)
	tables, e := pdfSubsetTables(data)
	if e != nil {
		t.Fatal(e)
	}
	cmap := tables["cmap"]
	if cmap.size < 44 {
		t.Fatal("cmap allocation too small")
	}
	clear(data[cmap.offset : cmap.offset+cmap.size])
	raw := data[cmap.offset : cmap.offset+44]
	binary.BigEndian.PutUint16(raw[2:], 1)
	binary.BigEndian.PutUint16(raw[4:], 3)
	binary.BigEndian.PutUint16(raw[6:], 1)
	binary.BigEndian.PutUint32(raw[8:], 12)
	sub := raw[12:]
	for at, v := range map[int]uint16{0: 4, 2: 32, 6: 4, 8: 4, 10: 1, 14: 'A', 16: 0xffff, 20: 'A', 22: 0xffff, 24: uint16(gid) - 'A', 26: 1} {
		binary.BigEndian.PutUint16(sub[at:], v)
	}
	binary.BigEndian.PutUint32(data[cmap.record+12:], 44)
	testSubsetResum(t, data)
	if _, e = pdfSubsetTables(data); e != nil || pdfSubsetChecksum(data) != 0xb1b0afba {
		t.Fatal("fixture SFNT checksum invalid", e)
	}
	reduced, e := sfnt.Parse(data)
	if e != nil {
		t.Fatal(e)
	}
	for _, r := range "A—0123456789" {
		g, e := reduced.GlyphIndex(nil, r)
		if e != nil || (r == 'A' && g != gid) || (r != 'A' && g != 0) {
			t.Fatal("fixture coverage wrong", e)
		}
	}
	if !bytes.Equal(original, goregular.TTF) {
		t.Fatal("source font changed")
	}
	return data
}

func footerFontState(t *testing.T, selected []byte) {
	t.Helper()
	browserFontState(t)
	for name, data := range map[string][]byte{"Noto Serif SC": assets.FallbackFont, "Noto Serif SC Black": assets.FallbackBlackFont} {
		if e := RegisterFallbackFont(name, data, true); e != nil {
			t.Fatal(e)
		}
	}
	if e := RegisterFont("宋体", selected); e != nil {
		t.Fatal(e)
	}
}
func footerPDFStream(t *testing.T, v readpdf.Value) []byte {
	t.Helper()
	r := v.Reader()
	defer r.Close()
	data, e := io.ReadAll(r)
	if e != nil {
		t.Fatal(e)
	}
	return data
}

// Validate the font referenced by actual footer text, then its actual encoded
// CID->GID outlines. A ToUnicode string or font label alone cannot pass this.
func footerPDFGlyphs(t *testing.T, data, expected []byte, bottom float64) (int, int) {
	t.Helper()
	reader, e := readpdf.NewReader(bytes.NewReader(data), int64(len(data)))
	if e != nil {
		t.Fatal(e)
	}
	source, e := sfnt.Parse(expected)
	if e != nil {
		t.Fatal(e)
	}
	expectedFamily, e := source.Name(nil, sfnt.NameIDFamily)
	if e != nil {
		t.Fatal(e)
	}
	count := 0
	for number := 1; number <= reader.NumPage(); number++ {
		page := reader.Page(number)
		var text strings.Builder
		seen := 0
		for _, run := range page.Content().Text {
			if run.Y >= bottom*72/25.4 {
				continue
			}
			if run.FontSize != 14 {
				t.Fatal("footer is not 14pt", run.FontSize)
			}
			text.WriteString(run.S)
			var actual readpdf.Font
			found := false
			for _, name := range page.Fonts() {
				f := page.Font(name)
				if f.BaseFont() == run.Font {
					actual = f
					found = true
					break
				}
			}
			if !found {
				t.Fatal("actual footer font resource absent")
			}
			descendant := actual.V.Key("DescendantFonts").Index(0)
			program := footerPDFStream(t, descendant.Key("FontDescriptor").Key("FontFile2"))
			embedded, e := sfnt.Parse(program)
			if e != nil {
				t.Fatal(e)
			}
			family, e := embedded.Name(nil, sfnt.NameIDFamily)
			if e != nil {
				t.Fatal(e)
			}
			cidMap := descendant.Key("CIDToGIDMap")
			var mapping []byte
			if cidMap.Kind() == readpdf.Stream {
				mapping = footerPDFStream(t, cidMap)
			} else if cidMap.Name() != "Identity" {
				t.Fatal("unsupported CID map")
			}
			for _, r := range run.S {
				if unicode.IsSpace(r) {
					continue
				}
				if r != '—' && (r < '0' || r > '9') {
					t.Fatal("unexpected text below body; not a footer")
				}
				code := []byte{byte(r >> 8), byte(r)}
				if decoded := actual.Encoder().Decode(string(code)); decoded != string(r) {
					t.Fatal("actual CID encoding not verified", fmt.Sprintf("U+%04X", r))
				}
				glyph := sfnt.GlyphIndex(r)
				if mapping != nil {
					at := int(r) * 2
					if at+2 > len(mapping) {
						t.Fatal("footer CID out of map")
					}
					glyph = sfnt.GlyphIndex(binary.BigEndian.Uint16(mapping[at:]))
				}
				original, e := source.GlyphIndex(nil, r)
				if e != nil || original == 0 || glyph == 0 {
					t.Fatal("footer encoded glyph missing", fmt.Sprintf("U+%04X", r), glyph, e)
				}
				if family != expectedFamily {
					t.Fatal("actual footer font differs from expected source", family, expectedFamily)
				}
				got, e := embedded.LoadGlyph(nil, glyph, fixed.I(1000), nil)
				if e != nil {
					t.Fatal(e)
				}
				want, e := source.LoadGlyph(nil, original, fixed.I(1000), nil)
				if e != nil || len(got) == 0 || !reflect.DeepEqual(got, want) {
					t.Fatal("actual footer glyph outline differs from its source", fmt.Sprintf("U+%04X", r), e)
				}
				count++
				seen++
			}
		}
		if strings.ReplaceAll(text.String(), " ", "") != "—"+fmt.Sprint(number)+"—" || seen < 3 {
			t.Fatal("actual page-number text missing or wrong", number, seen)
		}
	}
	return reader.NumPage(), count
}

func TestFooterFontCoverageFixtureIsOwnedAndValid(t *testing.T) {
	data := footerOnlyAFont(t)
	if !embeddingAllowed(data) {
		t.Fatal("public font fixture cannot be embedded")
	}
	if out := os.Getenv("FOOTER_FIXTURE_OUT"); out != "" {
		if e := os.MkdirAll(out, 0700); e != nil {
			t.Fatal(e)
		}
		if e := os.WriteFile(filepath.Join(out, "go-regular-only-A.ttf"), data, 0600); e != nil {
			t.Fatal(e)
		}
		sourceSHA, fixtureSHA := sha256.Sum256(goregular.TTF), sha256.Sum256(data)
		report, _ := json.MarshalIndent(map[string]any{"mechanismOnly": true, "source": "golang.org/x/image/font/gofont/goregular.TTF (Go font license)", "sourceSHA256": hex.EncodeToString(sourceSHA[:]), "fixtureSHA256": hex.EncodeToString(fixtureSHA[:]), "coverage": "A only; no em dash or digits", "sourceBytesUnchanged": true, "sfntChecksumsValid": true}, "", "  ")
		if e := os.WriteFile(filepath.Join(out, "fixture.json"), report, 0600); e != nil {
			t.Fatal(e)
		}
	}
}
func TestFooterFontCoverageUsesActualPageNumberText(t *testing.T) {
	footerFontState(t, footerOnlyAFont(t))
	m := Model{Page: DefaultPage(), SourceID: "font-mechanism-only", Blocks: []Block{{Paragraph: &Paragraph{ID: "a", Text: "A", Role: "body", Font: "宋体", Size: 16, Line: 10}}}}
	before, _ := json.Marshal(m)
	result, e := RenderPDF(context.Background(), m)
	if e != nil {
		t.Fatal(e)
	}
	pages, glyphs := footerPDFGlyphs(t, result.Data, assets.FallbackFont, m.Page.Bottom)
	reason := false
	for _, warning := range result.Warnings {
		if strings.Contains(warning, "缺少字符") && strings.Contains(warning, "页码") {
			reason = true
		}
		if strings.Contains(warning, "未取得可用字体“宋体”") {
			t.Fatal("registered face misreported as unavailable")
		}
	}
	if !reason {
		t.Fatal("missing footer glyph reason not reported")
	}
	after, _ := json.Marshal(m)
	if !bytes.Equal(before, after) {
		t.Fatal("author model changed")
	}
	t.Logf("actual footer: %d pages, %d nonempty CID outlines match fallback source, 14pt", pages, glyphs)
}
func TestFooterFontCoverageCompleteSelectedFaceKeepsItsActualGlyphs(t *testing.T) {
	footerFontState(t, goregular.TTF)
	m := Model{Page: DefaultPage(), Blocks: []Block{{Paragraph: &Paragraph{ID: "a", Text: "A", Font: "宋体", Size: 16, Line: 10}}}}
	result, e := RenderPDF(context.Background(), m)
	if e != nil {
		t.Fatal(e)
	}
	footerPDFGlyphs(t, result.Data, goregular.TTF, m.Page.Bottom)
	for _, warning := range result.Warnings {
		if strings.Contains(warning, "页码") && strings.Contains(warning, "缺少字符") {
			t.Fatal("complete selected face falsely fell back")
		}
	}
}

// This optional acceptance uses an existing actual exported DOCX plus the
// supplied original JSON. No business sample or manuscript text is in this test.
func TestFooterFontCoverageSuppliedOriginalTask(t *testing.T) {
	docx, sourcePath := os.Getenv("FOOTER_REAL_DOCX"), os.Getenv("FOOTER_REAL_SOURCE")
	if docx == "" || sourcePath == "" {
		t.Skip("set FOOTER_REAL_DOCX and FOOTER_REAL_SOURCE to existing local original-task files")
	}
	original, e := os.ReadFile(sourcePath)
	if e != nil {
		t.Fatal(e)
	}
	sum := sha256.Sum256(original)
	if hex.EncodeToString(sum[:]) != "7dbde2fe81d11c526d8fb73ab143f572e3481500575fb9c0b87b126b9e37972c" {
		t.Fatal("not the supplied original health draft")
	}
	word, e := os.ReadFile(docx)
	if e != nil {
		t.Fatal(e)
	}
	footerFontState(t, footerOnlyAFont(t))
	pkg, e := Open(word)
	if e != nil {
		t.Fatal(e)
	}
	// Bind this Word task to the supplied draft's actual structured text,
	// not merely to a source filename/hash supplied beside an unrelated file.
	var draft struct {
		Fields  map[string]any `json:"fields"`
		Content any            `json:"content"`
	}
	if e = json.Unmarshal(original, &draft); e != nil {
		t.Fatal(e)
	}
	// Generated title fitting may add soft breaks; compare all original
	// non-break characters without trimming spaces or changing any facts.
	withoutBreaks := func(text string) string { return strings.NewReplacer("\r", "", "\n", "").Replace(text) }
	modelText := withoutBreaks(pkg.Model.Text())
	if title, ok := draft.Fields["title"].(string); !ok || title == "" || !strings.Contains(modelText, withoutBreaks(title)) {
		t.Fatal("Word is not the supplied draft title")
	}
	checkedText := 0
	var checkText func(any)
	checkText = func(value any) {
		switch v := value.(type) {
		case map[string]any:
			for key, item := range v {
				if key == "text" || key == "caption" {
					if text, ok := item.(string); ok && text != "" {
						if !strings.Contains(modelText, withoutBreaks(text)) {
							t.Fatal("Word is missing supplied structured text; original task identity mismatch")
						}
						checkedText++
					}
				}
				checkText(item)
			}
		case []any:
			for _, item := range v {
				checkText(item)
			}
		}
	}
	checkText(draft.Content)
	if checkedText == 0 {
		t.Fatal("supplied structured text absent")
	}
	before, _ := json.Marshal(pkg.Model)
	result, e := RenderPDF(context.Background(), pkg.Model)
	if e != nil {
		t.Fatal(e)
	}
	pages, glyphs := footerPDFGlyphs(t, result.Data, assets.FallbackFont, pkg.Model.Page.Bottom)
	same, e := pkg.Export(pkg.Model, false)
	if e != nil || !bytes.Equal(word, same) {
		t.Fatal("original Word bytes changed", e)
	}
	after, _ := json.Marshal(pkg.Model)
	if !bytes.Equal(before, after) {
		t.Fatal("original task model changed")
	}
	if out := os.Getenv("FOOTER_REAL_OUT"); out != "" {
		if e = os.MkdirAll(out, 0700); e != nil {
			t.Fatal(e)
		}
		if e = os.WriteFile(filepath.Join(out, "original-footer.pdf"), result.Data, 0600); e != nil {
			t.Fatal(e)
		}
		inputSHA := sha256.Sum256(word)
		outputSHA := sha256.Sum256(result.Data)
		report, _ := json.MarshalIndent(map[string]any{"sourceSHA256": hex.EncodeToString(sum[:]), "docxSHA256": hex.EncodeToString(inputSHA[:]), "pdfSHA256": hex.EncodeToString(outputSHA[:]), "pages": pages, "matchedFooterGlyphs": glyphs, "footerSizePt": 14, "sourceWordByteExact": true, "authorModelUnchanged": true, "mechanismFontOnly": true, "sourceStructuredTextsVerified": checkedText}, "", "  ")
		if e = os.WriteFile(filepath.Join(out, "report.json"), report, 0600); e != nil {
			t.Fatal(e)
		}
	}
	t.Logf("supplied original unchanged: %d pages, %d actual footer glyphs match fallback at 14pt", pages, glyphs)
}
