package main

import (
	"context"
	"doc2govpdf/internal/office"
	"encoding/json"
	"os"
	"testing"
)

func TestGenerateUIFixture(t *testing.T) {
	if os.Getenv("DOC2GOVPDF_UI_FIXTURE") != "1" {
		t.Skip("visual fixture generation")
	}
	a := &App{ctx: context.Background(), draftDir: t.TempDir()}
	f := office.Fields{Kind: "notice", Letterhead: true, Title: "示例单位办公室关于开展办公环境整理工作的通知", Agency: "示例单位办公室", Recipient: "各部门", Reference: "办发【2026】第012号", Date: "2026年10月08日", Body: "为营造整洁、有序的办公环境，现将有关事项通知如下。\n一、整理范围\n请各部门整理办公区域和纸质档案。\n二、工作安排\n请于本周五前完成整理。重要文件按规定归档。"}
	m, e := office.NewDocument(f)
	if e != nil {
		t.Fatal(e)
	}
	check, e := office.Inspect(m)
	if e != nil {
		t.Fatal(e)
	}
	pdf, e := a.PreviewDocument(m)
	if e != nil {
		t.Fatal(e)
	}
	fixture := map[string]interface{}{"model": m, "inspection": check, "preview": pdf, "fonts": office.FontStatus(), "templates": office.Templates()}
	b, _ := json.Marshal(fixture)
	os.MkdirAll("build/qa", 0700)
	if e = os.WriteFile("build/qa/ui-fixture.json", b, 0600); e != nil {
		t.Fatal(e)
	}
}
