package main

import (
	"context"
	"doc2govpdf/internal/office"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestUnfinishedFormAndHomeSurviveRestart(t *testing.T) {
	dir := t.TempDir()
	a := &App{ctx: context.Background(), draftDir: dir}
	w := Workspace{Form: &office.Fields{Kind: "notice", Title: "尚未写完", Body: "正文草稿"}, Screen: "welcome", ResumeTarget: "compose"}
	if e := a.SaveWorkspace(w); e != nil {
		t.Fatal(e)
	}
	next := &App{ctx: context.Background(), draftDir: dir}
	r, e := next.GetWorkspace()
	if e != nil || r.Form == nil || r.Form.Body != "正文草稿" || r.Screen != "welcome" || r.ResumeTarget != "compose" {
		t.Fatalf("form lost: %+v %v", r, e)
	}
}
func TestPairedExportsHaveSameNameWithExistingFiles(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "测试.docx"), []byte("original"), 0600)
	paths := availablePair(dir, "测试")
	if strings.TrimSuffix(paths[0], ".docx") != strings.TrimSuffix(paths[1], ".pdf") || filepath.Base(paths[0]) != "测试-1.docx" {
		t.Fatal(paths)
	}
	b, _ := os.ReadFile(filepath.Join(dir, "测试.docx"))
	if string(b) != "original" {
		t.Fatal("existing file changed")
	}
}
