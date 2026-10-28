package office

import (
	"bytes"
	"context"
	"encoding/json"
	"strings"
	"testing"
	"unicode/utf8"

	"golang.org/x/image/font/gofont/goregular"
)

func TestMissingGlyphContextIsBoundedExactAndUnicodeSafe(t *testing.T) {
	for _, text := range []string{"甲", "前 甲 後", strings.Repeat("左", 100) + "甲" + strings.Repeat("右", 100), "前\n甲\t後", "甲甲後"} {
		got := missingGlyphContext(text, '甲')
		exact := strings.TrimPrefix(strings.TrimSuffix(got, "…"), "…")
		if !utf8.ValidString(got) || len([]rune(got)) > 19 || !strings.Contains(text, exact) || !strings.Contains(got, "甲") {
			t.Fatal("context changed spelling or exceeded bound")
		}
	}
	if missingGlyphContext("文字", '甲') != "" {
		t.Fatal("invented missing context")
	}
}

func TestSelectedFontCoverageFallbackHasDistinctCauseAndWholeUnitContext(t *testing.T) {
	wholeNoteWriter(t)
	if e := RegisterFont("仿宋", goregular.TTF); e != nil {
		t.Fatal(e)
	}
	for _, kind := range []string{"paragraph", "cell"} {
		t.Run(kind, func(t *testing.T) {
			p := Paragraph{ID: "unit", Text: "A甲B", Font: "仿宋", Size: 16, Line: 10}
			m := Model{SourceID: "mechanism", Page: DefaultPage()}
			if kind == "cell" {
				m.Blocks = []Block{{Table: &Table{Widths: []float64{156}, Rows: []Row{{Cells: []Cell{{Span: 1, Paragraphs: []Paragraph{p}}}}}}}}
			} else {
				m.Blocks = []Block{{Paragraph: &p}}
			}
			before, _ := json.Marshal(m)
			result, e := RenderPDF(context.Background(), m)
			if e != nil {
				t.Fatal(e)
			}
			after, _ := json.Marshal(m)
			if !bytes.Equal(before, after) {
				t.Fatal("changed source")
			}
			warning := strings.Join(result.Warnings, " ")
			if !strings.Contains(warning, "已读取的字体“Go”") || !strings.Contains(warning, "U+7532") || !strings.Contains(warning, "例如“A甲B”") || !strings.Contains(warning, "整体") {
				t.Fatal("missing coverage context", warning)
			}
			if strings.Contains(warning, "未取得可用字体“仿宋”") {
				t.Fatal("loaded face falsely reported unavailable", warning)
			}
		})
	}
}

func TestSelectedFontAvailableOrUnknownFamilyWarningsRemainAccurate(t *testing.T) {
	w := wholeNoteWriter(t)
	if e := RegisterFont("仿宋", goregular.TTF); e != nil {
		t.Fatal(e)
	}
	w.setFont(Paragraph{Text: "ABC", Font: "仿宋", Size: 16})
	if w.faceName != "仿宋" || len(w.warnings) != 0 {
		t.Fatal("covered selected font was replaced", w.warnings)
	}
	w.setFont(Paragraph{Text: "甲", Font: "not-installed-family", Size: 16})
	if !strings.Contains(strings.Join(mapWarningKeys(w.warnings), " "), "未取得可用字体“not-installed-family”") {
		t.Fatal("unknown family cause suppressed", w.warnings)
	}
}

func TestMissingFromSelectedAndFallbackAsksForCoveringFontWithoutChangingText(t *testing.T) {
	w := wholeNoteWriter(t)
	if e := RegisterFont("仿宋", goregular.TTF); e != nil {
		t.Fatal(e)
	}
	p := Paragraph{ID: "missing-unit", Text: "A\U0010fffdZ", Font: "仿宋", Size: 16}
	if missingGlyph("仿宋", p.Text) == 0 || missingGlyph("Noto Serif SC", p.Text) == 0 {
		t.Fatal("mechanism character unexpectedly covered")
	}
	w.setFont(p)
	e := w.f.Error()
	if e == nil {
		t.Fatal("unrenderable text accepted")
	}
	message := e.Error()
	if !strings.Contains(message, "U+10FFFD") || !strings.Contains(message, "原文“A\U0010fffdZ”") || !strings.Contains(message, "请选择可覆盖原文的字体") || strings.Contains(message, "调整该字符") || strings.Contains(message, "删") {
		t.Fatal("wrong recovery action", message)
	}
	if p.Text != "A\U0010fffdZ" {
		t.Fatal("input changed")
	}
	_, e = RenderPDF(context.Background(), Model{SourceID: "mechanism", Page: DefaultPage(), Blocks: []Block{{Paragraph: &p}}})
	if e == nil || !strings.Contains(e.Error(), "请选择可覆盖原文的字体") {
		t.Fatal("render failure lost the recovery action", e)
	}
}

func mapWarningKeys(m map[string]bool) []string {
	out := []string{}
	for k := range m {
		out = append(out, k)
	}
	return out
}

func TestCoverageWarningDeduplicatesMeasurementByRequestedFaceAndScope(t *testing.T) {
	w := wholeNoteWriter(t)
	if e := RegisterFont("仿宋", goregular.TTF); e != nil {
		t.Fatal(e)
	}
	if e := AliasRegisteredFont("楷体", "仿宋"); e != nil {
		t.Fatal(e)
	}
	for i := 0; i < 30; i++ {
		w.setFont(Paragraph{Text: "A甲B", Font: "仿宋", Size: 16})
		w.setFont(Paragraph{Text: "C乙D", Font: "仿宋", Size: 16})
	}
	if len(w.warnings) != 1 {
		t.Fatal("measurement became multiple affected-paragraph warnings", len(w.warnings))
	}
	warning := strings.Join(mapWarningKeys(w.warnings), " ")
	if !strings.Contains(warning, "例如“A甲B”") || strings.Contains(warning, "C乙D") {
		t.Fatal("representative context was not first", warning)
	}
	w.setFont(Paragraph{Text: "C乙D", Font: "楷体", Size: 16})
	if len(w.warnings) != 2 {
		t.Fatal("distinct requested purpose lost its example")
	}
	for i := 0; i < 12; i++ {
		w.setFont(Paragraph{Text: "A甲B", Font: "仿宋", Size: 14, Role: "page-number"})
		w.setFont(Paragraph{Text: "C乙D", Font: "仿宋", Size: 14, Role: "page-number"})
	}
	if len(w.warnings) != 3 {
		t.Fatal("repeated footer examples were not bounded")
	}
	footer := 0
	for text := range w.warnings {
		if strings.Contains(text, "当前页码整体") {
			footer++
		}
	}
	if footer != 1 {
		t.Fatal("page number scope was not identified once")
	}
}
