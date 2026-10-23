package office

import (
	"archive/zip"
	"bytes"
	"fmt"
	"math"
	"strings"
	"testing"
)

func nativeFormatFixture(t *testing.T, paragraphs, styles string) []byte {
	t.Helper()
	var b bytes.Buffer
	z := zip.NewWriter(&b)
	for name, data := range map[string]string{"word/document.xml": `<w:document xmlns:w="` + W + `"><w:body>` + paragraphs + `<w:p><w:r><w:t>参考位置原文</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`, "word/styles.xml": styles, "word/preserved.xml": "unchanged opaque part"} {
		w, e := z.Create(name)
		if e != nil {
			t.Fatal(e)
		}
		w.Write([]byte(data))
	}
	if e := z.Close(); e != nil {
		t.Fatal(e)
	}
	return b.Bytes()
}
func TestNativeEmptyMarkInheritanceAndEditableWord(t *testing.T) {
	for _, prefix := range []string{"w", "ns0"} {
		t.Run(prefix, func(t *testing.T) {
			styles := strings.ReplaceAll(`<w:styles xmlns:w="`+W+`"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:eastAsia="宋体"/><w:sz w:val="24"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="a"><w:pPr><w:jc w:val="both"/></w:pPr><w:rPr><w:sz w:val="21"/></w:rPr></w:style></w:styles>`, "w:", prefix+":")
			styles = strings.ReplaceAll(styles, "xmlns:w", "xmlns:"+prefix)
			source := nativeFormatFixture(t, `<w:p><w:pPr><w:rPr><w:rFonts w:eastAsia="宋体"/><w:sz w:val="22"/></w:rPr></w:pPr></w:p>`, styles)
			pkg, e := Open(source)
			if e != nil {
				t.Fatal(e)
			}
			p := pkg.Model.Paragraphs()[0]
			if p.Font != "宋体" || p.Size != 11 || p.Indent != 0 || p.Line != 0 || p.Align != "both" {
				t.Fatalf("effective insertion: %+v", p)
			}
			unchanged, e := pkg.Export(pkg.Model, false)
			if e != nil || !bytes.Equal(source, unchanged) {
				t.Fatal("untouched must be byte identical", e)
			}
			for _, tracked := range []bool{false, true} {
				m := pkg.Model.Clone()
				m.Paragraphs()[0].Text = "模拟待核"
				out, e := pkg.Export(m, tracked)
				if e != nil {
					t.Fatal(e)
				}
				after, e := Open(out)
				if e != nil {
					t.Fatal(e)
				}
				q := after.Model.Paragraphs()[0]
				if q.Text != "模拟待核" || q.Font != "宋体" || q.Size != 11 || q.Indent != 0 {
					t.Fatalf("reopened: %+v", q)
				}
				if !bytes.Equal(after.Parts["word/styles.xml"], pkg.Parts["word/styles.xml"]) || !bytes.Equal(after.Parts["word/preserved.xml"], pkg.Parts["word/preserved.xml"]) {
					t.Fatal("unrelated package parts changed")
				}
				if !bytes.Contains(after.Parts["word/document.xml"], []byte(`w:sz w:val="22"`)) {
					t.Fatal("new run must have explicit size")
				}
			}
		})
	}
}
func TestNativeInheritedDefaultsAndDirectOverride(t *testing.T) {
	styles := `<w:styles xmlns:w="` + W + `"><w:docDefaults><w:pPrDefault><w:pPr><w:spacing w:before="120" w:after="80"/></w:pPr></w:pPrDefault><w:rPrDefault><w:rPr><w:rFonts w:eastAsia="宋体"/><w:sz w:val="24"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:styleId="base"><w:pPr><w:ind w:firstLineChars="200"/><w:spacing w:line="400" w:lineRule="exact"/></w:pPr><w:rPr><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="custom" w:default="1"><w:basedOn w:val="base"/><w:pPr><w:jc w:val="right"/></w:pPr></w:style><w:style w:type="character" w:styleId="c"><w:rPr><w:rFonts w:eastAsia="楷体"/><w:sz w:val="30"/><w:i/></w:rPr></w:style></w:styles>`
	source := nativeFormatFixture(t, `<w:p/><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:rPr><w:sz w:val="60"/></w:rPr></w:pPr><w:r><w:rPr><w:rStyle w:val="c"/><w:sz w:val="32"/><w:i w:val="0"/></w:rPr><w:t>已有正文</w:t></w:r></w:p>`, styles)
	pkg, e := Open(source)
	if e != nil {
		t.Fatal(e)
	}
	a, b := pkg.Model.Paragraphs()[0], pkg.Model.Paragraphs()[1]
	if a.Size != 14 || a.Font != "宋体" || a.Align != "right" || math.Abs(a.Line-400/56.6929) > .001 || math.Abs(a.Indent-28*25.4/72) > .001 {
		t.Fatalf("defaults/basedOn: %+v", a)
	}
	if b.Size != 16 || b.Font != "楷体" || b.Italic || b.After != 0 || b.Before == 0 || b.Line != 0 || math.Abs(b.Indent-32*25.4/72) > .001 {
		t.Fatalf("run overrides without paragraph mark leaking: %+v", b)
	}
}
func TestNativeExplicitEmptyFormatAndStyleCycles(t *testing.T) {
	styles := fmt.Sprintf(`<w:styles xmlns:w="%s"><w:style w:type="paragraph" w:styleId="a"><w:basedOn w:val="b"/><w:rPr><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="b"><w:basedOn w:val="a"/><w:rPr><w:rFonts w:eastAsia="楷体"/></w:rPr></w:style></w:styles>`, W)
	pkg, e := Open(nativeFormatFixture(t, `<w:p><w:pPr><w:pStyle w:val="a"/></w:pPr></w:p>`, styles))
	if e != nil {
		t.Fatal(e)
	}
	m := pkg.Model.Clone()
	m.Paragraphs()[0].Text = "明确修改"
	m.Paragraphs()[0].Size = 18
	out, e := pkg.Export(m, false)
	if e != nil {
		t.Fatal(e)
	}
	after, e := Open(out)
	if e != nil {
		t.Fatal(e)
	}
	if p := after.Model.Paragraphs()[0]; p.Size != 18 || p.Font != "楷体" {
		t.Fatalf("empty format edit: %+v", p)
	}
}

func TestNativeThemeFaceAndUnknownDefaults(t *testing.T) {
	styles := `<w:styles xmlns:w="` + W + `"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:eastAsiaTheme="minorEastAsia"/><w:lang w:eastAsia="zh-CN"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>`
	source := nativeFormatFixture(t, `<w:p/>`, styles)
	pkg, e := Open(source)
	if e != nil {
		t.Fatal(e)
	}
	pkg.Parts["word/theme/theme1.xml"] = []byte(`<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:fontScheme><a:minorFont><a:ea typeface=""/><a:font script="Hans" typeface="等线"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`)
	f := readImportedFormatting(pkg.Parts)
	_, rp := f.paragraph("", nil)
	if attr(child(rp, "rFonts"), "eastAsia") != "等线" {
		t.Fatal("theme face unresolved")
	}
	d, _ := parseXML([]byte(`<w:rPr xmlns:w="` + W + `"><w:rFonts w:eastAsia="宋体"/></w:rPr>`))
	direct := f.run(rp, d.Root())
	if attr(child(direct, "rFonts"), "eastAsia") != "宋体" {
		t.Fatal("theme overrode explicit position font")
	}
	unknown, e := Open(nativeFormatFixture(t, `<w:p/>`, ""))
	if e != nil {
		t.Fatal(e)
	}
	if !strings.Contains(strings.Join(unknown.Model.Warnings, " "), "未明确声明") {
		t.Fatal("undefined host defaults cannot certify formatting")
	}
}

func TestNativeInsertionKeepsExtensionNamespaces(t *testing.T) {
	d, e := parseXML([]byte(`<w:p xmlns:w="` + W + `" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"><w:pPr><w:rPr><w:lang w:eastAsia="zh-CN"/><w14:ligatures w14:val="standardContextual"/></w:rPr></w:pPr></w:p>`))
	if e != nil {
		t.Fatal(e)
	}
	rp := insertionRunProperties(child(child(d.Root(), "pPr"), "rPr"), Paragraph{Font: "宋体", Size: 11})
	for _, c := range rp.ChildElements() {
		if c.Tag == "ligatures" && c.NamespaceURI() != "http://schemas.microsoft.com/office/word/2010/wordml" {
			t.Fatal("extension namespace corrupted")
		}
	}
}

func TestNativeAuthoredMultipleSurvivesSizeEdit(t *testing.T) {
	source := nativeFormatFixture(t, `<w:p><w:pPr><w:spacing w:line="360" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:eastAsia="仿宋"/><w:sz w:val="28"/></w:rPr><w:t>原有一点五倍行距</w:t></w:r></w:p>`, "")
	pkg, e := Open(source)
	if e != nil {
		t.Fatal(e)
	}
	m := pkg.Model.Clone()
	p := m.Paragraphs()[0]
	if p.Line != 0 || p.LineMultiple != 1.5 {
		t.Fatal("authored multiplier lost", p)
	}
	p.Size = 18
	output, e := pkg.Export(m, false)
	if e != nil {
		t.Fatal(e)
	}
	next, e := Open(output)
	if e != nil {
		t.Fatal(e)
	}
	p = next.Model.Paragraphs()[0]
	if p.Size != 18 || p.LineMultiple != 1.5 || p.Line != 0 {
		t.Fatal("size edit replaced original automatic spacing", p)
	}
	m.Paragraphs()[0].LineMultiple = math.NaN()
	if m.Validate() == nil {
		t.Fatal("nonfinite multiplier accepted")
	}
}

func TestNativeOlderSavedDraftDoesNotRewriteUneditedSource(t *testing.T) {
	styles := `<w:styles xmlns:w="` + W + `"><w:style w:type="paragraph" w:default="1" w:styleId="a"><w:rPr><w:rFonts w:eastAsia="宋体"/><w:sz w:val="21"/></w:rPr></w:style></w:styles>`
	source := nativeFormatFixture(t, `<w:p><w:pPr><w:rPr><w:rFonts w:eastAsia="宋体"/><w:sz w:val="22"/></w:rPr></w:pPr></w:p>`, styles)
	old, e := openPackage(source, true)
	if e != nil {
		t.Fatal(e)
	}
	saved := old.Model.Clone()
	saved.Paragraphs()[0].Text = "旧稿保存文字"
	current, e := Open(source)
	if e != nil {
		t.Fatal(e)
	}
	data, e := current.Export(saved, false)
	if e != nil {
		t.Fatal(e)
	}
	after, e := Open(data)
	if e != nil {
		t.Fatal(e)
	}
	if q := after.Model.Paragraphs()[0]; q.Size != 16 || q.Font != "仿宋" || q.Text != "旧稿保存文字" {
		t.Fatal("saved version-zero insertion override lost", q)
	}
	beforeXML := old.elements["p1"].Copy()
	afterXML := after.elements["p1"].Copy()
	if beforeXML.Tag != afterXML.Tag || len(afterXML.ChildElements()) != len(beforeXML.ChildElements()) {
		t.Fatal("unedited source paragraph rewritten")
	}
	if !bytes.Equal(after.Parts["word/styles.xml"], old.Parts["word/styles.xml"]) {
		t.Fatal("source styles changed")
	}
	untouched, e := current.Export(old.Model, false)
	if e != nil || !bytes.Equal(untouched, source) {
		t.Fatal("unchanged old draft no longer preserves original bytes", e)
	}
}
