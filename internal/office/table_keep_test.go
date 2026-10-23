package office

import (
	"bytes"
	"codeberg.org/go-pdf/fpdf"
	"context"
	readpdf "github.com/ledongthuc/pdf"
	"strings"
	"testing"
)

func TestWriterTableKeepsFinalDataWithSummaryButDoesNotRewriteSource(t *testing.T) {
	for _, fresh := range []bool{true, false} {
		w := &pdfWriter{ctx: context.Background(), loaded: map[string]string{}, warnings: map[string]bool{}, newDocument: fresh, page: Page{Width: 210, Height: 297, Top: 37, Bottom: 35, Left: 28, Right: 26}}
		w.f = fpdf.New("P", "mm", "A4", "")
		w.f.SetAutoPageBreak(false, w.page.Bottom)
		w.newPage()
		w.y = 190
		rows := []Row{}
		for i, text := range []string{"HEAD", "A", "LAST", "TOTAL"} {
			rows = append(rows, Row{Header: i == 0, Height: 20, Cells: []Cell{{Span: 1, Paragraphs: []Paragraph{{Text: text, Font: "仿宋", Size: 14, Line: 8, KeepNext: i == 2}}}}})
		}
		if e := w.table(Table{Rows: rows, Widths: []float64{156}, Borders: true}); e != nil {
			t.Fatal(e)
		}
		var out bytes.Buffer
		if e := w.f.Output(&out); e != nil {
			t.Fatal(e)
		}
		reader, e := readpdf.NewReader(bytes.NewReader(out.Bytes()), int64(out.Len()))
		if e != nil {
			t.Fatal(e)
		}
		pages := []string{}
		for i := 1; i <= reader.NumPage(); i++ {
			var s strings.Builder
			for _, run := range reader.Page(i).Content().Text {
				s.WriteString(run.S)
			}
			pages = append(pages, s.String())
		}
		if len(pages) != 2 {
			t.Fatal(pages)
		}
		if fresh {
			if strings.Contains(pages[0], "LAST") || !strings.Contains(pages[1], "LAST") || !strings.Contains(pages[1], "TOTAL") {
				t.Fatal("final data/summary separated", pages)
			}
		} else if !strings.Contains(pages[0], "LAST") {
			t.Fatal("source layout unexpectedly rewritten", pages)
		}
	}
}
