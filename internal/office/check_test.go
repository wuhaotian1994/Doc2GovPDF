package office

import (
	"strings"
	"testing"
)

func TestCorrectionFindingsExplainSpecificRuleWithoutChangingSource(t *testing.T) {
	m := Plain("测试通知\n设备重量为10kg，请核对型号。\n本次材料包括:纸张、文件。")
	before := m.Text()
	r, err := Inspect(m)
	if err != nil {
		t.Fatal(err)
	}
	seen := map[string]Finding{}
	for _, f := range r.Issues {
		seen[f.Rule] = f
	}
	f, ok := seen["number.unit-space"]
	if !ok || !strings.Contains(f.Message, "型号或代码") || f.Basis != "数字与计量单位书写规范" || !strings.Contains(f.Replacement, "10 kg") {
		t.Fatalf("correction hid rule explanation: %+v", f)
	}
	if m.Text() != before {
		t.Fatal("inspection changed authored source")
	}
}

func TestChecksProtectFactsAndQuotes(t *testing.T) {
	m := Plain("测试通知\n办发【2026】第012号\n筹画项目\n引用“筹画项目”与 https://example.org/a:b 保留\n2025年2月29日")
	r, e := Inspect(m)
	if e != nil {
		t.Fatal(e)
	}
	seen := map[string]Finding{}
	for _, f := range r.Issues {
		seen[f.Rule] = f
		if f.ParagraphID == "p3" {
			t.Fatalf("quoted content flagged: %+v", f)
		}
	}
	for _, key := range []string{"reference.format", "word.variant", "date.invalid"} {
		if _, ok := seen[key]; !ok {
			t.Fatalf("missing %s", key)
		}
	}
	if seen["date.invalid"].Replacement != "" {
		t.Fatal("invalid date auto-fixed")
	}
	next, e := ApplyFinding(m, seen["word.variant"].ID)
	if e != nil {
		t.Fatal(e)
	}
	if !strings.Contains(next.Text(), "筹划项目") || !strings.Contains(m.Text(), "筹画项目") {
		t.Fatal("mutation or missing fix")
	}
}
func TestMultilineFixPreservesRest(t *testing.T) {
	m := Plain("标题\n正文")
	m.Blocks[1].Paragraph.Text = "说明\n2026年01月02日\n其他内容"
	r, _ := Inspect(m)
	for _, f := range r.Issues {
		if f.Rule == "date.padding" {
			next, e := ApplyFinding(m, f.ID)
			if e != nil {
				t.Fatal(e)
			}
			if next.Blocks[1].Paragraph.Text != "说明\n2026年1月2日\n其他内容" {
				t.Fatal("unrelated lines lost")
			}
			return
		}
	}
	t.Fatal("missing date fix")
}
func TestTemplateTypes(t *testing.T) {
	for _, tmpl := range Templates() {
		m, e := NewDocument(Fields{Kind: tmpl.ID, Title: "测试公文", Agency: "示例单位", Body: "一、工作事项\n这里是正文。", Date: "2026年10月14日", Letterhead: true})
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
		if !strings.Contains(p.Model.Text(), "这里是正文。") {
			t.Fatal("body missing")
		}
	}
}

func TestAttachmentsRequireContent(t *testing.T) {
	m, e := NewDocument(Fields{Kind: "notice", Title: "通知", Body: "正文", Attachments: []string{"实施清单"}, AnnexPages: true})
	if e != nil {
		t.Fatal(e)
	}
	r, _ := Inspect(m)
	found := false
	for _, f := range r.Issues {
		if f.Rule == "attachment.empty" && f.Severity == "error" {
			found = true
		}
	}
	if !found {
		t.Fatal("empty attachment allowed")
	}
	for _, p := range m.Paragraphs() {
		if p.Role == "attachment-body" {
			p.Text = "附件具体内容"
		}
	}
	r, _ = Inspect(m)
	for _, f := range r.Issues {
		if f.Rule == "attachment.empty" {
			t.Fatal("filled attachment still blocked")
		}
	}
}
