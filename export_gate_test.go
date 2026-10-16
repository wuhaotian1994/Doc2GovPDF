package main

import (
	"context"
	"doc2govpdf/internal/office"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"testing"
)

func TestFormalExportRequiresReviewOrAnnotatedWord(t *testing.T) {
	a := &App{ctx: context.Background(), draftDir: t.TempDir()}
	m := office.Plain("数字核对\n营业收入为100万元。营业收入为120万元。")
	saved := saveDocumentDialog
	defer func() { saveDocumentDialog = saved }()
	saveDocumentDialog = func(context.Context, runtime.SaveDialogOptions) (string, error) { return "", nil }
	if _, e := a.ExportDocument(m, "pdf", false); e == nil {
		t.Fatal("unconfirmed discrepancy exported as final PDF")
	}
	r, e := office.Inspect(m)
	if e != nil {
		t.Fatal(e)
	}
	for _, f := range r.Issues {
		if f.Severity == "review" {
			m.ReviewComments = append(m.ReviewComments, office.ReviewComment{ParagraphID: f.ParagraphID, Text: f.Message})
		}
	}
	if _, e = a.ExportDocument(m, "docx", false); e != nil {
		t.Fatal("annotated review copy blocked", e)
	}
	for _, f := range r.Issues {
		m.ConfirmedIssues = append(m.ConfirmedIssues, f.ID)
	}
	if _, e = a.ExportDocument(m, "pdf", false); e != nil {
		t.Fatal("explicitly reviewed values blocked", e)
	}
}
