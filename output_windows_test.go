//go:build windows

package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestOpenResultCannotLaunchUnrelatedOrDeletedFiles(t *testing.T) {
	old := launchResult
	defer func() { launchResult = old }()
	launched := false
	launchResult = func(string) error { launched = true; return nil }
	a := &App{}
	file := filepath.Join(t.TempDir(), "用户 成品.docx")
	os.WriteFile(file, []byte("test"), 0600)
	if a.OpenResult(file, false) == nil || launched {
		t.Fatal("unrelated path launched")
	}
	a.lastOutputs = []string{file}
	os.Remove(file)
	if a.OpenResult(file, true) == nil || launched {
		t.Fatal("missing output launched")
	}
}
