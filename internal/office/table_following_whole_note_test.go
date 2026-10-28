package office

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"codeberg.org/go-pdf/fpdf"
	"doc2govpdf/assets"
	readpdf "github.com/ledongthuc/pdf"
)

func wholeNoteWriter(t *testing.T) *pdfWriter {
	t.Helper()
	browserFontState(t)
	for name, data := range map[string][]byte{"Noto Serif SC": assets.FallbackFont, "Noto Serif SC Black": assets.FallbackBlackFont} {
		if err := RegisterFallbackFont(name, data, true); err != nil {
			t.Fatal(err)
		}
	}
	w := &pdfWriter{ctx: context.Background(), page: DefaultPage(), loaded: map[string]string{}, warnings: map[string]bool{}, newDocument: true}
	w.f = fpdf.New("P", "mm", "A4", "")
	return w
}

func wholeNoteModel(p Paragraph, related bool) Model {
	return Model{Page: DefaultPage(), Blocks: []Block{{Table: &Table{Widths: []float64{156}, Rows: []Row{{Cells: []Cell{{Span: 1, Paragraphs: []Paragraph{{ID: "related-cell", Text: "ROW", Font: "仿宋", Size: 14, KeepNext: related}}}}}}}}, {Paragraph: &p}}}
}

func TestTableFollowingWholeShortParagraphUsesExistingRelationAndMeasuredHeight(t *testing.T) {
	w := wholeNoteWriter(t)
	p := Paragraph{Text: strings.Repeat("甲", 100), Font: "仿宋", Size: 16, Line: 10, Before: 2, After: 3}
	m := wholeNoteModel(p, true)
	if full := w.paragraphHeight(p, 0); full != 45 || w.tableFollowingHeight(m, 0) != full {
		t.Fatal("four-line related paragraph was truncated to its opening", full, w.tableFollowingHeight(m, 0))
	}
	before, _ := json.Marshal(m)
	w.tableFollowingHeight(m, 0)
	after, _ := json.Marshal(m)
	if !bytes.Equal(before, after) {
		t.Fatal("measurement mutated authored model")
	}
	// The relationship is structural: no particular business words are required.
	m.Blocks[0].Table.Rows[0].Cells[0].Paragraphs[0].KeepNext = false
	m.Blocks[1].Paragraph.Text = "注：" + p.Text
	if w.tableFollowingHeight(m, 0) != 0 {
		t.Fatal("text guessed a relationship without the final-row flag")
	}
}

func TestTableFollowingWholeLongParagraphRetainsBoundedOpening(t *testing.T) {
	w := wholeNoteWriter(t)
	p := Paragraph{Text: strings.Repeat("甲", 800), Font: "仿宋", Size: 16, Line: 10}
	full := w.paragraphHeight(p, 0)
	if full <= (w.page.Height-w.page.Top-w.page.Bottom)/3 {
		t.Fatal("fixture is not a long paragraph", full)
	}
	if got := w.tableFollowingHeight(wholeNoteModel(p, true), 0); got != w.paragraphHeight(p, 2) || got >= full {
		t.Fatal("long text was bound as a complete unit", got, full)
	}
}

func TestTableFollowingWholeRespectsExplicitBreaksAndImportedPath(t *testing.T) {
	w := wholeNoteWriter(t)
	p := Paragraph{Text: strings.Repeat("甲", 100), Font: "仿宋", Size: 16, Line: 10}
	for _, kind := range []string{"page-before", "section", "anchored", "inside", "imported"} {
		m := wholeNoteModel(p, true)
		w.newDocument = true
		switch kind {
		case "page-before":
			m.Blocks[1].Paragraph.PageBreak = true
		case "section":
			pg := m.Page
			m.Blocks[1].Page = &pg
		case "anchored":
			m.Blocks[1].Paragraph.AnchorBottom = true
		case "inside":
			m.Blocks[1].Paragraph.BreakOffsets = []int{84}
		case "imported":
			w.newDocument = false
			m.SourceID = "original"
		}
		want := 0.0
		if kind == "inside" {
			want = w.paragraphHeight(*m.Blocks[1].Paragraph, 2)
		}
		if got := w.tableFollowingHeight(m, 0); got != want {
			t.Fatal("explicit source boundary changed", kind, got, want)
		}
	}
}

func wholeNotePDFPages(t *testing.T, data []byte) []string {
	t.Helper()
	r, err := readpdf.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatal(err)
	}
	pages := make([]string, r.NumPage())
	for i := 1; i <= r.NumPage(); i++ {
		var b strings.Builder
		for _, run := range r.Page(i).Content().Text {
			b.WriteString(run.S)
		}
		pages[i-1] = strings.Join(strings.Fields(b.String()), "")
	}
	return pages
}

// Geometry mechanism only; actual supplied-source acceptance is the optional
// test below and the normal browser/receiver workflow recorded separately.
func TestTableFollowingWholeKeepsFinalRowAndFourLineNoteOnNextPage(t *testing.T) {
	wholeNoteWriter(t)
	m := Model{Page: DefaultPage()}
	for i := 0; i < 14; i++ {
		m.Blocks = append(m.Blocks, Block{Paragraph: &Paragraph{ID: fmt.Sprint("blank", i), Font: "仿宋", Size: 16, Line: 10}})
	}
	rows := []Row{}
	for i, txt := range []string{"HEADER-BOUNDARY", "MIDDLE-BOUNDARY", "LAST-BOUNDARY"} {
		rows = append(rows, Row{Header: i == 0, Height: 20, Cells: []Cell{{Span: 1, Paragraphs: []Paragraph{{ID: fmt.Sprint("cell", i), Text: txt, Font: "仿宋", Size: 14, Line: 8, KeepNext: i == 0 || i == 2}}}}})
	}
	note := "NOTE-BEGIN " + strings.Repeat("甲", 80) + " NOTE-END"
	m.Blocks = append(m.Blocks, Block{Table: &Table{Rows: rows, Widths: []float64{156}, Borders: true}}, Block{Paragraph: &Paragraph{ID: "note", Text: note, Role: "body", Font: "仿宋", Size: 16, Line: 10}})
	before, _ := json.Marshal(m)
	result, err := RenderPDF(context.Background(), m)
	if err != nil {
		t.Fatal(err)
	}
	after, _ := json.Marshal(m)
	if !bytes.Equal(before, after) {
		t.Fatal("render changed authored data")
	}
	pages := wholeNotePDFPages(t, result.Data)
	if len(pages) != 2 || strings.Contains(pages[0], "LAST-BOUNDARY") || strings.Contains(pages[0], "NOTE-BEGIN") || !strings.Contains(pages[1], "HEADER-BOUNDARY") || !strings.Contains(pages[1], "LAST-BOUNDARY") || !strings.Contains(pages[1], strings.Join(strings.Fields(note), "")) {
		t.Fatal("last row, repeated header and complete note were separated")
	}
}

func TestTableFollowingWholeOversizedRelatedProseStillFlows(t *testing.T) {
	wholeNoteWriter(t)
	p := Paragraph{ID: "long-note", Text: "LONG-BEGIN " + strings.Repeat("甲", 1000) + " LONG-END", Font: "仿宋", Size: 16, Line: 10}
	m := wholeNoteModel(p, true)
	result, err := RenderPDF(context.Background(), m)
	if err != nil {
		t.Fatal(err)
	}
	pages := wholeNotePDFPages(t, result.Data)
	all := strings.Join(pages, "")
	if len(pages) < 2 || strings.Count(all, "甲") != 1000 || !strings.Contains(all, "LONG-BEGIN") || !strings.Contains(all, "LONG-END") {
		t.Fatal("long prose was clipped or forced into one page")
	}
}

func TestTableFollowingWholePreservesAuthoredInsidePageBreak(t *testing.T) {
	wholeNoteWriter(t)
	first := "BREAK-BEGIN" + strings.Repeat("甲", 25)
	p := Paragraph{ID: "explicit-break-note", Text: first + "BREAK-END", Font: "仿宋", Size: 16, Line: 10, BreakOffsets: []int{len(first)}}
	result, err := RenderPDF(context.Background(), wholeNoteModel(p, true))
	if err != nil {
		t.Fatal(err)
	}
	pages := wholeNotePDFPages(t, result.Data)
	if len(pages) != 2 || !strings.Contains(pages[0], "BREAK-BEGIN") || strings.Contains(pages[0], "BREAK-END") || !strings.Contains(pages[1], "BREAK-END") {
		t.Fatal("authored inside-paragraph page break was overridden")
	}
}

func TestTableFollowingWholeSuppliedHealthOriginal(t *testing.T) {
	sourcePath, modelPath, wordPath := os.Getenv("HEALTH_OFFICE_ORIGINAL"), os.Getenv("HEALTH_DIRECT_MODEL"), os.Getenv("HEALTH_SOURCE_WORD")
	if sourcePath == "" && modelPath == "" && wordPath == "" {
		t.Skip("supplied original and exact generated-model/Word are local-only; no invented acceptance fixture")
	}
	if sourcePath == "" || modelPath == "" || wordPath == "" {
		t.Fatal("all three exact local original paths are required")
	}
	wholeNoteWriter(t)
	read := func(path string) []byte {
		b, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		return b
	}
	hash := func(b []byte) string { return fmt.Sprintf("%x", sha256.Sum256(b)) }
	source, rawModel, word := read(sourcePath), read(modelPath), read(wordPath)
	if hash(source) != "7dbde2fe81d11c526d8fb73ab143f572e3481500575fb9c0b87b126b9e37972c" || hash(word) != "4c18c0d6740f536099ac4ec745d9fba865d063018df98520911b3727a01f29a1" {
		t.Fatal("not the supplied original/verified baseline Word")
	}
	var original struct {
		Content struct {
			Blocks []struct {
				Type, ID, Text string
				Rows           []struct{ Cells []struct{ Text string } }
			}
		}
	}
	if err := json.Unmarshal(source, &original); err != nil {
		t.Fatal(err)
	}
	var m Model
	if err := json.Unmarshal(rawModel, &m); err != nil {
		t.Fatal(err)
	}
	if m.SourceID != "" || len(original.Content.Blocks) != 39 {
		t.Fatal("expected exact normal-writer source model")
	}
	paragraphs := map[string]*Paragraph{}
	tables := []*Table{}
	for _, block := range m.Blocks {
		if block.Paragraph != nil {
			paragraphs[block.Paragraph.ID] = block.Paragraph
		}
		if block.Table != nil {
			tables = append(tables, block.Table)
		}
	}
	tableIndex := 0
	for _, block := range original.Content.Blocks {
		if block.Type == "paragraph" {
			p := paragraphs["writer-content-"+block.ID]
			if p == nil || p.Text != block.Text {
				t.Fatal("source paragraph/ID changed")
			}
		} else if block.Type == "table" {
			if tableIndex >= len(tables) {
				t.Fatal("source table missing")
			}
			tab := tables[tableIndex]
			tableIndex++
			if len(tab.Rows) != len(block.Rows) {
				t.Fatal("source row count changed")
			}
			for ri, row := range block.Rows {
				if len(tab.Rows[ri].Cells) != len(row.Cells) {
					t.Fatal("source columns changed")
				}
				for ci, cell := range row.Cells {
					parts := []string{}
					for _, p := range tab.Rows[ri].Cells[ci].Paragraphs {
						parts = append(parts, p.Text)
					}
					if strings.Join(parts, "\n") != cell.Text {
						t.Fatal("source cell text changed")
					}
				}
			}
		}
	}
	if tableIndex != 3 || len(tables) != 3 {
		t.Fatal("expected original three complete tables")
	}
	before, _ := json.Marshal(m)
	pdf, err := RenderPDF(context.Background(), m)
	if err != nil {
		t.Fatal(err)
	}
	after, _ := json.Marshal(m)
	if !bytes.Equal(before, after) {
		t.Fatal("render changed source model")
	}
	pages := wholeNotePDFPages(t, pdf.Data)
	norm := func(s string) string { return strings.Join(strings.Fields(s), "") }
	tail := original.Content.Blocks[37].Text
	sourceNote := original.Content.Blocks[38].Text
	if len(pages) != 7 || !strings.Contains(pages[5], norm(original.Content.Blocks[33].Text)) || strings.Contains(pages[5], norm(tail)[:12]) || !strings.Contains(pages[6], norm(tail)) || !strings.Contains(pages[6], norm(sourceNote)) {
		t.Fatal("supplied-source title/note/source page relation did not improve")
	}
	opened, err := Open(word)
	if err != nil {
		t.Fatal(err)
	}
	untouched, err := opened.Export(opened.Model, false)
	if err != nil || !bytes.Equal(untouched, word) {
		t.Fatal("untouched original Word changed", err)
	}
	generatedWord, err := CreateDOCX(m)
	if err != nil {
		t.Fatal(err)
	}
	report := map[string]any{"sourceSHA256": hash(source), "modelSHA256": hash(rawModel), "baselineWordSHA256": hash(word), "WordUnchanged": true, "newGeneratedWordSHA256": hash(generatedWord), "newGeneratedWordEqualsBaseline": bytes.Equal(generatedWord, word), "PDFSHA256": hash(pdf.Data), "pages": len(pages), "receiptTitlePage": 6, "completeNotePage": 7, "sourcePage": 7, "modelUnchanged": true}
	if out := os.Getenv("HEALTH_NOTE_OUT"); out != "" {
		if err := os.MkdirAll(out, 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(out, "original-A.pdf"), pdf.Data, 0600); err != nil {
			t.Fatal(err)
		}
		b, _ := json.MarshalIndent(report, "", "  ")
		if err := os.WriteFile(filepath.Join(out, "verification.local.json"), b, 0600); err != nil {
			t.Fatal(err)
		}
	}
	b, _ := json.Marshal(report)
	t.Log(string(b))
}
