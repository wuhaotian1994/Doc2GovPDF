package office

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestUpstreamRoundTrip(t *testing.T) {
	files, e := filepath.Glob("../../testdata/upstream/gongwen-kit/docx/*.docx")
	if e != nil || len(files) != 7 {
		t.Fatal("seven upstream fixtures required")
	}
	for _, file := range files {
		t.Run(filepath.Base(file), func(t *testing.T) {
			b, e := os.ReadFile(file)
			if e != nil {
				t.Fatal(e)
			}
			p, e := Open(b)
			if e != nil {
				t.Fatal(e)
			}
			if len(p.Model.Paragraphs()) < 5 {
				t.Fatal("missing paragraphs")
			}
			out, e := p.Export(p.Model, true)
			if e != nil {
				t.Fatal(e)
			}
			if !bytes.Equal(b, out) {
				t.Fatal("unchanged import was rewritten")
			}
			model := p.Model
			for _, r := range model.Paragraphs() {
				if !r.Protected && strings.TrimSpace(r.Text) != "" {
					r.Text += "（测试修订）"
					break
				}
			}
			out, e = p.Export(model, true)
			if e != nil {
				t.Fatal(e)
			}
			next, e := Open(out)
			if e != nil {
				t.Fatal(e)
			}
			if !strings.Contains(next.Model.Text(), "测试修订") {
				t.Fatal("revision missing")
			}
			for key, v := range p.Parts {
				if key != "word/document.xml" && !bytes.Equal(v, next.Parts[key]) {
					t.Fatalf("unrelated part changed: %s", key)
				}
			}
		})
	}
}
func TestRejectMalformedPackage(t *testing.T) {
	if _, e := Open([]byte("not a zip")); e == nil {
		t.Fatal("invalid DOCX accepted")
	}
}

func TestHeaderEditingPreservesBody(t *testing.T) {
	b, e := os.ReadFile("../../testdata/upstream/gongwen-kit/docx/公文信函.docx")
	if e != nil {
		t.Fatal(e)
	}
	p, e := Open(b)
	if e != nil {
		t.Fatal(e)
	}
	m := p.Model.Clone()
	if len(m.FirstHeader) == 0 {
		t.Fatal("missing first-page letterhead")
	}
	m.FirstHeader[0].Text = "示例机关办公室"
	out, e := p.Export(m, true)
	if e != nil {
		t.Fatal(e)
	}
	next, e := Open(out)
	if e != nil {
		t.Fatal(e)
	}
	if next.Model.FirstHeader[0].Text != "示例机关办公室" {
		t.Fatal("header edit missing")
	}
	if !bytes.Equal(p.Parts["word/document.xml"], next.Parts["word/document.xml"]) {
		t.Fatal("header-only edit rewrote body")
	}
}
