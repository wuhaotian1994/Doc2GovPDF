package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestExportCannotOverwrite(t *testing.T) {
	path := filepath.Join(t.TempDir(), "original.docx")
	if err := os.WriteFile(path, []byte("original"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := writeNew(path, []byte("replacement")); err == nil {
		t.Fatal("overwrote existing file")
	}
	data, _ := os.ReadFile(path)
	if string(data) != "original" {
		t.Fatal("original changed")
	}
	newPath := filepath.Join(t.TempDir(), "new.docx")
	if err := writeNew(newPath, []byte("output")); err != nil {
		t.Fatal(err)
	}
}

func TestDraftReplaceAndRecover(t *testing.T) {
	app := &App{draftDir: t.TempDir()}
	if err := app.SaveDraft(Draft{Text: "first", Name: "原文"}); err != nil {
		t.Fatal(err)
	}
	if err := app.SaveDraft(Draft{Text: "第二份 <正文>", Name: "新文"}); err != nil {
		t.Fatal(err)
	}
	d, err := app.LoadDraft()
	if err != nil {
		t.Fatal(err)
	}
	if d.Text != "第二份 <正文>" || d.Name != "新文" || d.UpdatedAt == "" {
		t.Fatalf("bad recovery: %+v", d)
	}
}
