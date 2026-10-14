package office

import (
	"bytes"
	"os"
	"strings"
	"testing"
)

func TestFormatRepairKeepsUnrelatedParts(t *testing.T) {
	b, e := os.ReadFile("../../testdata/upstream/gongwen-kit/docx/企业内部报告.docx")
	if e != nil {
		t.Fatal(e)
	}
	p, e := Open(b)
	if e != nil {
		t.Fatal(e)
	}
	m := NormalizeLayout(p.Model)
	for _, para := range m.Paragraphs() {
		if para.Role == "body" && !para.Protected && strings.TrimSpace(para.Text) != "" {
			para.Size = 18
			break
		}
	}
	out, e := p.Export(m, true)
	if e != nil {
		t.Fatal(e)
	}
	next, e := Open(out)
	if e != nil {
		t.Fatal(e)
	}
	if !bytes.Contains(next.Parts["word/document.xml"], []byte("rPrChange")) {
		t.Fatal("format revision missing")
	}
	if next.Model.Text() != p.Model.Text() {
		t.Fatal("format repair changed text")
	}
	for key, v := range p.Parts {
		if key != "word/document.xml" && !bytes.Equal(v, next.Parts[key]) {
			t.Fatal("unrelated part changed")
		}
	}
}
