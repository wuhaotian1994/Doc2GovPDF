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
)

func TestTableNoteKeepLinesBoundedProjectionDoesNotMutateOriginal(t *testing.T) {
	wholeNoteWriter(t)
	base := Paragraph{ID: "note", Text: strings.Repeat("甲", 100), Font: "仿宋", Size: 16, Line: 10}
	for _, kind := range []string{"related", "unrelated", "long", "hard-break", "page-before", "section", "imported"} {
		t.Run(kind, func(t *testing.T) {
			m := wholeNoteModel(base, kind != "unrelated")
			switch kind {
			case "long":
				m.Blocks[1].Paragraph.Text = strings.Repeat("甲", 1000)
			case "hard-break":
				m.Blocks[1].Paragraph.BreakOffsets = []int{30}
			case "page-before":
				m.Blocks[1].Paragraph.PageBreak = true
			case "section":
				pg := m.Page
				m.Blocks[1].Page = &pg
			case "imported":
				m.SourceID = "native"
			}
			before, _ := json.Marshal(m)
			prepared := prepareNewLayout(m)
			if prepared.Blocks[1].Paragraph.KeepLines != (kind == "related") {
				t.Fatal("unexpected keepLines projection", kind)
			}
			after, _ := json.Marshal(m)
			if !bytes.Equal(before, after) {
				t.Fatal("author model mutated")
			}
		})
	}
}

func TestTableNoteKeepLinesEffectiveOnOffAndWordXML(t *testing.T) {
	for _, value := range []string{"", ` w:val="true"`, ` w:val="1"`, ` w:val="false"`, ` w:val="0"`, ` w:val="off"`} {
		tree, e := parseXML([]byte(`<w:pPr xmlns:w="` + W + `"><w:keepLines` + value + `/></w:pPr>`))
		if e != nil {
			t.Fatal(e)
		}
		p := Paragraph{KeepLines: true}
		applyProps(&p, tree.Root(), nil)
		want := !strings.Contains(value, "false") && !strings.Contains(value, `"0"`) && !strings.Contains(value, "off")
		if p.KeepLines != want {
			t.Fatal("effective on/off lost", value)
		}
		if strings.Contains(paragraphXML(p), "<w:keepLines/>") != want {
			t.Fatal("Word keepLines emission wrong")
		}
	}
}

func TestTableNoteKeepLinesImportedPDFRespectsWholeShortAndLongBreaks(t *testing.T) {
	wholeNoteWriter(t)
	for _, kind := range []string{"short", "long", "hard-break"} {
		t.Run(kind, func(t *testing.T) {
			m := Model{SourceID: "explicit-native", Page: DefaultPage()}
			for i := 0; i < 19; i++ {
				m.Blocks = append(m.Blocks, Block{Paragraph: &Paragraph{ID: fmt.Sprint("blank", i), Font: "仿宋", Size: 16, Line: 10}})
			}
			p := Paragraph{ID: "native-note", Text: strings.Repeat("甲", 100), Font: "仿宋", Size: 16, Line: 10, KeepLines: true}
			if kind == "long" {
				p.Text = strings.Repeat("甲", 1000)
			}
			if kind == "hard-break" {
				p.BreakOffsets = []int{30}
			}
			m.Blocks = append(m.Blocks, Block{Paragraph: &p})
			pdf, e := RenderPDF(context.Background(), m)
			if e != nil {
				t.Fatal(e)
			}
			pages := wholeNotePDFPages(t, pdf.Data)
			if len(pages) < 2 {
				t.Fatal("expected continuation")
			}
			if kind == "short" && (strings.Contains(pages[0], "甲") || strings.Count(pages[1], "甲") != 100) {
				t.Fatal("explicit imported keepLines was not honored")
			}
			if kind == "long" && strings.Count(strings.Join(pages, ""), "甲") != 1000 {
				t.Fatal("long prose clipped")
			}
			if kind == "hard-break" && (!strings.Contains(pages[0], "甲") || !strings.Contains(pages[1], "甲")) {
				t.Fatal("hard break overridden")
			}
		})
	}
}

func TestTableNoteKeepLinesSuppliedWordOnlyAddsBoundedProperty(t *testing.T) {
	modelPath, wordPath := os.Getenv("HEALTH_DIRECT_MODEL"), os.Getenv("HEALTH_SOURCE_WORD")
	if modelPath == "" && wordPath == "" {
		t.Skip("exact local supplied model and baseline Word required")
	}
	wholeNoteWriter(t)
	raw, e := os.ReadFile(modelPath)
	if e != nil {
		t.Fatal(e)
	}
	var m Model
	if e = json.Unmarshal(raw, &m); e != nil {
		t.Fatal(e)
	}
	baseline, e := os.ReadFile(wordPath)
	if e != nil {
		t.Fatal(e)
	}
	if fmt.Sprintf("%x", sha256.Sum256(baseline)) != "4c18c0d6740f536099ac4ec745d9fba865d063018df98520911b3727a01f29a1" {
		t.Fatal("wrong supplied baseline")
	}
	before, _ := json.Marshal(m)
	generated, e := CreateDOCX(m)
	if e != nil {
		t.Fatal(e)
	}
	original, e := Open(baseline)
	if e != nil {
		t.Fatal(e)
	}
	opened, e := Open(generated)
	if e != nil {
		t.Fatal(e)
	}
	count := bytes.Count(opened.Parts["word/document.xml"], []byte("<w:keepLines/>"))
	if count == 0 {
		t.Fatal("no bounded note keepLines emitted")
	}
	for name, data := range original.Parts {
		next := opened.Parts[name]
		if name == "word/document.xml" {
			next = bytes.ReplaceAll(next, []byte("<w:keepLines/>"), nil)
		}
		if !bytes.Equal(data, next) {
			t.Fatal("change beyond keepLines", name)
		}
	}
	same, e := opened.Export(opened.Model, false)
	if e != nil || !bytes.Equal(same, generated) {
		t.Fatal("new native Word byte preservation failed", e)
	}
	same, e = original.Export(original.Model, false)
	if e != nil || !bytes.Equal(same, baseline) {
		t.Fatal("original Word protection failed", e)
	}
	after, _ := json.Marshal(m)
	if !bytes.Equal(before, after) {
		t.Fatal("author model mutated")
	}
	if out := os.Getenv("HEALTH_NOTE_OUT"); out != "" {
		if e = os.WriteFile(filepath.Join(out, "original-A.docx"), generated, 0600); e != nil {
			t.Fatal(e)
		}
	}
	t.Logf("only property additions=%d Word SHA256=%x; original byte exact and author model unchanged", count, sha256.Sum256(generated))
}
