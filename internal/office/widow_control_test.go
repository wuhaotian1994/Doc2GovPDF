package office

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

func widowValue(v bool) *bool { return &v }

func TestWidowControlDefaultOldJSONAndExplicitWordState(t *testing.T) {
	var p Paragraph
	if e := json.Unmarshal([]byte(`{"id":"old","text":"原文","font":"仿宋","size":16}`), &p); e != nil {
		t.Fatal(e)
	}
	if p.WidowControl != nil || !paragraphWidowControl(p) {
		t.Fatal("old JSON lost Word default")
	}
	for _, v := range []*bool{nil, widowValue(true), widowValue(false)} {
		p.WidowControl = v
		b, _ := json.Marshal(p)
		var q Paragraph
		if e := json.Unmarshal(b, &q); e != nil {
			t.Fatal(e)
		}
		if paragraphWidowControl(q) != (v == nil || *v) {
			t.Fatal("tri-state JSON lost")
		}
		xml := paragraphXML(p)
		if v == nil && strings.Contains(xml, "widowControl") {
			t.Fatal("default changed old generated Word")
		}
		if v != nil && (!strings.Contains(xml, "widowControl") || (!*v && !strings.Contains(xml, `w:widowControl w:val="0"`))) {
			t.Fatal("explicit Word value lost")
		}
	}
}

func TestWidowControlEffectiveStyleAndOriginalByteProtection(t *testing.T) {
	for _, tc := range []struct {
		name, defaults, base, direct string
		want                         bool
		nilValue                     bool
	}{
		{"absent", "", "", "", true, true},
		{"default-off", `<w:widowControl w:val="off"/>`, "", "", false, false},
		{"based-on", `<w:widowControl w:val="0"/>`, `<w:widowControl/>`, "", true, false},
		{"direct-off", `<w:widowControl/>`, `<w:widowControl/>`, `<w:widowControl w:val="false"/>`, false, false},
		{"direct-on", `<w:widowControl w:val="0"/>`, `<w:widowControl w:val="off"/>`, `<w:widowControl w:val="1"/>`, true, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			styles := `<w:styles xmlns:w="` + W + `"><w:docDefaults><w:pPrDefault><w:pPr>` + tc.defaults + `</w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:styleId="base"><w:pPr>` + tc.base + `</w:pPr></w:style><w:style w:type="paragraph" w:styleId="derived"><w:basedOn w:val="base"/></w:style></w:styles>`
			data := nativeFormatFixture(t, `<w:p><w:pPr><w:pStyle w:val="derived"/>`+tc.direct+`</w:pPr><w:r><w:t>原件内容12.50</w:t></w:r></w:p>`, styles)
			for _, legacy := range []bool{false, true} {
				pkg, e := openPackage(data, legacy)
				if e != nil {
					t.Fatal(e)
				}
				p := pkg.Model.Blocks[0].Paragraph
				if paragraphWidowControl(*p) != tc.want || (p.WidowControl == nil) != tc.nilValue {
					t.Fatal("effective inheritance lost", legacy, p.WidowControl)
				}
				before, _ := json.Marshal(pkg.Model)
				same, e := pkg.Export(pkg.Model, false)
				if e != nil || !bytes.Equal(data, same) {
					t.Fatal("untouched original not byte exact", legacy, e)
				}
				clone := pkg.Model.Clone()
				after, _ := json.Marshal(clone)
				if !bytes.Equal(before, after) {
					t.Fatal("clone changed state")
				}
			}
		})
	}
}

func widowMechanismModel(lines, remaining int, on *bool) Model {
	m := Model{SourceID: "native-mechanism", Page: DefaultPage()}
	// 225mm body; the filler leaves exactly remaining 10mm lines plus 5mm.
	for i := 0; i < 22-remaining; i++ {
		m.Blocks = append(m.Blocks, Block{Paragraph: &Paragraph{ID: fmt.Sprint("f", i), Font: "仿宋", Size: 16, Line: 10}})
	}
	p := Paragraph{ID: "target", Text: strings.Repeat("甲", 28*lines), Font: "仿宋", Size: 16, Line: 10, WidowControl: on}
	m.Blocks = append(m.Blocks, Block{Paragraph: &p})
	return m
}

func TestWidowControlNativeTwoThreeFourLinesAndExplicitOff(t *testing.T) {
	wholeNoteWriter(t)
	for _, tc := range []struct {
		lines, remaining, first int
		on                      *bool
	}{
		{2, 1, 0, nil}, {3, 1, 0, nil}, {3, 2, 0, nil}, {4, 1, 0, nil}, {4, 2, 56, nil}, {4, 3, 56, nil},
		{4, 1, 28, widowValue(false)}, {4, 3, 84, widowValue(false)},
	} {
		t.Run(fmt.Sprintf("%dlines-%droom-%v", tc.lines, tc.remaining, tc.on), func(t *testing.T) {
			m := widowMechanismModel(tc.lines, tc.remaining, tc.on)
			before, _ := json.Marshal(m)
			result, e := RenderPDF(context.Background(), m)
			if e != nil {
				t.Fatal(e)
			}
			pages := wholeNotePDFPages(t, result.Data)
			if len(pages) != 2 || strings.Count(pages[0], "甲") != tc.first || strings.Count(strings.Join(pages, ""), "甲") != 28*tc.lines {
				t.Fatal("wrong widow split", len(pages), strings.Count(pages[0], "甲"))
			}
			after, _ := json.Marshal(m)
			if !bytes.Equal(before, after) || m.SourceID != "native-mechanism" {
				t.Fatal("source identity/model changed")
			}
		})
	}
}

func TestWidowControlLongKeepChainAndPageCapacityAreBounded(t *testing.T) {
	wholeNoteWriter(t)
	for _, kind := range []string{"long-keep-next", "long-keep-lines", "short-page", "hard-break", "section"} {
		t.Run(kind, func(t *testing.T) {
			m := widowMechanismModel(4, 1, nil)
			p := m.Blocks[len(m.Blocks)-1].Paragraph
			switch kind {
			case "long-keep-next":
				p.Text = strings.Repeat("甲", 1000)
				p.KeepNext = true
				m.Blocks = append(m.Blocks, Block{Paragraph: &Paragraph{ID: "following", Text: "NEXT", Font: "仿宋", Size: 16, Line: 10}})
			case "long-keep-lines":
				p.Text = strings.Repeat("甲", 1000)
				p.KeepLines = true
			case "short-page":
				m.Blocks = m.Blocks[len(m.Blocks)-1:]
				m.Page.Height = m.Page.Top + m.Page.Bottom + 40
				p.Line = 25
				p.Text = strings.Repeat("甲", 81)
			case "hard-break":
				p.BreakOffsets = []int{len("甲") * 27}
				p.KeepLines = true
			case "section":
				pg := m.Page
				m.Blocks[len(m.Blocks)-1].Page = &pg
			}
			result, e := RenderPDF(context.Background(), m)
			if e != nil {
				t.Fatal(e)
			}
			pages := wholeNotePDFPages(t, result.Data)
			if strings.Count(strings.Join(pages, ""), "甲") != len([]rune(p.Text)) {
				t.Fatal("content clipped")
			}
			if kind == "hard-break" && (strings.Count(pages[0], "甲") != 27 || strings.Count(pages[1], "甲") != 85) {
				t.Fatal("authored break displaced")
			}
			if kind == "section" && strings.Contains(pages[0], "甲") {
				t.Fatal("section boundary lost")
			}
		})
	}
}

func TestWidowControlSoftBreakRemainsOneParagraph(t *testing.T) {
	wholeNoteWriter(t)
	for _, tc := range []struct {
		text        string
		room, first int
		on          *bool
	}{
		{"甲\n甲\n甲", 2, 0, nil}, {"甲\n甲\n甲\n甲", 2, 2, nil},
		{strings.Repeat("甲", 112) + "\n甲", 4, 84, nil},
		{"甲\n甲\n甲\n甲", 1, 1, widowValue(false)},
	} {
		m := widowMechanismModel(4, tc.room, tc.on)
		p := m.Blocks[len(m.Blocks)-1].Paragraph
		p.Text = tc.text
		pdf, e := RenderPDF(context.Background(), m)
		if e != nil {
			t.Fatal(e)
		}
		pages := wholeNotePDFPages(t, pdf.Data)
		if len(pages) != 2 || strings.Count(pages[0], "甲") != tc.first || strings.Count(strings.Join(pages, ""), "甲") != strings.Count(tc.text, "甲") {
			t.Fatal("soft break split changed paragraph semantics", tc.room, strings.Count(pages[0], "甲"))
		}
	}
}

func TestWidowControlSoftBreakGridIndentMatchesActualWrapping(t *testing.T) {
	wholeNoteWriter(t)
	for _, align := range []string{"left", "center", "right"} {
		m := widowMechanismModel(4, 2, nil)
		p := m.Blocks[len(m.Blocks)-1].Paragraph
		p.Indent = 11.29
		p.Align = align
		p.Text = strings.Repeat("甲", 28) + "\n甲\n甲"
		pdf, e := RenderPDF(context.Background(), m)
		if e != nil {
			t.Fatal(e)
		}
		pages := wholeNotePDFPages(t, pdf.Data)
		if len(pages) != 2 || strings.Count(strings.Join(pages, ""), "甲") != 30 {
			t.Fatal("grid soft paragraph content lost", align)
		}
		// Left indent makes the first 28 characters wrap to two lines (four total),
		// while centered/right text has three total and must move as a whole.
		want := 0
		if align == "left" {
			want = 28
		}
		if strings.Count(pages[0], "甲") != want {
			t.Fatal("soft widow window disagreed with rendered grid indent", align, strings.Count(pages[0], "甲"), want)
		}
	}
}

func TestWidowControlSoftKeepNextConsumesSharedTailOnce(t *testing.T) {
	wholeNoteWriter(t)
	for _, tc := range []struct {
		name     string
		after    float64
		on       *bool
		longNext bool
	}{
		{"default", 0, nil, false}, {"spacing-after", 6, nil, false}, {"off", 0, widowValue(false), false}, {"oversized-next-chain", 0, nil, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			m := widowMechanismModel(4, 3, tc.on)
			p := m.Blocks[len(m.Blocks)-1].Paragraph
			p.Text = strings.TrimSuffix(strings.Repeat("甲\n", 25), "\n")
			p.KeepNext = true
			p.After = tc.after
			next := Paragraph{ID: "next", Text: "NEXT", Font: "仿宋", Size: 16, Line: 10}
			if tc.longNext {
				next.KeepNext = true
				next.Text = strings.Repeat("乙", 1000)
			}
			m.Blocks = append(m.Blocks, Block{Paragraph: &next})
			if tc.longNext {
				m.Blocks = append(m.Blocks, Block{Paragraph: &Paragraph{ID: "end", Text: "END", Font: "仿宋", Size: 16, Line: 10}})
			}
			pdf, e := RenderPDF(context.Background(), m)
			if e != nil {
				t.Fatal(e)
			}
			pages := wholeNotePDFPages(t, pdf.Data)
			counts := []int{}
			for _, page := range pages {
				if n := strings.Count(page, "甲"); n > 0 {
					counts = append(counts, n)
				}
			}
			if strings.Count(strings.Join(pages, ""), "甲") != 25 {
				t.Fatal("lost soft text")
			}
			if paragraphWidowControl(*p) && counts[len(counts)-1] < 2 {
				t.Fatal("soft keepNext stranded its last line", counts)
			}
			if tc.on != nil && !*tc.on && (len(counts) != 3 || counts[0] != 3 || counts[1] != 21 || counts[2] != 1) {
				t.Fatal("explicit off was silently reenabled", counts)
			}
			if !tc.longNext && !strings.Contains(pages[len(pages)-1], "NEXT") {
				t.Fatal("following relation lost")
			}
			t.Logf("target visual lines per page: %v", counts)
		})
	}
}
