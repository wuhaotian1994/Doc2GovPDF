package office

import (
	"bytes"
	"context"
	"fmt"
	"strings"
	"testing"

	readpdf "github.com/ledongthuc/pdf"
)

// Small geometry probes are regression tests. Acceptance of the reported
// receipt uses the supplied, unchanged original through the normal writer UI.
func TestFinalTableRowKeepsRelatedNoteOpeningWithoutBindingWholeTable(t *testing.T) {
	for _, fresh := range []bool{true, false} {
		m := Model{Page: DefaultPage(), Blocks: []Block{}}
		if !fresh {
			m.SourceID = "original"
		}
		for i := 0; i < 13; i++ {
			m.Blocks = append(m.Blocks, Block{Paragraph: &Paragraph{ID: fmt.Sprint("blank", i), Text: "", Font: "仿宋", Size: 16, Line: 10}})
		}
		rows := []Row{}
		for i, text := range []string{"HEAD", "FIRST", "LAST"} {
			rows = append(rows, Row{Header: i == 0, Height: 30, Cells: []Cell{{Span: 1, Paragraphs: []Paragraph{{ID: fmt.Sprint("cell", i), Text: text, Font: "仿宋", Size: 14, Line: 8, KeepNext: i == 0 || i == 2}}}}})
		}
		m.Blocks = append(m.Blocks, Block{Table: &Table{Rows: rows, Widths: []float64{156}, Borders: true}}, Block{Paragraph: &Paragraph{ID: "note", Text: "RELATED NOTE", Font: "仿宋", Size: 16, Line: 10}})
		r, e := RenderPDF(context.Background(), m)
		if e != nil {
			t.Fatal(e)
		}
		reader, e := readpdf.NewReader(bytes.NewReader(r.Data), int64(len(r.Data)))
		if e != nil {
			t.Fatal(e)
		}
		pages := []string{}
		for i := 1; i <= reader.NumPage(); i++ {
			var out strings.Builder
			for _, run := range reader.Page(i).Content().Text {
				out.WriteString(run.S)
			}
			pages = append(pages, out.String())
		}
		if len(pages) != 2 {
			t.Fatalf("unexpected pages: %v", pages)
		}
		if fresh {
			if !strings.Contains(pages[0], "FIRST") || strings.Contains(pages[0], "LAST") || !strings.Contains(pages[1], "LAST") || !strings.Contains(pages[1], "RELATED NOTE") {
				t.Fatalf("table/note relation lost: %v", pages)
			}
		} else if !strings.Contains(pages[0], "LAST") || strings.Contains(pages[0], "RELATED NOTE") {
			t.Fatalf("imported source pagination changed: %v", pages)
		}
	}
}

func TestTwoRowTableKeepsHeaderWithFinalRowAndFollowingNote(t *testing.T) {
	m := Model{Page: DefaultPage()}
	for i := 0; i < 18; i++ {
		m.Blocks = append(m.Blocks, Block{Paragraph: &Paragraph{ID: fmt.Sprint("blank", i), Text: "", Font: "仿宋", Size: 16, Line: 10}})
	}
	tblock := Table{Widths: []float64{156}, Borders: true}
	for i, text := range []string{"HEAD", "LAST"} {
		tblock.Rows = append(tblock.Rows, Row{Header: i == 0, Height: 20, Cells: []Cell{{Span: 1, Paragraphs: []Paragraph{{ID: fmt.Sprint("cell", i), Text: text, Font: "仿宋", Size: 14, Line: 8, KeepNext: true}}}}})
	}
	m.Blocks = append(m.Blocks, Block{Table: &tblock}, Block{Paragraph: &Paragraph{ID: "note", Text: "RELATED NOTE", Font: "仿宋", Size: 16, Line: 10}})
	r, e := RenderPDF(context.Background(), m)
	if e != nil {
		t.Fatal(e)
	}
	reader, e := readpdf.NewReader(bytes.NewReader(r.Data), int64(len(r.Data)))
	if e != nil {
		t.Fatal(e)
	}
	if reader.NumPage() != 2 {
		t.Fatal("unexpected page count", reader.NumPage())
	}
	var first, second strings.Builder
	for _, run := range reader.Page(1).Content().Text {
		first.WriteString(run.S)
	}
	for _, run := range reader.Page(2).Content().Text {
		second.WriteString(run.S)
	}
	if strings.Contains(first.String(), "HEAD") || !strings.Contains(second.String(), "HEAD") || !strings.Contains(second.String(), "LAST") || !strings.Contains(second.String(), "RELATED NOTE") {
		t.Fatal("two-row table header orphaned", first.String(), second.String())
	}
}

func TestCompactTableAndNoteCarryTheLeadInAsOneMeasuredUnit(t *testing.T) {
	m := Model{Page: DefaultPage()}
	for i := 0; i < 17; i++ {
		m.Blocks = append(m.Blocks, Block{Paragraph: &Paragraph{ID: fmt.Sprint("blank", i), Text: "", Font: "仿宋", Size: 16, Line: 10}})
	}
	m.Blocks = append(m.Blocks, Block{Paragraph: &Paragraph{ID: "lead", Text: "TABLE LABEL", Role: "body", Font: "仿宋", Size: 16, Line: 10, KeepNext: true}})
	tblock := Table{Widths: []float64{156}, Borders: true}
	for i, text := range []string{"HEAD", "FIRST", "LAST"} {
		tblock.Rows = append(tblock.Rows, Row{Header: i == 0, Cells: []Cell{{Span: 1, Paragraphs: []Paragraph{{ID: fmt.Sprint("cell", i), Text: text, Font: "仿宋", Size: 14, Line: 8, KeepNext: i == 0 || i == 2}}}}})
	}
	m.Blocks = append(m.Blocks, Block{Table: &tblock}, Block{Paragraph: &Paragraph{ID: "note", Text: "RELATED NOTE", Font: "仿宋", Size: 16, Line: 10}})
	prepared := prepareNewLayout(m)
	if !prepared.Blocks[18].Table.Rows[1].Cells[0].Paragraphs[0].KeepNext {
		t.Fatal("Word preparation did not retain compact row relation")
	}
	if m.Blocks[18].Table.Rows[1].Cells[0].Paragraphs[0].KeepNext {
		t.Fatal("draft mutated")
	}
	r, e := RenderPDF(context.Background(), m)
	if e != nil {
		t.Fatal(e)
	}
	reader, e := readpdf.NewReader(bytes.NewReader(r.Data), int64(len(r.Data)))
	if e != nil {
		t.Fatal(e)
	}
	if reader.NumPage() != 2 {
		t.Fatal("unexpected pages", reader.NumPage())
	}
	var first, second strings.Builder
	for _, run := range reader.Page(1).Content().Text {
		first.WriteString(run.S)
	}
	for _, run := range reader.Page(2).Content().Text {
		second.WriteString(run.S)
	}
	for _, token := range []string{"TABLE LABEL", "HEAD", "FIRST", "LAST", "RELATED NOTE"} {
		if strings.Contains(first.String(), token) || !strings.Contains(second.String(), token) {
			t.Fatal("compact unit separated", token, first.String(), second.String())
		}
	}
}
