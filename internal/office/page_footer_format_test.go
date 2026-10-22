package office

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"sort"
	"strings"
	"testing"

	"doc2govpdf/assets"
	"golang.org/x/image/font/gofont/goregular"
)

func assertPageFooterFormat(t *testing.T, data []byte, align, family string) {
	t.Helper()
	d, e := parseXML(data)
	if e != nil {
		t.Fatal(e)
	}
	paragraphs := d.FindElements("//w:p")
	if len(paragraphs) != 1 {
		t.Fatal("footer paragraph count changed")
	}
	pp := child(paragraphs[0], "pPr")
	if attr(child(pp, "jc"), "val") != align || attr(child(pp, "ind"), "left") != "280" || attr(child(pp, "ind"), "right") != "280" || attr(child(pp, "ind"), "firstLine") != "0" {
		t.Fatal("footer geometry changed")
	}
	if attr(child(pp, "spacing"), "line") != "280" || attr(child(pp, "spacing"), "lineRule") != "exact" {
		t.Fatal("footer line spacing changed")
	}
	if attr(child(pp, "pStyle"), "val") != pageFooterStyleID || len(pp.ChildElements()) == 0 || pp.ChildElements()[0].Tag != "pStyle" || child(pp, "rPr") != nil {
		t.Fatal("footer style reference absent, out of order, or mixed with mark-only workaround")
	}
	fields := d.FindElements("//w:fldSimple")
	if len(fields) != 1 || attr(fields[0], "instr") != `PAGE` {
		t.Fatal("PAGE instruction changed or mixed with a field-switch workaround")
	}
	texts := descendants(paragraphs[0], "t")
	if len(texts) != 3 || texts[0].Text() != "— " || texts[1].Text() != "1" || texts[2].Text() != " —" {
		t.Fatal("footer text/cache changed")
	}
	runs := descendants(paragraphs[0], "r")
	if len(runs) != 3 {
		t.Fatal("field result or dash runs changed")
	}
	for _, run := range runs {
		rp := child(run, "rPr")
		if attr(child(rp, "sz"), "val") != "28" || attr(child(rp, "spacing"), "val") != "0" || attr(child(rp, "snapToGrid"), "val") != "0" {
			t.Fatal("cached footer size/spacing changed")
		}
		font := child(rp, "rFonts")
		for _, slot := range []string{"ascii", "hAnsi", "eastAsia"} {
			want := family
			if family == "raw" {
				want = "SimSun"
				if slot == "eastAsia" {
					want = "宋体"
				}
			}
			if attr(font, slot) != want {
				t.Fatal("footer font slot not mapped", slot, attr(font, slot), want)
			}
		}
	}
}
func pageFooterFixture(t *testing.T) Model {
	t.Helper()
	m, e := NewDocument(Fields{Kind: "plain", Title: "字段格式机制核对", Body: "正文12.50。"})
	if e != nil {
		t.Fatal(e)
	}
	return m
}

func TestPageFooterStyleKeepsDynamicFieldAndCachedFormat(t *testing.T) {
	for _, align := range []string{"left", "right"} {
		assertPageFooterFormat(t, []byte(generatedPageFooterXML(align)), align, "raw")
	}
}

func TestPageFooterStyleMapsSelectedAndFallbackWithoutChangingBodyDefaults(t *testing.T) {
	for _, selected := range []bool{false, true} {
		t.Run(map[bool]string{false: "fallback", true: "selected"}[selected], func(t *testing.T) {
			loadFullFallbackTestFonts(t)
			expected := wordFallbackFamily
			if selected {
				if e := RegisterFont("宋体", goregular.TTF); e != nil {
					t.Fatal(e)
				}
				var ok bool
				expected, ok = legacyWordFamily("宋体")
				if !ok || expected != "Go" {
					t.Fatal("fixture identity changed")
				}
			}
			m := pageFooterFixture(t)
			before, _ := json.Marshal(m)
			data, e := CreateDOCX(m)
			if e != nil {
				t.Fatal(e)
			}
			parts := wordIdentityParts(t, data)
			assertPageFooterFormat(t, parts["word/footer1.xml"], "right", expected)
			assertPageFooterFormat(t, parts["word/footer2.xml"], "left", expected)
			styles, e := parseXML(parts["word/styles.xml"])
			if e != nil {
				t.Fatal(e)
			}
			defaults := child(child(styles.Root(), "docDefaults"), "rPrDefault")
			rp := child(defaults, "rPr")
			if attr(child(rp, "sz"), "val") != "32" || attr(child(rp, "rFonts"), "eastAsia") != wordFallbackFamily {
				t.Fatal("body defaults changed to footer format")
			}
			if len(styles.FindElements("//w:style")) != 2 {
				t.Fatal("unrelated styles added")
			}
			styleFound := false
			for _, style := range styles.FindElements("//w:style") {
				if attr(style, "styleId") != pageFooterStyleID {
					continue
				}
				styleFound = true
				if attr(style, "type") != "paragraph" || attr(child(style, "name"), "val") != "Doc2GovPDF Page Number" || child(style, "basedOn") != nil || child(style, "pPr") != nil {
					t.Fatal("page-number style differs from validated local-only contract")
				}
				pr := child(style, "rPr")
				if attr(child(pr, "sz"), "val") != "28" || attr(child(pr, "snapToGrid"), "val") != "0" || attr(child(pr, "spacing"), "val") != "0" || child(pr, "szCs") != nil {
					t.Fatal("page-number style size/spacing changed")
				}
				for _, slot := range []string{"ascii", "hAnsi", "eastAsia"} {
					if attr(child(pr, "rFonts"), slot) != expected {
						t.Fatal("page-number style real family not mapped", slot)
					}
				}
				if attr(child(pr, "rFonts"), "cs") != "" {
					t.Fatal("unexpected complex-script extension")
				}
			}
			if !styleFound {
				t.Fatal("page-number style missing")
			}

			// Every embedded font must remain the fixed licensed fallback derivative;
			// a self-selected public Go face is not silently embedded in Word either.
			allowed := map[[32]byte]bool{}
			for name, source := range map[string][]byte{"Noto Serif SC": assets.FallbackFont, "Noto Serif SC Black": assets.FallbackBlackFont} {
				derived, e := prepareWordFallbackEmbedding(fontData{name, source})
				if e != nil {
					t.Fatal(e)
				}
				allowed[sha256.Sum256(derived.data)] = true
			}
			table, e := parseXML(parts["word/fontTable.xml"])
			if e != nil {
				t.Fatal(e)
			}
			rels, e := parseXML(parts["word/_rels/fontTable.xml.rels"])
			if e != nil {
				t.Fatal(e)
			}
			targets := map[string]string{}
			for _, rel := range rels.Root().ChildElements() {
				targets[attr(rel, "Id")] = attr(rel, "Target")
			}
			fontsFound := 0
			for _, entry := range table.FindElements("//w:font") {
				if attr(entry, "name") == "Go" {
					t.Fatal("selected font incorrectly embedded")
				}
				embed := child(entry, "embedRegular")
				key, e := hex.DecodeString(strings.NewReplacer("{", "", "}", "", "-", "").Replace(attr(embed, "fontKey")))
				if e != nil || len(key) != 16 {
					t.Fatal("font key invalid")
				}
				encoded := parts["word/"+targets[attr(embed, "id")]]
				if len(encoded) < 32 {
					t.Fatal("embedded font missing")
				}
				decoded := append([]byte(nil), encoded...)
				for i := 0; i < 32; i++ {
					decoded[i] ^= key[15-i%16]
				}
				if !allowed[sha256.Sum256(decoded)] {
					t.Fatal("Word embeds bytes beyond fixed OFL sources")
				}
				fontsFound++
			}
			if fontsFound != 2 {
				t.Fatal("unexpected fallback faces", fontsFound)
			}
			opened, e := Open(data)
			if e != nil || opened.Model.PDFUnsupported {
				t.Fatal("PAGE switch made generated Word unsupported", e)
			}
			same, e := opened.Export(opened.Model, false)
			if e != nil || !bytes.Equal(same, data) {
				t.Fatal("unaltered generated Word not byte exact", e)
			}
			after, _ := json.Marshal(m)
			if !bytes.Equal(before, after) {
				t.Fatal("author model mutated")
			}
		})
	}
}

func pageFooterZipParts(t *testing.T, parts map[string][]byte) []byte {
	t.Helper()
	var out bytes.Buffer
	z := zip.NewWriter(&out)
	names := []string{}
	for name := range parts {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		w, e := z.Create(name)
		if e != nil {
			t.Fatal(e)
		}
		if _, e = w.Write(parts[name]); e != nil {
			t.Fatal(e)
		}
	}
	if e := z.Close(); e != nil {
		t.Fatal(e)
	}
	return out.Bytes()
}
func TestPageFooterStyleDoesNotRewriteAnExistingWordFooter(t *testing.T) {
	loadFullFallbackTestFonts(t)
	data, e := CreateDOCX(pageFooterFixture(t))
	if e != nil {
		t.Fatal(e)
	}
	parts := wordIdentityParts(t, data)
	for _, name := range []string{"word/footer1.xml", "word/footer2.xml"} {
		parts[name] = bytes.ReplaceAll(parts[name], []byte(`<w:pStyle w:val="`+pageFooterStyleID+`"/>`), nil)
	}
	styles, e := parseXML(parts["word/styles.xml"])
	if e != nil {
		t.Fatal(e)
	}
	for _, style := range styles.FindElements("//w:style") {
		if attr(style, "styleId") == pageFooterStyleID {
			style.Parent().RemoveChild(style)
		}
	}
	parts["word/styles.xml"], e = styles.WriteToBytes()
	if e != nil {
		t.Fatal(e)
	}
	original := pageFooterZipParts(t, parts)
	opened, e := Open(original)
	if e != nil || opened.Model.PDFUnsupported {
		t.Fatal("existing PAGE field import unsupported", e)
	}
	same, e := opened.Export(opened.Model, false)
	if e != nil || !bytes.Equal(same, original) {
		t.Fatal("existing original footer was rewritten", e)
	}
	edited := opened.Model.Clone()
	changed := false
	for _, p := range edited.Paragraphs() {
		if p.Text == "正文12.50。" {
			p.Text = "正文12.51。"
			changed = true
		}
	}
	if !changed {
		t.Fatal("fixture body not found")
	}
	updated, e := opened.Export(edited, false)
	if e != nil {
		t.Fatal(e)
	}
	after := wordIdentityParts(t, updated)
	for _, name := range []string{"word/footer1.xml", "word/footer2.xml"} {
		if !bytes.Equal(after[name], parts[name]) {
			t.Fatal("body edit rewrote original PAGE footer")
		}
	}
}

func TestPageFooterStyleSourceNormalizationDeclaresItsOwnBoundStyle(t *testing.T) {
	loadFullFallbackTestFonts(t)
	word, e := CreateDOCX(pageFooterFixture(t))
	if e != nil {
		t.Fatal(e)
	}
	parts := wordIdentityParts(t, word)
	doc, e := parseXML(parts["word/document.xml"])
	if e != nil {
		t.Fatal(e)
	}
	// Force the existing explicit normalization path to create replacement
	// footers, without editing any production source or a user document.
	for _, section := range descendants(doc.Root(), "sectPr") {
		for _, ref := range childElements(section, "footerReference") {
			section.RemoveChild(ref)
		}
	}
	overrides, e := normalizedFooterParts(parts, doc)
	if e != nil {
		t.Fatal(e)
	}
	checked := 0
	for name, data := range overrides {
		if !strings.Contains(name, "footer-doc2govpdf-") || !strings.HasSuffix(name, ".xml") {
			continue
		}
		align := "right"
		if strings.Contains(name, "-even") {
			align = "left"
		}
		if !bytes.Equal(data, []byte(pageFooterXMLWithStyle(align, pageFooterStyleID+"x"))) || bytes.Contains(data, []byte("MERGEFORMAT")) {
			t.Fatal("source replacement did not bind its independently declared style")
		}
		checked++
	}
	if checked != 2 {
		t.Fatal("normalization fixture did not create odd/even footers", checked)
	}
	if _, changed := overrides["word/styles.xml"]; !changed {
		t.Fatal("source replacement style definition missing")
	}
}
