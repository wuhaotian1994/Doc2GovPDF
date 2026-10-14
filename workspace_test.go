package main

import (
	"context"
	"doc2govpdf/internal/office"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWorkspaceImportRecoveryAndExport(t *testing.T) {
	a := &App{ctx: context.Background(), draftDir: t.TempDir()}
	files, _ := filepath.Glob("testdata/upstream/gongwen-kit/docx/*.docx")
	for _, file := range files {
		w, e := a.OpenWorkspacePath(file)
		if e != nil {
			t.Fatal(e)
		}
		if e = a.SaveWorkspace(w); e != nil {
			t.Fatal(e)
		}
		restored, e := a.GetWorkspace()
		if e != nil {
			t.Fatal(e)
		}
		if restored.Document.Text() != w.Document.Text() {
			t.Fatal("draft lost structure")
		}
		out, e := a.docxBytes(restored.Document, true)
		if e != nil {
			t.Fatal(e)
		}
		source, _ := os.ReadFile(file)
		if string(out) != string(source) {
			t.Fatal("unmodified original changed")
		}
	}
}
func TestWorkspaceNewDocumentAndPDF(t *testing.T) {
	a := &App{ctx: context.Background(), draftDir: t.TempDir()}
	m, e := office.NewDocument(office.Fields{Kind: "notice", Title: "测试通知", Body: "正文内容。", Agency: "测试单位"})
	if e != nil {
		t.Fatal(e)
	}
	v, e := a.PreviewDocument(m)
	if e != nil {
		t.Fatal(e)
	}
	if !strings.HasPrefix(v.PDF, "JVBERi0") || v.Pages < 1 {
		t.Fatal("invalid PDF preview")
	}
	again, e := a.PreviewDocument(m)
	if e != nil || again.Digest != v.Digest {
		t.Fatal("preview cache mismatch")
	}
}
