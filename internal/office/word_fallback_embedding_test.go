package office

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"strings"
	"testing"

	"doc2govpdf/assets"
	"golang.org/x/image/font/sfnt"
)

func fallbackTestTables(t *testing.T, data []byte) map[string][]byte {
	t.Helper()
	out := map[string][]byte{}
	for i := 0; i < int(binary.BigEndian.Uint16(data[4:6])); i++ {
		r := data[12+i*16:]
		at, n := int(binary.BigEndian.Uint32(r[8:])), int(binary.BigEndian.Uint32(r[12:]))
		out[string(r[:4])] = data[at : at+n]
		checked := append([]byte(nil), data[at:at+n]...)
		if string(r[:4]) == "head" {
			binary.BigEndian.PutUint32(checked[8:], 0)
		}
		if wordFontChecksum(checked) != binary.BigEndian.Uint32(r[4:]) {
			t.Fatal("table checksum", string(r[:4]))
		}
	}
	return out
}

func fallbackTestNameRecords(t *testing.T, data []byte) map[string][]byte {
	t.Helper()
	names := fallbackTestTables(t, data)["name"]
	start := int(binary.BigEndian.Uint16(names[4:]))
	out := map[string][]byte{}
	for i := 0; i < int(binary.BigEndian.Uint16(names[2:])); i++ {
		r := names[6+i*12:]
		n, off := int(binary.BigEndian.Uint16(r[8:])), int(binary.BigEndian.Uint16(r[10:]))
		key := fmt.Sprintf("%d/%d/%d/%d", binary.BigEndian.Uint16(r), binary.BigEndian.Uint16(r[2:]), binary.BigEndian.Uint16(r[4:]), binary.BigEndian.Uint16(r[6:]))
		out[key] = names[start+off : start+off+n]
	}
	return out
}

func loadFullFallbackTestFonts(t *testing.T) {
	t.Helper()
	browserFontState(t)
	for name, data := range map[string][]byte{"Noto Serif SC": assets.FallbackFont, "Noto Serif SC Black": assets.FallbackBlackFont} {
		if err := RegisterFallbackFont(name, data, true); err != nil {
			t.Fatal(err)
		}
	}
}

func TestWordFallbackDerivedNamesKeepEveryOutlineAndLicenceRecord(t *testing.T) {
	identity := sha256.Sum256([]byte(wordFallbackRegularSHA + "\n" + wordFallbackBlackSHA))
	if !strings.HasSuffix(wordFallbackFamily, fmt.Sprintf("%x", identity)[:5]) {
		t.Fatal("family cache identity is stale")
	}
	for name, source := range map[string][]byte{"Noto Serif SC": assets.FallbackFont, "Noto Serif SC Black": assets.FallbackBlackFont} {
		t.Run(name, func(t *testing.T) {
			before := sha256.Sum256(source)
			got, err := prepareWordFallbackEmbedding(fontData{name, source})
			if err != nil {
				t.Fatal(err)
			}
			if before != sha256.Sum256(source) || &source[0] == &got.data[0] {
				t.Fatal("source changed or aliased")
			}
			if len(got.name) >= 32 || !strings.HasPrefix(got.name, wordFallbackFamily) {
				t.Fatal(got.name)
			}
			if wordFontChecksum(got.data) != 0xb1b0afba {
				t.Fatal("whole font checksum")
			}
			oldTables, newTables := fallbackTestTables(t, source), fallbackTestTables(t, got.data)
			if len(oldTables) != len(newTables) {
				t.Fatal("tables added/removed")
			}
			for tag, raw := range oldTables {
				if tag == "name" {
					continue
				}
				other := newTables[tag]
				if tag == "head" {
					if !bytes.Equal(raw[:8], other[:8]) || !bytes.Equal(raw[12:], other[12:]) {
						t.Fatal("head fields changed")
					}
				} else if !bytes.Equal(raw, other) {
					t.Fatal("non-name table changed", tag)
				}
			}
			oldNames, newNames := fallbackTestNameRecords(t, source), fallbackTestNameRecords(t, got.data)
			for key, value := range oldNames {
				var a, b, c, id int
				fmt.Sscanf(key, "%d/%d/%d/%d", &a, &b, &c, &id)
				if id == 1 || id == 3 || id == 4 || id == 6 || id == 16 || id == 25 {
					continue
				}
				if !bytes.Equal(value, newNames[key]) {
					t.Fatal("non-identity name record changed", key)
				}
			}
			face, err := sfnt.Parse(got.data)
			if err != nil {
				t.Fatal(err)
			}
			family, _ := face.Name(nil, sfnt.NameIDFamily)
			typographic, _ := face.Name(nil, sfnt.NameIDTypographicFamily)
			ps, _ := face.Name(nil, sfnt.NameIDPostScript)
			if family != got.name || typographic != wordFallbackFamily || len(ps) > 63 || strings.ContainsAny(ps, " [](){}<>/%") {
				t.Fatal(family, typographic, ps)
			}
			for _, id := range []sfnt.NameID{sfnt.NameIDCopyright, sfnt.NameIDTrademark, sfnt.NameIDLicense, sfnt.NameIDLicenseURL} {
				oldFace, _ := sfnt.Parse(source)
				a, _ := oldFace.Name(nil, id)
				b, _ := face.Name(nil, id)
				if a == "" || a != b {
					t.Fatal("copyright/license lost", id)
				}
			}
			again, err := prepareWordFallbackEmbedding(fontData{name, source})
			if err != nil || !bytes.Equal(again.data, got.data) {
				t.Fatal("non-deterministic derived face", err)
			}
		})
	}
}

func TestWordFallbackDerivationRejectsUnpinnedOrSelectedBytes(t *testing.T) {
	for _, face := range []fontData{{"仿宋", assets.FallbackFont}, {"Noto Serif SC", assets.FallbackBlackFont}, {"Noto Serif SC Black", append(append([]byte(nil), assets.FallbackBlackFont...), []byte("private")...)}, {"Noto Serif SC", nil}} {
		if _, err := prepareWordFallbackEmbedding(face); err == nil {
			t.Fatal("untrusted provenance/hash accepted", face.name)
		}
	}
	for _, bad := range [][]byte{nil, make([]byte, 12), {0, 1, 0, 0, 255, 255, 0, 0, 0, 0, 0, 0}} {
		if _, err := rebuildWordFallbackNames(bad, nil, "Regular"); err == nil {
			t.Fatal("bad sfnt accepted")
		}
	}
}

func TestWordFallbackEmbeddingDeclaresPRCAndObfuscatesOnlyOwnedDerivedBuffer(t *testing.T) {
	loadFullFallbackTestFonts(t)
	sourceHashes := map[string][32]byte{}
	sourcePointers := map[string]*byte{}
	for name, face := range fonts {
		if len(face.data) > 0 {
			sourceHashes[name] = sha256.Sum256(face.data)
			sourcePointers[name] = &face.data[0]
		}
	}
	parts := map[string]string{"word/document.xml": `<w:document xmlns:w="` + W + `"><w:rFonts w:ascii="仿宋" w:hAnsi="仿宋" w:eastAsia="仿宋" w:cs="仿宋"/><w:rFonts w:eastAsia="黑体"/></w:document>`, "word/settings.xml": `<w:settings xmlns:w="` + W + `"></w:settings>`, "[Content_Types].xml": `<Types></Types>`, "word/_rels/document.xml.rels": `<Relationships></Relationships>`}
	files, err := addFallbackFonts(parts)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 2 {
		t.Fatal(len(files))
	}
	table, err := parseXML([]byte(parts["word/fontTable.xml"]))
	if err != nil {
		t.Fatal(err)
	}
	for i, font := range table.FindElements("//w:font") {
		if attr(child(font, "charset"), "val") != "86" {
			t.Fatal("missing CJK charset")
		}
		key := attr(child(font, "embedRegular"), "fontKey")
		raw, err := hex.DecodeString(strings.NewReplacer("{", "", "}", "", "-", "").Replace(key))
		if err != nil {
			t.Fatal(err)
		}
		data := append([]byte(nil), files[fmt.Sprintf("word/fonts/font%d.odttf", i+1)]...)
		for n := 0; n < 32; n++ {
			data[n] ^= raw[15-n%16]
		}
		face, err := sfnt.Parse(data)
		if err != nil {
			t.Fatal(err)
		}
		family, _ := face.Name(nil, sfnt.NameIDFamily)
		if family != attr(font, "name") || wordFontChecksum(data) != 0xb1b0afba {
			t.Fatal("fontTable and actual identity differ", family)
		}
	}
	if strings.Contains(parts["word/settings.xml"], "doNotEmbedSystemFonts") {
		t.Fatal("non-standard setting")
	}
	for name, sum := range sourceHashes {
		face := fonts[name]
		if sum != sha256.Sum256(face.data) || sourcePointers[name] != &face.data[0] {
			t.Fatal("registered bytes/ownership changed", name)
		}
	}
}

func TestWordFallbackAliasesRoundTripWeightsAndRespectSelectedSameNamedFace(t *testing.T) {
	loadFullFallbackTestFonts(t)
	for _, name := range []string{wordFallbackFamily, wordFallbackBlackFamily} {
		expected, _ := derivedFallbackSource(name)
		if resolveFont(name).name != expected {
			t.Fatal("wrong exact alias", name)
		}
		got, face, embed := wordFontDeclaration(name)
		if got != name || face.name != expected || !embed {
			t.Fatal("alias not re-embeddable")
		}
	}
	if _, ok := derivedFallbackSource(wordFallbackFamily + " unknown"); ok {
		t.Fatal("prefix trusted")
	}
	selected, err := prepareWordFallbackEmbedding(fontData{"Noto Serif SC Black", assets.FallbackBlackFont})
	if err != nil {
		t.Fatal(err)
	}
	selected.data = append(selected.data, []byte("selected-private-marker")...)
	if err := RegisterFont("仿宋", selected.data); err != nil {
		t.Fatal(err)
	}
	if resolveFont(wordFallbackBlackFamily).name != "仿宋" {
		t.Fatal("explicit selected family lost precedence")
	}
	_, face, embed := wordFontDeclaration(wordFallbackBlackFamily)
	if face.name != "仿宋" || embed {
		t.Fatal("selected derived-name face was embedded")
	}
}

func TestWordFallbackDOCXReopenPreservesOriginalAndRepeatExportsLeaveNoRegisteredCopy(t *testing.T) {
	loadFullFallbackTestFonts(t)
	beforeFonts, beforeMaps := len(fonts), len(fontMaps)
	m, err := NewDocument(Fields{Kind: "plain", Title: "固定字体身份", Body: "中文原文12.50不变。"})
	if err != nil {
		t.Fatal(err)
	}
	one, err := CreateDOCX(m)
	if err != nil {
		t.Fatal(err)
	}
	two, err := CreateDOCX(m)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(one, two) || len(fonts) != beforeFonts || len(fontMaps) != beforeMaps {
		t.Fatal("export is unstable or added persistent font state")
	}
	p, err := Open(one)
	if err != nil {
		t.Fatal(err)
	}
	same, err := p.Export(p.Model, false)
	if err != nil || !bytes.Equal(one, same) {
		t.Fatal("unmodified Word changed", err)
	}
	if resolveFont(p.Model.Blocks[0].Paragraph.Font).name != "Noto Serif SC Black" {
		t.Fatal("Black became Regular on reopen")
	}
	pdf, err := RenderPDF(context.Background(), p.Model)
	if err != nil {
		t.Fatal(err)
	}
	for _, warning := range pdf.Warnings {
		if strings.Contains(warning, "未取得可用字体") && strings.Contains(warning, wordFallbackFamily) {
			t.Fatal("exact derived alias falsely reported missing", warning)
		}
	}
	unknown := p.Model.Clone()
	for _, paragraph := range unknown.Paragraphs() {
		paragraph.Font = wordFallbackFamily + " unknown"
	}
	unknownPDF, err := RenderPDF(context.Background(), unknown)
	if err != nil || !strings.Contains(strings.Join(unknownPDF.Warnings, " "), "未取得可用字体") {
		t.Fatal("unknown prefix bypassed fallback warning", err)
	}
	fonts["Noto Serif SC"] = fontData{"Noto Serif SC", append(append([]byte(nil), assets.FallbackFont...), 0)}
	if _, err := CreateDOCX(m); err == nil || !strings.Contains(err.Error(), "校验不匹配") {
		t.Fatal("unknown bytes did not fail clearly", err)
	}
}

func TestWordFallbackAliasesStillRequestCompleteResourcesForWord(t *testing.T) {
	browserFontState(t)
	loadCoreTestFonts(t)
	m, err := NewDocument(Fields{Kind: "plain", Title: "字体资源", Body: "中文内容。"})
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range m.Paragraphs() {
		p.Font = wordFallbackBlackFamily
	}
	foundBlack := false
	for _, need := range RequiredFallbackFonts(m, true) {
		if need.Name == "Noto Serif SC Black" && need.Complete {
			foundBlack = true
		}
	}
	if !foundBlack {
		t.Fatal("reopened Black alias did not request the full fallback")
	}
	if _, err := CreateDOCX(m); err == nil {
		t.Fatal("core subset was silently embedded")
	}
}
