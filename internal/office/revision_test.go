package office

import (
	"archive/zip"
	"bytes"
	"github.com/beevik/etree"
	"os"
	"testing"
)

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
