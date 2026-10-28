package office

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"doc2govpdf/assets"
	"encoding/binary"
	"io"
	"strings"
	"testing"
	"unicode/utf16"
)

func wordIdentityFamilyFixture(t *testing.T, data []byte, family string) []byte {
	t.Helper()
	out := append([]byte(nil), data...)
	var offset, length int
	for i := 0; i < int(binary.BigEndian.Uint16(out[4:6])); i++ {
		p := 12 + i*16
		if string(out[p:p+4]) == "name" {
			offset = int(binary.BigEndian.Uint32(out[p+8:]))
			length = int(binary.BigEndian.Uint32(out[p+12:]))
			break
		}
	}
	if offset == 0 {
		t.Fatal("missing name table")
	}
	encoded := utf16.Encode([]rune(family))
	raw := make([]byte, len(encoded)*2)
	for i, v := range encoded {
		binary.BigEndian.PutUint16(raw[i*2:], v)
	}
	count := int(binary.BigEndian.Uint16(out[offset+2:]))
	stringsAt := int(binary.BigEndian.Uint16(out[offset+4:]))
	changed := 0
	for i := 0; i < count; i++ {
		p := offset + 6 + i*12
		if binary.BigEndian.Uint16(out[p+6:]) != 1 {
			continue
		}
		platform := binary.BigEndian.Uint16(out[p:])
		if platform != 0 && platform != 3 {
			continue
		}
		n := int(binary.BigEndian.Uint16(out[p+8:]))
		at := offset + stringsAt + int(binary.BigEndian.Uint16(out[p+10:]))
		if len(raw) > n || at+len(raw) > offset+length {
			t.Fatal("fixture family too long")
		}
		copy(out[at:], raw)
		binary.BigEndian.PutUint16(out[p+8:], uint16(len(raw)))
		changed++
	}
	if changed == 0 {
		t.Fatal("no legacy family records")
	}
	return out
}

func wordIdentityParts(t *testing.T, data []byte) map[string][]byte {
	t.Helper()
	z, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatal(err)
	}
	parts := map[string][]byte{}
	for _, file := range z.File {
		r, e := file.Open()
		if e != nil {
			t.Fatal(e)
		}
		parts[file.Name], e = io.ReadAll(r)
		r.Close()
		if e != nil {
			t.Fatal(e)
		}
	}
	return parts
}

func TestWordRealLegacyFamilyMapsExistingFourSlotsWithoutEmbeddingSelectedNoto(t *testing.T) {
	browserFontState(t)
	if err := RegisterFont("仿宋", assets.FallbackBlackFont); err != nil {
		t.Fatal(err)
	}
	family, ok := legacyWordFamily("仿宋")
	if !ok || family != "Noto Serif SC Black" {
		t.Fatal(family, ok)
	}
	parts := map[string]string{"word/document.xml": `<w:document xmlns:w="` + W + `"><w:r><w:rPr><w:rFonts w:ascii="仿宋" w:hAnsi="仿宋" w:eastAsia="仿宋" w:cs="仿宋"/></w:rPr></w:r></w:document>`}
	files, embeddingErr := addFallbackFonts(parts)
	if embeddingErr != nil {
		t.Fatal(embeddingErr)
	}
	if len(files) != 0 {
		t.Fatal("selected Noto name was mistaken for fallback provenance")
	}
	d, e := parseXML([]byte(parts["word/document.xml"]))
	if e != nil {
		t.Fatal(e)
	}
	for _, font := range d.FindElements("//w:rFonts") {
		for _, key := range []string{"ascii", "hAnsi", "eastAsia", "cs"} {
			if attr(font, key) != family {
				t.Fatal(key, attr(font, key))
			}
		}
	}
}

func TestWordTrueFamilyRoundTripReusesRegisteredFaceAheadOfBuiltinName(t *testing.T) {
	browserFontState(t)
	if err := RegisterFont("仿宋", assets.FallbackBlackFont); err != nil {
		t.Fatal(err)
	}
	for _, role := range documentFontRoles {
		if role != "仿宋" {
			if err := AliasRegisteredFont(role, "仿宋"); err != nil {
				t.Fatal(err)
			}
		}
	}
	m, e := NewDocument(Fields{Kind: "plain", Title: "字族声明核对", Body: "原文字词与数字12.50不变。"})
	if e != nil {
		t.Fatal(e)
	}
	before := m.Clone()
	doc, e := CreateDOCX(m)
	if e != nil {
		t.Fatal(e)
	}
	if m.Text() != before.Text() || m.Blocks[1].Paragraph.Font != "仿宋" {
		t.Fatal("role or text mutated")
	}
	for name, data := range wordIdentityParts(t, doc) {
		if strings.HasPrefix(name, "word/fonts/") {
			t.Fatal("selected bytes entered DOCX", name)
		}
		if strings.HasSuffix(name, ".xml") && name != "[Content_Types].xml" {
			d, e := parseXML(data)
			if e != nil {
				t.Fatal(e)
			}
			for _, font := range d.FindElements("//w:rFonts") {
				for _, key := range []string{"ascii", "hAnsi", "eastAsia", "cs"} {
					if got := attr(font, key); got != "" && got != "Noto Serif SC Black" {
						t.Fatal(name, key, got)
					}
				}
			}
		}
	}
	selected, matched, ambiguous := registeredWordFamily("Noto Serif SC Black")
	if !matched || ambiguous || selected.name != "仿宋" {
		t.Fatal(matched, ambiguous, selected.name)
	}
	if resolveFont("Noto Serif SC Black").name != "仿宋" {
		t.Fatal("builtin key shadowed selected true family")
	}
	opened, e := Open(doc)
	if e != nil {
		t.Fatal(e)
	}
	if needs := RequiredFallbackFonts(opened.Model, false); len(needs) != 0 {
		t.Fatal("roundtrip unnecessarily requested fallback", needs)
	}
	if _, e := RenderPDF(context.Background(), opened.Model); e != nil {
		t.Fatal(e)
	}
	same, e := opened.Export(opened.Model, false)
	if e != nil {
		t.Fatal(e)
	}
	if !bytes.Equal(same, doc) {
		t.Fatal("unmodified source Word was rewritten")
	}
}

func TestWordFamilyKeywordUniqueAndAmbiguousPathsDoNotFallThroughRoleHeuristics(t *testing.T) {
	browserFontState(t)
	regular := wordIdentityFamilyFixture(t, assets.FallbackFont, "家族仿宋")
	black := wordIdentityFamilyFixture(t, assets.FallbackBlackFont, "家族仿宋")
	if err := RegisterFont("楷体", regular); err != nil {
		t.Fatal(err)
	}
	if resolveFont("家族仿宋").name != "楷体" {
		t.Fatal("family keyword selected wrong purpose")
	}
	if err := RegisterFont("黑体", black); err != nil {
		t.Fatal(err)
	}
	_, match, ambiguous := registeredWordFamily("家族仿宋")
	if match || !ambiguous {
		t.Fatal("different faces were chosen arbitrarily")
	}
	if resolveFont("家族仿宋").name != "Noto Serif SC" {
		t.Fatal("ambiguous family fell through role heuristic")
	}
	name, _, embed := wordFontDeclaration("家族仿宋")
	if name != "家族仿宋" || embed {
		t.Fatal("ambiguous declaration was fabricated")
	}
	loadCoreTestFonts(t)
	m, e := NewDocument(Fields{Kind: "plain", Title: "字体核对", Body: "正文。"})
	if e != nil {
		t.Fatal(e)
	}
	m.Blocks[1].Paragraph.Font = "家族仿宋"
	pdf, e := RenderPDF(context.Background(), m)
	if e != nil {
		t.Fatal(e)
	}
	if !strings.Contains(strings.Join(pdf.Warnings, " "), "多个不同字体面") {
		t.Fatal("ambiguity was not disclosed", pdf.Warnings)
	}
}

func TestWordExplicitPurposeAndUnknownSafeNamesRemainIndependent(t *testing.T) {
	browserFontState(t)
	if err := RegisterFont("宋体", assets.FallbackFont); err != nil {
		t.Fatal(err)
	}
	if err := RegisterFont("仿宋", wordIdentityFamilyFixture(t, assets.FallbackBlackFont, "宋体")); err != nil {
		t.Fatal(err)
	}
	if resolveFont("宋体").name != "宋体" {
		t.Fatal("explicit role overridden by a family collision")
	}
	for _, name := range []string{"Unknown & Family", "Unknown 仿宋 Family"} {
		got, _, embed := wordFontDeclaration(name)
		if got != name || embed {
			t.Fatal("unknown name replaced or falsely embedded", name, got, embed)
		}
	}
	for _, name := range []string{"", " ", "Unsafe\x01Family", "Bad\nName", strings.Repeat("a", 301)} {
		if safeWordFamily(name) {
			t.Fatal("unsafe identity accepted")
		}
	}
}

func TestWordSelectedSameNameNeverLeaksItsBytesThroughBundledEmbedding(t *testing.T) {
	browserFontState(t)
	loadCoreTestFonts(t)
	if err := RegisterFallbackFont("Noto Serif SC Black", assets.FallbackBlackFont, true); err != nil {
		t.Fatal(err)
	}
	selected := append(append([]byte(nil), assets.FallbackBlackFont...), []byte("selected-private-marker")...)
	if err := RegisterFont("仿宋", selected); err != nil {
		t.Fatal(err)
	}
	parts := map[string]string{"word/document.xml": `<w:document xmlns:w="` + W + `"><w:rFonts w:eastAsia="仿宋"/><w:rFonts w:eastAsia="黑体"/></w:document>`, "word/settings.xml": `<w:settings xmlns:w="` + W + `"></w:settings>`, "[Content_Types].xml": `<Types></Types>`, "word/_rels/document.xml.rels": `<Relationships></Relationships>`}
	files, embeddingErr := addFallbackFonts(parts)
	if embeddingErr != nil {
		t.Fatal(embeddingErr)
	}
	if len(files) != 1 {
		t.Fatal("expected only the needed bundled face", len(files))
	}
	derived, err := prepareWordFallbackEmbedding(fontData{"Noto Serif SC Black", assets.FallbackBlackFont})
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(derived.data)
	for name, data := range files {
		decoded := append([]byte(nil), data...)
		for i := 0; i < 32; i++ {
			decoded[i] ^= sum[15-i%16]
		}
		if !bytes.Equal(decoded, derived.data) {
			t.Fatal("non-bundled bytes embedded", name)
		}
		if bytes.Contains(data, []byte("selected-private-marker")) {
			t.Fatal("selected payload leaked")
		}
	}
	// Same family names can still be affected by receiver installation/embedded
	// fallback precedence. This declaration contract does not promise exact faces.
}

func TestWordBundledFallbackStillEmbedsAndSelectedFamilyNamesRemainEscaped(t *testing.T) {
	browserFontState(t)
	if err := RegisterFallbackFont("Noto Serif SC", assets.FallbackFont, true); err != nil {
		t.Fatal(err)
	}
	if err := RegisterFallbackFont("Noto Serif SC Black", assets.FallbackBlackFont, true); err != nil {
		t.Fatal(err)
	}
	parts := map[string]string{"word/document.xml": `<w:document xmlns:w="` + W + `"><w:rFonts w:eastAsia="仿宋"/><w:rFonts w:eastAsia="黑体"/></w:document>`, "word/settings.xml": `<w:settings xmlns:w="` + W + `"></w:settings>`, "[Content_Types].xml": `<Types></Types>`, "word/_rels/document.xml.rels": `<Relationships></Relationships>`}
	if files, err := addFallbackFonts(parts); err != nil || len(files) != 2 {
		t.Fatal("bundled fallback embedding stopped")
	}
	family := `A & "B<`
	if err := RegisterFont("仿宋", wordIdentityFamilyFixture(t, assets.FallbackFont, family)); err != nil {
		t.Fatal(err)
	}
	selected := map[string]string{"word/document.xml": `<w:document xmlns:w="` + W + `"><w:rFonts w:eastAsia="仿宋"/></w:document>`}
	if files, err := addFallbackFonts(selected); err != nil || len(files) != 0 {
		t.Fatal("selected family name changed provenance")
	}
	d, e := parseXML([]byte(selected["word/document.xml"]))
	if e != nil {
		t.Fatal(e)
	}
	if got := attr(d.FindElement("//w:rFonts"), "eastAsia"); got != family {
		t.Fatal("family escaping changed identity", got)
	}
}
