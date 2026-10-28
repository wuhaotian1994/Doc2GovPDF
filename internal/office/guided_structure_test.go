package office

import "testing"

func TestGenericWriterRespectsArticleProseAndPastedHeadingWhitespace(t *testing.T) {
	cases := []struct {
		text, role, font string
		keep             bool
	}{
		{"一、工作安排", "heading", "黑体", true},
		{"第一条 为规范资料归档管理，各部门应按原始材料核对记录和附件，保留工作过程。", "article", "仿宋", false},
		{"第12条 保留原编号与文字，不自动增加层次序号。", "article", "仿宋", false},
		{"   二、核对要求", "heading", "黑体", true},
		{"\u3000（一）材料要求", "heading2", "楷体", true},
		{"  1. 工作分工", "heading3", "仿宋", true},
		{"\t（1）有关要求", "heading4", "仿宋", true},
		{"普通正文：第一条是原始材料的引用说明。", "body", "仿宋", false},
	}
	for _, tc := range cases {
		t.Run(tc.text, func(t *testing.T) {
			m, err := NewDocument(Fields{Kind: "plain", Title: "测试稿", Body: tc.text})
			if err != nil {
				t.Fatal(err)
			}
			p := m.Blocks[1].Paragraph
			if p.Text != tc.text || p.Role != tc.role || p.Font != tc.font || p.KeepNext != tc.keep || p.Size != 16 {
				t.Fatalf("source/structure changed: %+v", p)
			}
		})
	}
}

func TestGenericArticleDoesNotAcquireAnotherNumberWhenNumberingIsEnabled(t *testing.T) {
	const text = "第12条 既有编号与事实须保留。"
	m, err := NewDocument(Fields{Kind: "plain", Title: "测试稿", Body: text, AutoNumbering: true})
	if err != nil {
		t.Fatal(err)
	}
	p := m.Blocks[1].Paragraph
	if p.Text != text || p.Prefix != "" || p.AutoNumbered || p.OutlineLevel != 0 {
		t.Fatalf("article was renumbered: %+v", p)
	}
}

func TestAuthorCanCorrectParagraphMeaningWithoutChangingWords(t *testing.T) {
	const text = "三、这是一段有编号的说明，作者选择按正文排版。"
	m, err := NewDocument(Fields{Kind: "plain", Title: "测试稿", Body: text})
	if err != nil {
		t.Fatal(err)
	}
	id := m.Blocks[1].Paragraph.ID
	corrected, err := SetRole(m, id, "body")
	if err != nil {
		t.Fatal(err)
	}
	p := corrected.Blocks[1].Paragraph
	if p.Text != text || p.Font != "仿宋" || p.KeepNext || m.Blocks[1].Paragraph.Role != "heading" {
		t.Fatalf("correction changed source or original: %+v", p)
	}
}
