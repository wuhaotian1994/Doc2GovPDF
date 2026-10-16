package office

import (
	"archive/zip"
	"bytes"
	"github.com/beevik/etree"
	"os"
	"strings"
	"testing"
)

func assertValidOwnRevisionMarkup(t *testing.T, p *Package) {
	t.Helper()
	seen := map[string]bool{}
	for name, data := range p.Parts {
		if !strings.HasSuffix(name, ".xml") {
			continue
		}
		d, e := parseXML(data)
		if e != nil {
			t.Fatal(e)
		}
		for _, tag := range []string{"ins", "del", "pPrChange", "rPrChange", "sectPrChange"} {
			for _, n := range descendants(d.Root(), tag) {
				if attr(n, "author") != "Doc2GovPDF" {
					continue
				}
				id := attr(n, "id")
				if seen[id] {
					t.Fatalf("duplicate own revision ID %s in %s", id, name)
				}
				seen[id] = true
				if tag == "del" && len(descendants(n, "t")) > 0 {
					t.Fatal("deleted text was not serialized as delText")
				}
			}
		}
	}
}

func rejectOwnChanges(d *etree.Document) {
	root := d.Root()
	for _, tag := range []string{"pPrChange", "rPrChange"} {
		for _, change := range descendants(root, tag) {
			if attr(change, "author") != "Doc2GovPDF" {
				continue
			}
			parent := change.Parent()
			if parent == nil {
				continue
			}
			old := child(change, parent.Tag)
			if old == nil {
				continue
			}
			grand := parent.Parent()
			grand.InsertChildAt(parent.Index(), old.Copy())
			grand.RemoveChild(parent)
		}
	}
	for _, ins := range descendants(root, "ins") {
		if attr(ins, "author") == "Doc2GovPDF" {
			ins.Parent().RemoveChild(ins)
		}
	}
	for _, del := range descendants(root, "del") {
		if attr(del, "author") != "Doc2GovPDF" {
			continue
		}
		for _, text := range descendants(del, "delText") {
			text.Tag = "t"
		}
		parent := del.Parent()
		at := del.Index()
		for _, c := range del.ChildElements() {
			parent.InsertChildAt(at, c.Copy())
			at++
		}
		parent.RemoveChild(del)
	}
}
func TestRejectOurRevisionsRestoresOriginalText(t *testing.T) {
	data, e := os.ReadFile("../../testdata/upstream/gongwen-kit/docx/公文通知.docx")
	if e != nil {
		t.Fatal(e)
	}
	source, e := Open(data)
	if e != nil {
		t.Fatal(e)
	}
	m := source.Model.Clone()
	for _, p := range m.Paragraphs() {
		if !p.Protected && p.Text != "" {
			p.Text += "（修改验证）"
			p.Size = 18
			break
		}
	}
	out, e := source.Export(m, true)
	if e != nil {
		t.Fatal(e)
	}
	edited, e := Open(out)
	if e != nil {
		t.Fatal(e)
	}
	assertValidOwnRevisionMarkup(t, edited)
	rejectOwnChanges(edited.XML)
	restoredXML, e := edited.XML.WriteToBytes()
	if e != nil {
		t.Fatal(e)
	}
	var zipBytes bytes.Buffer
	writer := zip.NewWriter(&zipBytes)
	for name, data := range edited.Parts {
		if name == "word/document.xml" {
			data = restoredXML
		}
		part, e := writer.Create(name)
		if e != nil {
			t.Fatal(e)
		}
		part.Write(data)
	}
	writer.Close()
	restored, e := Open(zipBytes.Bytes())
	if e != nil {
		t.Fatal(e)
	}
	if restored.Model.Text() != source.Model.Text() {
		t.Fatal("rejecting application revisions did not restore the original text")
	}
}

func TestBodyAndHeaderShareUniqueRevisionIDs(t *testing.T) {
	m, e := NewDocument(Fields{Kind: "letter", Letterhead: true, Agency: "示例单位", Title: "关于核对资料的函", Body: "原始正文。"})
	if e != nil {
		t.Fatal(e)
	}
	b, e := CreateDOCX(m)
	if e != nil {
		t.Fatal(e)
	}
	p, e := Open(b)
	if e != nil {
		t.Fatal(e)
	}
	next := p.Model.Clone()
	next.FirstHeader[0].Text = "示例办公室"
	for _, q := range next.Paragraphs() {
		if q.Role == "title" {
			q.Text += "（修订）"
			q.Size = 20
			break
		}
	}
	out, e := p.Export(next, true)
	if e != nil {
		t.Fatal(e)
	}
	fixed, e := Open(out)
	if e != nil {
		t.Fatal(e)
	}
	assertValidOwnRevisionMarkup(t, fixed)
}
