package office

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestReviewCommentsPreserveTextAndExistingAnnotations(t *testing.T) {
	m := Plain("核对示例\n营业收入为100万元。\n营业收入为120万元。")
	b, e := CreateDOCX(m)
	if e != nil {
		t.Fatal(e)
	}
	notes := []ReviewComment{{ParagraphID: "p2", Text: "两处营业收入不同，请核对原始数据。"}}
	out, e := AddReviewComments(b, m, notes)
	if e != nil {
		t.Fatal(e)
	}
	p, e := Open(out)
	if e != nil {
		t.Fatal(e)
	}
	if p.Model.Text() != m.Text() {
		t.Fatal("comment changed body")
	}
	if !bytes.Contains(p.Parts["word/comments.xml"], []byte(notes[0].Text)) {
		t.Fatal("comment content missing")
	}
	if n := strings.Count(string(p.Parts["word/document.xml"]), "commentRangeStart"); n != 1 {
		t.Fatal("anchor missing", n)
	}
	again, e := AddReviewComments(out, p.Model, notes)
	if e != nil {
		t.Fatal(e)
	}
	if !bytes.Equal(again, out) {
		t.Fatal("duplicate comment appended")
	}
	next, e := AddReviewComments(out, p.Model, []ReviewComment{{ParagraphID: "p1", Text: "另一个定位。"}})
	if e != nil {
		t.Fatal(e)
	}
	q, e := Open(next)
	if e != nil {
		t.Fatal(e)
	}
	if strings.Count(string(q.Parts["word/document.xml"]), "commentRangeStart") != 2 {
		t.Fatal("old comment replaced")
	}
	if !bytes.Equal(p.Parts["word/styles.xml"], q.Parts["word/styles.xml"]) {
		t.Fatal("unrelated style changed")
	}
	if folder := os.Getenv("DOC2GOVPDF_EXTENDED_AUDIT"); folder != "" {
		dir := filepath.Join(folder, "word-comments")
		os.MkdirAll(dir, 0700)
		os.WriteFile(filepath.Join(dir, "document.docx"), next, 0600)
	}
}
