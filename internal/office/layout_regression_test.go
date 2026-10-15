package office

import (
	"archive/zip"
	"bytes"
	"encoding/binary"
	"io"
	"strings"
	"testing"
)

func TestFallbackFacesAreStaticAndUseIntendedWeights(t *testing.T) {
	fontCatalog()
	for name, weight := range map[string]uint16{"Noto Serif SC": 400, "Noto Serif SC Black": 900} {
		data := fonts[name].data
		found := false
		for i := 0; i < int(binary.BigEndian.Uint16(data[4:6])); i++ {
			at := 12 + i*16
			tag := string(data[at : at+4])
			if tag == "fvar" {
				t.Fatal("variable fallback reached renderer")
			}
			if tag == "OS/2" {
				offset := int(binary.BigEndian.Uint32(data[at+8 : at+12]))
				if binary.BigEndian.Uint16(data[offset+4:offset+6]) != weight {
					t.Fatal("incorrect fallback weight", name)
				}
				found = true
			}
		}
		if !found {
			t.Fatal("font metadata missing")
		}
	}
}
func TestNewDocumentTableWidthsAndMixedArticleFonts(t *testing.T) {
	m, e := NewDocument(Fields{Kind: "rules", Title: "示例事项管理办法", Body: "第一章 总则\n第一条 依法做好材料核对工作。"})
	if e != nil {
		t.Fatal(e)
	}
	m.Blocks = append(m.Blocks, Block{Table: &Table{Widths: []float64{40, 116}, Borders: true, BorderStyle: "three-line", Rows: []Row{{Header: true, Cells: []Cell{{Span: 1, Paragraphs: []Paragraph{{ID: "c1", Text: "项目", Font: "仿宋", Size: 14, Line: 7}}}, {Span: 1, Paragraphs: []Paragraph{{ID: "c2", Text: "数量", Font: "仿宋", Size: 14, Line: 7}}}}}}}})
	b, e := CreateDOCX(m)
	if e != nil {
		t.Fatal(e)
	}
	z, e := zip.NewReader(bytes.NewReader(b), int64(len(b)))
	if e != nil {
		t.Fatal(e)
	}
	var doc string
	for _, f := range z.File {
		if f.Name == "word/document.xml" {
			r, _ := f.Open()
			raw, _ := io.ReadAll(r)
			r.Close()
			doc = string(raw)
		}
	}
	for _, required := range []string{`w:type="fixed"`, `<w:tcW`, `<w:cantSplit`, `第一条`, `依法做好材料核对工作。`} {
		if !strings.Contains(doc, required) {
			t.Fatal("missing layout data", required)
		}
	}
	d, e := Open(b)
	if e != nil {
		t.Fatal(e)
	}
	if !strings.Contains(d.Model.Text(), "第一条 依法做好材料核对工作。") {
		t.Fatal("article text changed")
	}
}
