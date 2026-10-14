package office

import (
	"fmt"
	"testing"
)

func numericTable(total string) Block {
	rows := [][]string{{"项目", "金额（元）"}, {"项目甲", "1000"}, {"项目乙", "2000"}, {"合计", total}}
	table := &Table{Widths: []float64{78, 78}, Borders: true}
	for i, row := range rows {
		r := Row{Header: i == 0}
		for j, text := range row {
			r.Cells = append(r.Cells, Cell{Span: 1, Paragraphs: []Paragraph{{ID: fmt.Sprintf("t%d_%d", i, j), Text: text, Role: "body", Size: 14, Font: "仿宋", Line: 8, Align: "left"}}})
		}
		table.Rows = append(table.Rows, r)
	}
	return Block{Table: table}
}
func TestTotalsUseExactAmountsNotRelativeTolerance(t *testing.T) {
	m := Plain("统计表\n正文")
	m.Blocks = append(m.Blocks, numericTable("3001"))
	r, e := Inspect(m)
	if e != nil {
		t.Fatal(e)
	}
	found := false
	for _, f := range r.Issues {
		if f.Rule == "number.table-total" {
			found = true
			if f.Replacement != "" {
				t.Fatal("number auto-fixed")
			}
		}
	}
	if !found {
		t.Fatal("one-unit error not caught")
	}
	m.Blocks[len(m.Blocks)-1] = numericTable("3000")
	r, _ = Inspect(m)
	for _, f := range r.Issues {
		if f.Rule == "number.table-total" || f.Rule == "format.size" {
			t.Fatalf("false positive: %+v", f)
		}
	}
}
func TestMetricPeriodsAndQuotes(t *testing.T) {
	m := Plain("统计\n2025年营业收入为100万元。\n2026年营业收入为200万元。\n引用“营业收入为300万元”。")
	r, _ := Inspect(m)
	for _, f := range r.Issues {
		if f.Rule == "number.repeated-metric" {
			t.Fatal("different periods or quotes compared")
		}
	}
	m = Plain("统计\n营业收入为100万元。\n营业收入为200万元。")
	r, _ = Inspect(m)
	for _, f := range r.Issues {
		if f.Rule == "number.repeated-metric" {
			return
		}
	}
	t.Fatal("repeated metric mismatch missing")
}
