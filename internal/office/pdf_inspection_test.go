package office

import (
	"bytes"
	"context"
	readpdf "github.com/ledongthuc/pdf"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPDFInspectionReadsActualEmbeddedFonts(t *testing.T) {
	m, e := NewDocument(Fields{Kind: "notice", Title: "核对成品字体", Agency: "示例单位", Letterhead: true, Reference: "办发〔2026〕1号", Body: "一、工作安排\n请核对材料。", Date: "2026年10月16日"})
	if e != nil {
		t.Fatal(e)
	}
	r, e := RenderPDF(context.Background(), m)
	if e != nil {
		t.Fatal(e)
	}
	check, e := InspectPDFBytes(context.Background(), r.Data, nil)
	if e != nil {
		t.Fatal(e)
	}
	if check.Pages != r.Pages || len(check.Fonts) == 0 {
		t.Fatal("missing parsed PDF data", check)
	}
	for _, font := range check.Fonts {
		if strings.HasPrefix(font, "utf8f") {
			t.Fatal("opaque PDF resource name treated as font", check.Fonts)
		}
	}
	for _, p := range m.Paragraphs() {
		if p.Role == "title" {
			p.Font = "宋体"
		}
	}
	r, e = RenderPDF(context.Background(), m)
	if e != nil {
		t.Fatal(e)
	}
	check, e = InspectPDFBytes(context.Background(), r.Data, nil)
	if e != nil {
		t.Fatal(e)
	}
	found := false
	for _, issue := range check.Issues {
		if issue.Rule == "pdf.title-font" {
			found = true
		}
	}
	if !found {
		reader, _ := readpdf.NewReader(bytes.NewReader(r.Data), int64(len(r.Data)))
		for _, s := range reader.Page(1).Content().Text {
			if s.FontSize > 20 {
				t.Logf("font=%s size=%g text=%q", s.Font, s.FontSize, s.S)
			}
		}
		t.Fatal("title font substitution not detected", check)
	}
}
func TestPDFInspectionUpstreamFiles(t *testing.T) {
	files, _ := filepath.Glob("../../testdata/upstream/gongwen-kit/pdf/*.pdf")
	for _, file := range files {
		t.Run(filepath.Base(file), func(t *testing.T) {
			data, e := os.ReadFile(file)
			if e != nil {
				t.Fatal(e)
			}
			r, e := InspectPDFBytes(context.Background(), data, nil)
			if e != nil {
				t.Fatal(e)
			}
			if r.Pages < 1 || len(r.Fonts) == 0 {
				t.Fatal("PDF inspection silently empty", r)
			}
			t.Log(r.Pages, r.Fonts, len(r.Issues))
		})
	}
}
func TestPDFInspectionRejectsUnreadableData(t *testing.T) {
	if _, e := InspectPDFBytes(context.Background(), []byte("broken"), nil); e == nil {
		t.Fatal("bad input passed")
	}
}

func TestPDFInspectionFindsOrphanAndBlankPage(t *testing.T) {
	m := Plain("只有标题\n后页正文")
	m.Blocks[0].Paragraph.KeepNext = false
	m.Blocks[1].Paragraph.PageBreak = true
	empty := *m.Blocks[1].Paragraph
	empty.ID = "blank-page"
	empty.Text = ""
	m.Blocks = append(m.Blocks[:1], Block{Paragraph: &empty}, m.Blocks[1])
	r, e := RenderPDF(context.Background(), m)
	if e != nil {
		t.Fatal(e)
	}
	check, e := InspectPDFBytes(context.Background(), r.Data, nil)
	if e != nil {
		t.Fatal(e)
	}
	seen := map[string]bool{}
	for _, f := range check.Issues {
		seen[f.Rule] = true
	}
	if !seen["pdf.orphan-heading"] || !seen["pdf.blank"] {
		t.Fatal("layout defects missed", check)
	}
}
