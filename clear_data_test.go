package main

import (
	"context"
	"doc2govpdf/internal/office"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestClearDraftsPreservesPreferencesAndUnrelatedFiles(t *testing.T) {
	dir := t.TempDir()
	a := &App{ctx: context.Background(), draftDir: dir}
	a.SaveWorkspace(Workspace{Document: office.Plain("标题\n正文")})
	a.SavePreferences(Preferences{Agency: "示例单位", OutputFormat: "both", AutoUpdate: false})
	os.MkdirAll(filepath.Join(dir, "sources"), 0700)
	os.WriteFile(filepath.Join(dir, "sources", strings.Repeat("a", 64)+".docx"), []byte("cached"), 0600)
	os.WriteFile(filepath.Join(dir, "用户资料.txt"), []byte("keep"), 0600)
	if e := a.ClearLocalDrafts(); e != nil {
		t.Fatal(e)
	}
	if _, e := os.Stat(filepath.Join(dir, "workspace.json")); !os.IsNotExist(e) {
		t.Fatal("draft remained")
	}
	if _, e := os.Stat(filepath.Join(dir, "用户资料.txt")); e != nil {
		t.Fatal("unrelated file deleted")
	}
	p, e := a.GetPreferences()
	if e != nil || p.Agency != "示例单位" {
		t.Fatal("preferences lost")
	}
}
