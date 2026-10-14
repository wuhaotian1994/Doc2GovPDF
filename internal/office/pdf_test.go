package office

import (
	"bytes"
	"codeberg.org/go-pdf/fpdf"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestWrapKeepsPunctuationWithText(t *testing.T) {
	w := &pdfWriter{ctx: context.Background(), loaded: map[string]string{}, warnings: map[string]bool{}}
	w.f = fpdf.New("P", "mm", "A4", "")
	w.setFont(Paragraph{Font: "仿宋", Size: 16})
	for _, source := range []string{"甲乙丙丁，戊己庚辛。", "甲乙丙（丁戊）己庚。", "甲乙丙丁。戊己！"} {
		lines := w.wrap(source, w.textWidth("甲乙丙丁")+.01)
		if strings.Join(lines, "") != source {
			t.Fatal("wrapping lost text")
		}
		for _, line := range lines {
			r := []rune(line)
			if strings.ContainsRune("，。！？）", r[0]) || r[len(r)-1] == '（' {
				t.Fatalf("bad punctuation break: %q", lines)
			}
		}
	}
}

func TestPDFChinese(t *testing.T) {
	m := Plain("公文排版测试\n中文、English、数字 123 与标点应当完整显示。\n2026年10月14日")
	r, e := RenderPDF(context.Background(), m)
	if e != nil {
		t.Fatal(e)
	}
	if !bytes.HasPrefix(r.Data, []byte("%PDF-")) || r.Pages != 1 {
		t.Fatal("invalid PDF")
	}
}

func TestPDFCancellationAndMissingGlyph(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, e := RenderPDF(ctx, Plain("标题\n正文")); e == nil {
		t.Fatal("cancellation ignored")
	}
	if _, e := RenderPDF(context.Background(), Plain("标题\n\U0010ffff")); e == nil {
		t.Fatal("missing glyph silently rendered")
	}
}

func TestPDFWithoutSystemChineseFonts(t *testing.T) {
	fontCatalog()
	saved := fonts
	fonts = map[string]fontData{"Noto Serif SC": saved["Noto Serif SC"]}
	defer func() { fonts = saved }()
	m := Plain("无系统中文字体测试\n正文仍须完整显示，软件不得依赖 Word 或另行安装字体才能生成 PDF。")
	r, e := RenderPDF(context.Background(), m)
	if e != nil {
		t.Fatal(e)
	}
	if r.Pages != 1 || len(r.Warnings) == 0 {
		t.Fatal("fallback was not disclosed")
	}
	if os.Getenv("DOC2GOVPDF_RENDER_TEST") == "1" {
		os.MkdirAll("../../build/qa/templates", 0700)
		os.WriteFile("../../build/qa/templates/fallback.pdf", r.Data, 0600)
	}
}
func TestRenderUpstreamCorpus(t *testing.T) {
	if os.Getenv("DOC2GOVPDF_RENDER_TEST") != "1" {
		t.Skip("opt-in visual corpus generation")
	}
	files, _ := filepath.Glob("../../testdata/upstream/gongwen-kit/docx/*.docx")
	out := "../../build/qa/pdf"
	_ = os.MkdirAll(out, 0700)
	for _, file := range files {
		t.Run(filepath.Base(file), func(t *testing.T) {
			b, _ := os.ReadFile(file)
			p, e := Open(b)
			if e != nil {
				t.Fatal(e)
			}
			r, e := RenderPDF(context.Background(), p.Model)
			if e != nil {
				t.Fatal(e)
			}
			name := filepath.Base(file)
			name = name[:len(name)-5] + ".pdf"
			if e = os.WriteFile(filepath.Join(out, name), r.Data, 0600); e != nil {
				t.Fatal(e)
			}
			expected := []string{}
			for _, p := range p.Model.Paragraphs() {
				expected = append(expected, p.Prefix+p.Text)
			}
			metadata, _ := json.Marshal(expected)
			os.WriteFile(filepath.Join(out, name+".text.json"), metadata, 0600)
			t.Logf("%d pages; warnings=%v", r.Pages, r.Warnings)
		})
	}
}

func TestLongDocumentAndPageLimit(t *testing.T) {
	m := Plain("长文测试\n" + strings.Repeat("这是一段用于验证分页和文字保留的测试正文。\n", 350))
	start := time.Now()
	r, e := RenderPDF(context.Background(), m)
	if e != nil {
		t.Fatal(e)
	}
	if r.Pages < 10 || r.Pages > 100 {
		t.Fatalf("unexpected page count: %d", r.Pages)
	}
	t.Logf("%d pages in %s", r.Pages, time.Since(start))
	m = Plain("超限测试\n" + strings.Repeat("正文。\n", 2300))
	if _, e = RenderPDF(context.Background(), m); e == nil {
		t.Fatal("page limit not enforced")
	}
}

func TestRenderNewTemplates(t *testing.T) {
	if os.Getenv("DOC2GOVPDF_RENDER_TEST") != "1" {
		t.Skip("opt-in visual templates")
	}
	folder := "../../build/qa/templates"
	os.MkdirAll(folder, 0700)
	for _, tmpl := range Templates() {
		t.Run(tmpl.ID, func(t *testing.T) {
			m, e := NewDocument(Fields{Kind: tmpl.ID, Title: "关于开展材料整理工作的" + tmpl.Name, Agency: "示例单位", Reference: "办发〔2026〕12号", Recipient: "各部门", Body: "一、工作目标\n做好资料整理，确保内容完整、数字准确。\n二、具体安排\n请各部门于本周内完成整理，并妥善保存原始材料。\n三、有关要求\n对需要核对的事项，请依据原始记录确认后再提交。", Date: "2026年10月14日", Signer: func() string {
				if tmpl.ID == "request" || tmpl.ID == "report" {
					return "张三"
				}
				return ""
			}(), CopyTo: "有关部门", Letterhead: tmpl.ID != "plain", Attachments: []string{"工作清单"}, AnnexPages: tmpl.ID == "request"})
			if e != nil {
				t.Fatal(e)
			}
			for _, p := range m.Paragraphs() {
				if p.Role == "attachment-body" {
					p.Text = "一、整理纸质材料。\n二、核对电子台账。"
				}
			}
			b, e := CreateDOCX(m)
			if e != nil {
				t.Fatal(e)
			}
			os.WriteFile(filepath.Join(folder, tmpl.ID+".docx"), b, 0600)
			r, e := RenderPDF(context.Background(), m)
			if e != nil {
				t.Fatal(e)
			}
			if e = os.WriteFile(filepath.Join(folder, tmpl.ID+".pdf"), r.Data, 0600); e != nil {
				t.Fatal(e)
			}
			t.Logf("%d pages", r.Pages)
		})
	}
}
