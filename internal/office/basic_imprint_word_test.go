package office

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"math"
	"regexp"
	"strconv"
	"strings"
	"testing"

	readpdf "github.com/ledongthuc/pdf"
)

func basicImprintFixture(t *testing.T) Model {
	t.Helper()
	f := explicitIssueFixture()
	f.Signer = "甲明"
	f.Signers = []string{"甲明", "乙宁", "丙瑞"}
	m, e := NewDocument(f)
	if e != nil {
		t.Fatal(e)
	}
	return m
}
func basicImprintStart(m Model) int {
	for i, b := range m.Blocks {
		if b.Paragraph != nil && b.Paragraph.Role == "imprint" {
			return i
		}
	}
	return -1
}

func TestBasicImprintWordHasOneFullWidthBottomFrameAndBothRules(t *testing.T) {
	loadFullFallbackTestFonts(t)
	m := basicImprintFixture(t)
	before, _ := json.Marshal(m)
	index := basicImprintStart(m)
	markup, ok := basicImprintWordXML(m, index)
	if !ok {
		t.Fatal("generated basic imprint not recognized")
	}
	tree, e := parseXML([]byte(`<w:document xmlns:w="` + W + `"><w:body>` + markup + `</w:body></w:document>`))
	if e != nil {
		t.Fatal(e)
	}
	paragraphs := tree.FindElements("//w:p")
	if len(paragraphs) != 1 {
		t.Fatal("not one frame")
	}
	props := child(paragraphs[0], "pPr")
	if attr(child(props, "framePr"), "yAlign") != "bottom" || child(child(props, "pBdr"), "top") == nil || child(child(props, "pBdr"), "bottom") == nil {
		t.Fatal("bottom frame or either rule missing")
	}
	if attr(child(props, "ind"), "left") != "" && attr(child(props, "ind"), "left") != "0" {
		t.Fatal("border still narrowed by left indent")
	}
	old := *m.Blocks[index+1].Paragraph
	if attr(child(props, "ind"), "firstLine") != strconv.Itoa(twips(old.LeftIndent+old.Indent)) {
		t.Fatal("printing text inset changed")
	}
	tab := child(child(props, "tabs"), "tab")
	if attr(tab, "pos") != strconv.Itoa(twips(old.LeftIndent+old.Tabs[0].Position)) {
		t.Fatal("absolute date tab changed")
	}
	textNodes := descendants(paragraphs[0], "t")
	if len(textNodes) != 4 || textNodes[0].Text() != "" || textNodes[len(textNodes)-1].Text() != "" {
		t.Fatal("empty formatting runs not preserved", len(textNodes))
	}
	word, e := CreateDOCX(m)
	if e != nil {
		t.Fatal(e)
	}
	opened, e := Open(word)
	if e != nil {
		t.Fatal(e)
	}
	frames := 0
	for _, p := range opened.Model.Paragraphs() {
		if p.AnchorBottom {
			frames++
			if !p.BorderTop || !p.BorderBottom || p.Size != 14 {
				t.Fatal("roundtrip frame lost rules/font", p)
			}
		}
	}
	if frames != 1 {
		t.Fatal("actual Word did not coalesce basic imprint", frames)
	}
	unchanged, e := opened.Export(opened.Model, false)
	if e != nil {
		t.Fatal(e)
	}
	if !bytes.Equal(word, unchanged) {
		t.Fatal("unaltered original Word export changed bytes")
	}
	for _, fact := range []string{"独立印发办公室", "2024年8月19日", "2024年8月15日", "12.50", "甲明", "乙宁", "丙瑞"} {
		if !strings.Contains(opened.Model.Text(), fact) {
			t.Fatal("Word lost an authored fact")
		}
	}
	result, e := RenderPDF(context.Background(), opened.Model)
	if e != nil {
		t.Fatal(e)
	}
	reader, e := readpdf.NewReader(bytes.NewReader(result.Data), int64(len(result.Data)))
	if e != nil {
		t.Fatal(e)
	}
	var actual strings.Builder
	issuerY := 0.0
	fieldSeen := false
	var ruleY []float64
	re := regexp.MustCompile(`([-0-9.]+) ([-0-9.]+) m ([-0-9.]+) ([-0-9.]+) l S`)
	for n := 1; n <= reader.NumPage(); n++ {
		page := reader.Page(n)
		for _, run := range page.Content().Text {
			actual.WriteString(run.S)
			if run.S == "独" {
				issuerY = run.Y
			}
			if run.S == "甲" {
				fieldSeen = true
				if run.FontSize != 16 {
					t.Fatal("signer size changed", run.FontSize)
				}
			}
		}
		contents := page.V.Key("Contents")
		streams := []readpdf.Value{contents}
		if contents.Kind() == readpdf.Array {
			streams = nil
			for i := 0; i < contents.Len(); i++ {
				streams = append(streams, contents.Index(i))
			}
		}
		for _, stream := range streams {
			r := stream.Reader()
			data, e := io.ReadAll(r)
			r.Close()
			if e != nil {
				t.Fatal(e)
			}
			for _, match := range re.FindAllSubmatch(data, -1) {
				v := make([]float64, 4)
				for i := range v {
					v[i], _ = strconv.ParseFloat(string(match[i+1]), 64)
				}
				if math.Abs(v[1]-v[3]) < .02 && v[2]-v[0] > 400 && v[1] < 150 {
					ruleY = append(ruleY, v[1])
				}
			}
		}
	}
	if !fieldSeen || issuerY == 0 {
		t.Fatal("PDF signer or issuer absent")
	}
	for _, fact := range []string{"独立印发办公室", "2024年8月19日", "2024年8月15日", "12.50", "甲明", "乙宁", "丙瑞"} {
		if !strings.Contains(actual.String(), fact) {
			t.Fatal("reopened PDF lost an authored fact")
		}
	}
	above, below := false, false
	for _, y := range ruleY {
		above = above || y > issuerY
		below = below || y < issuerY
	}
	if len(ruleY) != 2 || !above || !below {
		t.Fatal("actual reopened PDF does not bracket printing text with two full-width lines", ruleY, issuerY)
	}
	after, _ := json.Marshal(m)
	if !bytes.Equal(before, after) {
		t.Fatal("Word/PDF serialization mutated author model")
	}
	if len(issueRole(m, "imprint")) != 3 {
		t.Fatal("direct PDF author model no longer has three paragraphs")
	}
	t.Logf("actual reopened PDF two rules Y=%v, issuer baseline %.2fpt; author model unchanged", ruleY, issuerY)
}

func TestBasicImprintCoalescingRejectsUnknownImportedOrNonemptyRuleLayouts(t *testing.T) {
	for _, change := range []struct {
		name   string
		mutate func(*Model)
	}{
		{"source", func(m *Model) { m.SourceID = "original" }},
		{"native", func(m *Model) { m.ImportedFormatVersion = 1 }},
		{"untyped", func(m *Model) { m.Template = "" }},
		{"space-is-authored", func(m *Model) { m.Blocks[basicImprintStart(*m)].Paragraph.Text = " " }},
		{"prefix-is-authored", func(m *Model) { m.Blocks[basicImprintStart(*m)].Paragraph.Prefix = " " }},
		{"different-rule", func(m *Model) { m.Blocks[basicImprintStart(*m)].Paragraph.BorderWidth = .25 }},
		{"custom-printing-style", func(m *Model) { m.Blocks[basicImprintStart(*m)+1].Paragraph.Size = 16 }},
		{"intervening-block", func(m *Model) {
			i := basicImprintStart(*m)
			m.Blocks = append(m.Blocks[:i+1], append([]Block{{Paragraph: &Paragraph{Text: "作者内容"}}}, m.Blocks[i+1:]...)...)
		}},
	} {
		t.Run(change.name, func(t *testing.T) {
			m := basicImprintFixture(t)
			change.mutate(&m)
			before, _ := json.Marshal(m)
			for i := range m.Blocks {
				if _, ok := basicImprintWordXML(m, i); ok {
					t.Fatal("unknown layout coalesced")
				}
			}
			after, _ := json.Marshal(m)
			if !bytes.Equal(before, after) {
				t.Fatal("rejected layout mutated")
			}
		})
	}
	f := explicitIssueFixture()
	f.CopyTo = "另一示例机关"
	m, e := NewDocument(f)
	if e != nil {
		t.Fatal(e)
	}
	for i := range m.Blocks {
		if _, ok := basicImprintWordXML(m, i); ok {
			t.Fatal("copy-to imprint unexpectedly coalesced")
		}
	}
}

func TestParagraphXMLPreservesBothBordersAndSingleBorderContract(t *testing.T) {
	for _, test := range []struct{ top, bottom bool }{{true, true}, {true, false}, {false, true}} {
		markup := paragraphXML(Paragraph{Text: "机制核对", Font: "仿宋", Size: 14, Line: 6.98, BorderTop: test.top, BorderBottom: test.bottom})
		tree, e := parseXML([]byte(`<w:p xmlns:w="` + W + `">` + strings.TrimPrefix(markup, "<w:p>")))
		if e != nil {
			t.Fatal(e)
		}
		border := child(child(tree.Root(), "pPr"), "pBdr")
		if (child(border, "top") != nil) != test.top || (child(border, "bottom") != nil) != test.bottom {
			t.Fatal("border sides altered")
		}
	}
}
