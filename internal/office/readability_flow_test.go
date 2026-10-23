package office

import (
	"bytes"
	"codeberg.org/go-pdf/fpdf"
	"context"
	"fmt"
	readpdf "github.com/ledongthuc/pdf"
	"math"
	"strings"
	"testing"
)

func TestLongNumberedProseCanFlowWithoutChangingAuthoredHierarchy(t *testing.T) {
	m, e := NewDocument(Fields{Kind: "plain", Title: "通知", Body: "一、工作安排\n（一）活动时间\n（二）" + strings.Repeat("请保留原始记录并核对材料。", 12) + "\n结尾正文"})
	if e != nil {
		t.Fatal(e)
	}
	before := m.Clone()
	next := prepareNewLayout(m)
	if !next.Blocks[1].Paragraph.KeepNext || !next.Blocks[2].Paragraph.KeepNext || next.Blocks[3].Paragraph.KeepNext {
		t.Fatal("heading labels/prose flow boundaries were not respected")
	}
	for i, b := range m.Blocks {
		a, c := b.Paragraph, next.Blocks[i].Paragraph
		if a.Text != c.Text || a.Role != c.Role || a.Font != c.Font || a.Size != c.Size || a.Line != c.Line || a.Before != c.Before || a.After != c.After {
			t.Fatalf("authored text or format changed at %d", i)
		}
	}
	if !m.Blocks[3].Paragraph.KeepNext || !before.Blocks[3].Paragraph.KeepNext {
		t.Fatal("layout preparation mutated the draft")
	}
	for _, protect := range []string{"source", "break", "locked"} {
		copy := m.Clone()
		p := copy.Blocks[3].Paragraph
		switch protect {
		case "source":
			copy.SourceID = "original"
		case "break":
			p.PageBreak = true
		case "locked":
			p.FormatLocked = true
		}
		if !prepareNewLayout(copy).Blocks[3].Paragraph.KeepNext {
			t.Fatal("explicit original layout changed", protect)
		}
	}
}
func TestOversizedKeepTailCannotMoveOnlyTheFinalLine(t *testing.T) {
	w := &pdfWriter{ctx: context.Background(), loaded: map[string]string{}, warnings: map[string]bool{}, newDocument: true, page: Page{Width: 210, Height: 297, Top: 37, Bottom: 35, Left: 28, Right: 26}}
	w.f = fpdf.New("P", "mm", "A4", "")
	w.f.SetAutoPageBreak(false, w.page.Bottom)
	w.newPage()
	p := Paragraph{Text: strings.Repeat("甲", 100), Font: "仿宋", Size: 16, Line: 10, KeepNext: true}
	w.setFont(p)
	if n := len(w.wrapIndented(p.Text, 156, 0)); n != 4 {
		t.Fatal("fixture needs four lines", n)
	}
	w.y = 118
	w.keepTail = 214
	if e := w.paragraph(p); e != nil {
		t.Fatal(e)
	}
	if w.pages != 1 || math.Abs(w.y-158) > .01 {
		t.Fatalf("last line moved away despite ample space: pages=%d y=%.2f", w.pages, w.y)
	}
}

func TestShortHeadingSharesRemainingPageWithTheStartOfNumberedProse(t *testing.T) {
	m, err := NewDocument(Fields{Kind: "plain", Title: "原位阅读", Body: "四、工作安排\n（一）" + strings.Repeat("核对原始记录并保留完整内容。", 24)})
	if err != nil {
		t.Fatal(err)
	}
	// Explicit author blank paragraphs are retained. There is room for a heading
	// and the start of the prose, but not for the whole following paragraph.
	blanks := make([]Block, 18)
	for i := range blanks {
		blanks[i] = Block{Paragraph: &Paragraph{ID: fmt.Sprint("blank", i), Role: "body", Text: "", Font: "仿宋", Size: 16, Line: 10.21, Align: "left"}}
	}
	m.Blocks = append(blanks, m.Blocks[1:]...)
	result, err := RenderPDF(context.Background(), m)
	if err != nil {
		t.Fatal(err)
	}
	reader, err := readpdf.NewReader(bytes.NewReader(result.Data), int64(len(result.Data)))
	if err != nil {
		t.Fatal(err)
	}
	var text strings.Builder
	for _, run := range reader.Page(1).Content().Text {
		text.WriteString(run.S)
	}
	if !strings.Contains(text.String(), "四、工作安排") || !strings.Contains(text.String(), "核对原始记录") {
		t.Fatalf("heading and following content failed to use the remaining page: %q", text.String())
	}
	if len(m.Blocks) != 20 || m.Blocks[0].Paragraph.Text != "" {
		t.Fatal("author blanks were removed")
	}
}

func TestShortAuthoredClosingNoteStaysWithDateButLongOrExplicitBreakDoesNot(t *testing.T) {
	for _, test := range []struct {
		text            string
		pageBreak, keep bool
	}{{"（此件公开发布）", false, true}, {strings.Repeat("说明", 40), false, false}, {"（此件公开发布）", true, false}, {"", false, false}} {
		m, err := NewDocument(Fields{Kind: "plain", Title: "通知", Body: "正文", Agency: "示例单位", Date: "2026年10月22日"})
		if err != nil {
			t.Fatal(err)
		}
		m.Blocks = append(m.Blocks, Block{Paragraph: &Paragraph{ID: "authored-note", Role: "note", Text: test.text, Font: "仿宋", Size: 16, Line: 10.21, PageBreak: test.pageBreak}})
		prepared := prepareNewLayout(m)
		var date *Paragraph
		for _, p := range prepared.Paragraphs() {
			if p.Role == "date" {
				date = p
			}
		}
		if date == nil || date.KeepNext != test.keep {
			t.Fatalf("unexpected closing note flow: %+v %+v", test, date)
		}
		if prepared.Blocks[len(prepared.Blocks)-1].Paragraph.Text != test.text {
			t.Fatal("authored note was rewritten")
		}
	}
}

func TestHeadingWithRetainedAuthorGapCarriesActualContentToTheSamePage(t *testing.T) {
	m, err := NewDocument(Fields{Kind: "plain", Title: "原位阅读", Body: "四、工作安排\n\n（一）" + strings.Repeat("核对原始记录并保留完整内容。", 24)})
	if err != nil {
		t.Fatal(err)
	}
	blanks := make([]Block, 19)
	for i := range blanks {
		blanks[i] = Block{Paragraph: &Paragraph{ID: fmt.Sprint("before", i), Role: "body", Text: "", Font: "仿宋", Size: 16, Line: 10.21, Align: "left"}}
	}
	m.Blocks = append(blanks, m.Blocks[1:]...)
	prepared := prepareNewLayout(m)
	if prepared.Blocks[20].Paragraph.Text != "" || !prepared.Blocks[20].Paragraph.KeepNext || prepared.Blocks[20].Paragraph.Line != 10.21 {
		t.Fatal("author gap was removed or failed to carry following content")
	}
	result, err := RenderPDF(context.Background(), m)
	if err != nil {
		t.Fatal(err)
	}
	reader, err := readpdf.NewReader(bytes.NewReader(result.Data), int64(len(result.Data)))
	if err != nil {
		t.Fatal(err)
	}
	var pages []string
	for i := 1; i <= reader.NumPage(); i++ {
		var text strings.Builder
		for _, run := range reader.Page(i).Content().Text {
			text.WriteString(run.S)
		}
		pages = append(pages, text.String())
	}
	if strings.Contains(pages[0], "四、工作安排") || !strings.Contains(pages[1], "四、工作安排") || !strings.Contains(pages[1], "核对原始记录") {
		t.Fatal("heading stayed with only its blank gap", pages)
	}
	if m.Blocks[20].Paragraph.KeepNext || len(m.Blocks) != 22 {
		t.Fatal("draft gap or flow state was mutated")
	}
}
