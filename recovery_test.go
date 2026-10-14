package main

import (
	"context"
	"doc2govpdf/internal/office"
	"os"
	"path/filepath"
	"testing"
)

func TestCorruptWorkspaceNeverSilentlyOverwritten(t *testing.T) {
	a := &App{ctx: context.Background(), draftDir: t.TempDir()}
	path := filepath.Join(a.draftDir, "workspace.json")
	bad := []byte("{broken")
	os.WriteFile(path, bad, 0600)
	if _, e := a.GetWorkspace(); e == nil {
		t.Fatal("corruption accepted")
	}
	if e := a.SaveWorkspace(Workspace{}); e != nil {
		t.Fatal(e)
	}
	b, _ := os.ReadFile(path)
	if string(b) != string(bad) {
		t.Fatal("empty session overwrote damaged draft")
	}
	if e := a.SaveWorkspace(Workspace{Document: office.Plain("新标题\n新正文")}); e != nil {
		t.Fatal(e)
	}
	backups, _ := filepath.Glob(filepath.Join(a.draftDir, "workspace-recovery-*.json"))
	if len(backups) != 1 {
		t.Fatal("missing recovery backup")
	}
	b, _ = os.ReadFile(backups[0])
	if string(b) != string(bad) {
		t.Fatal("wrong recovery backup")
	}
}
