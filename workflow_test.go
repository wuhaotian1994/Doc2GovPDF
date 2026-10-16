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

func TestOldDraftRefreshesContinuousNumberingWithoutLosingEdits(t *testing.T) {
	a := &App{ctx: context.Background(), draftDir: t.TempDir()}
	w, e := a.OpenWorkspacePath("testdata/upstream/gongwen-kit/docx/公文管理办法.docx")
	if e != nil {
		t.Fatal(e)
	}
	found := false
	for _, p := range w.Document.Paragraphs() {
		if strings.HasPrefix(p.Prefix, "第十四条") {
			p.Prefix = "第一条"
			p.Text += "（保留修改）"
			found = true
		}
	}
	if !found {
		t.Fatal("continuous numbering parsed incorrectly")
	}
	if e = a.SaveWorkspace(w); e != nil {
		t.Fatal(e)
	}
	restored, e := a.GetWorkspace()
	if e != nil {
		t.Fatal(e)
	}
	if !strings.Contains(restored.Document.Text(), "第十四条") || !strings.Contains(restored.Document.Text(), "（保留修改）") {
		t.Fatal("old draft numbering not corrected or edits lost")
	}
}

func TestOldDraftTableMetadataSurvivesInsertedParagraph(t *testing.T) {
	a := &App{ctx: context.Background(), draftDir: t.TempDir()}
	w, e := a.OpenWorkspacePath("testdata/upstream/gongwen-kit/docx/公文请示.docx")
	if e != nil {
		t.Fatal(e)
	}
	width := 0.0
	for _, block := range w.Document.Blocks {
		if block.Table != nil && block.Table.Width > 0 {
			width = block.Table.Width
			block.Table.Width = 0
			break
		}
	}
	if width == 0 {
		t.Fatal("fixture has no explicit table width")
	}
	w.Document.Blocks = append([]office.Block{{Paragraph: &office.Paragraph{ID: "inserted-layout", Text: "保留用户新增段落", Role: "body", Font: "仿宋", Size: 16, Line: 10.21, Align: "both"}}}, w.Document.Blocks...)
	if e = a.SaveWorkspace(w); e != nil {
		t.Fatal(e)
	}
	r, e := a.GetWorkspace()
	if e != nil || !strings.Contains(r.Document.Text(), "保留用户新增段落") {
		t.Fatal("edited draft failed to restore", e)
	}
	for _, block := range r.Document.Blocks {
		if block.Table != nil && block.Table.Width == width {
			return
		}
	}
	t.Fatal("table metadata was matched by unstable block position")
}

func TestBatchRepairHonorsRetainedWording(t *testing.T) {
	a := &App{}
	m := office.Plain("标题\n筹画项目\n于2026年05月08日前报送")
	r, e := office.Inspect(m)
	if e != nil {
		t.Fatal(e)
	}
	var ignored []string
	for _, f := range r.Issues {
		if f.Rule == "word.variant" {
			ignored = append(ignored, f.ID)
		}
	}
	plan, e := a.PreviewSafeRepairs(m, ignored)
	if e != nil {
		t.Fatal(e)
	}
	if !strings.Contains(plan.Document.Text(), "筹画项目") || !strings.Contains(plan.Document.Text(), "2026年5月8日") {
		t.Fatal("retained wording ignored or unrelated repair skipped")
	}
}
