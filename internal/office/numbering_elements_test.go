package office

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAutomaticNumberingAndMetadataUpdateKeepEdits(t *testing.T) {
	f := Fields{Kind: "rules", Title: "材料管理办法", Agency: "示例单位", Letterhead: true, Date: "2026年10月16日", Body: "第一章 总则\n第一条 适用范围。\n第二章 职责\n第一条 负责核对材料。", AutoNumbering: true, Attachments: []string{"材料清单"}, AnnexPages: true}
	m, e := NewDocument(f)
	if e != nil {
		t.Fatal(e)
	}
	if !strings.Contains(m.Text(), "第二条 负责核对材料。") {
		t.Fatal("article restarted", m.Text())
	}
	for _, p := range m.Paragraphs() {
		if p.Role == "article" {
			p.Text += "保留编辑。"
		}
		if p.Role == "attachment-body" {
			p.Text = "附件已填写，不能丢失。"
		}
	}
	f.CopyNumber = "3"
	f.Classification = "秘密"
	f.SecrecyPeriod = "1年"
	updated, e := UpdateElements(m, f)
	if e != nil {
		t.Fatal(e)
	}
	if !strings.Contains(updated.Text(), "保留编辑。") || !strings.Contains(updated.Text(), "附件已填写，不能丢失。") {
		t.Fatal("metadata update lost edits")
	}
	b, e := CreateDOCX(updated)
	if e != nil {
		t.Fatal(e)
	}
	p, e := Open(b)
	if e != nil {
		t.Fatal(e)
	}
	if !strings.Contains(p.Model.Text(), "第二条 负责核对材料。保留编辑。") {
		t.Fatal("Word numbering differs", p.Model.Text())
	}
	if !strings.Contains(string(p.Parts["word/numbering.xml"]), `lvlRestart w:val="0"`) {
		t.Fatal("Word continuity missing")
	}
	f.Attachments = nil
	f.AnnexPages = false
	if _, e = UpdateElements(updated, f); e == nil {
		t.Fatal("filled attachment discarded")
	}
	manual := updated.Clone()
	manual.AutoNumbering = false
	manual = RenumberDocument(manual)
	b, e = CreateDOCX(manual)
	if e != nil {
		t.Fatal(e)
	}
	p, e = Open(b)
	if e != nil {
		t.Fatal(e)
	}
	if !strings.Contains(p.Model.Text(), "第二条") {
		t.Fatal("turning off automatic numbering lost labels")
	}
	if folder := os.Getenv("DOC2GOVPDF_EXTENDED_AUDIT"); folder != "" {
		dir := filepath.Join(folder, "automatic-articles")
		os.MkdirAll(dir, 0700)
		b, _ = CreateDOCX(updated)
		r, e := RenderPDF(context.Background(), updated)
		if e != nil {
			t.Fatal(e)
		}
		os.WriteFile(filepath.Join(dir, "document.docx"), b, 0600)
		os.WriteFile(filepath.Join(dir, "go.pdf"), r.Data, 0600)
	}
}
func TestFourLevelWordNumbering(t *testing.T) {
	m, e := NewDocument(Fields{Kind: "notice", Title: "四级标题", Body: "一、第一层\n（一）第二层\n1.第三层\n（1）第四层\n正文。\n二、另一节\n（一）下一层", AutoNumbering: true})
	if e != nil {
		t.Fatal(e)
	}
	b, e := CreateDOCX(m)
	if e != nil {
		t.Fatal(e)
	}
	p, e := Open(b)
	if e != nil {
		t.Fatal(e)
	}
	for _, want := range []string{"一、第一层", "（一）第二层", "1.第三层", "（1）第四层", "二、另一节", "（一）下一层"} {
		if !strings.Contains(p.Model.Text(), want) {
			t.Error("missing", want, p.Model.Text())
		}
	}
}

func TestArticlesContinuePastOneHundred(t *testing.T) {
	f := Fields{Kind: "rules", Title: "条文编号核对", Body: strings.Repeat("第一条 具体规定。\n", 101), AutoNumbering: true}
	m, e := NewDocument(f)
	if e != nil {
		t.Fatal(e)
	}
	b, e := CreateDOCX(m)
	if e != nil {
		t.Fatal(e)
	}
	p, e := Open(b)
	if e != nil {
		t.Fatal(e)
	}
	if !strings.Contains(p.Model.Text(), "第一百零一条 具体规定。") {
		t.Fatal("three-digit article numbering differs")
	}
}

func TestRulesConvertManualHeadingsWithoutDuplicateLabels(t *testing.T) {
	m, e := NewDocument(Fields{Kind: "rules", Title: "管理办法", Body: "一、工作安排\n这里是正文。\n二、有关要求\n这里是正文。", AutoNumbering: true})
	if e != nil {
		t.Fatal(e)
	}
	if strings.Contains(m.Text(), "第一章 一、") || !strings.Contains(m.Text(), "第一章 工作安排") {
		t.Fatal("duplicate automatic/manual numbering", m.Text())
	}
}
