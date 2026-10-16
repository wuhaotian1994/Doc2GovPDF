package office

import (
	"fmt"
	"strings"
)

// Rebuild generated metadata while retaining edited body/table/annex blocks.
// Imported documents keep their original package and are edited in place.
func UpdateElements(m Model, f Fields) (Model, error) {
	if m.SourceID != "" {
		return m, fmt.Errorf("导入文件请在正文中修改现有要素，不能重建原始结构")
	}
	f.Kind = m.Template
	f.Body = "正文占位保留"
	next, e := NewDocument(f)
	if e != nil {
		return m, e
	}
	body := []Block{}
	annexes := [][]Block{}
	annex := -1
	mainTitleSeen := false
	for _, b := range m.Blocks {
		p := b.Paragraph
		if p != nil && p.PageBreak && strings.Contains(p.Text, "附件") {
			annex++
			annexes = append(annexes, []Block{})
			continue
		}
		if annex >= 0 {
			if p != nil && (p.Role == "imprint" || p.Role == "attachment-title" || p.Role == "title") {
				continue
			}
			annexes[annex] = append(annexes[annex], b)
			continue
		}
		if p != nil && (p.Role == "signature" || p.Role == "date" || p.Role == "roster" || p.Role == "imprint" || p.Role == "attachment-description" || p.Role == "note") {
			if strings.HasPrefix(p.ID, "new-") {
				body = append(body, b)
			}
			continue
		}
		if p != nil && p.Role == "title" {
			if mainTitleSeen {
				body = append(body, b)
			}
			mainTitleSeen = true
			continue
		}
		if p != nil {
			switch p.Role {
			case "body", "heading", "heading2", "heading3", "heading4", "subheading", "article", "caption":
				body = append(body, b)
			}
		} else if b.Table != nil && b.Table.Role != "joint-mark" {
			body = append(body, b)
		}
	}
	keepCount := len(f.Attachments)
	if !f.AnnexPages {
		keepCount = 0
	}
	for i := keepCount; i < len(annexes); i++ {
		for _, b := range annexes[i] {
			if b.Table != nil || b.Paragraph != nil && strings.TrimSpace(b.Paragraph.Text) != "" {
				return m, fmt.Errorf("待移除的附件已有内容，请先导出保留，或清空对应附件正文后再移除")
			}
		}
	}
	ids := map[string]bool{}
	for _, p := range m.Paragraphs() {
		ids[p.ID] = true
	}
	for _, p := range next.Paragraphs() {
		id := "element-" + p.ID
		for ids[id] {
			id += "x"
		}
		p.ID = id
		ids[id] = true
	}
	var blocks []Block
	inserted := false
	annex = -1
	for _, b := range next.Blocks {
		p := b.Paragraph
		if p != nil && p.PageBreak && strings.Contains(p.Text, "附件") {
			annex++
		}
		if p != nil && p.Text == f.Body && !inserted {
			blocks = append(blocks, body...)
			inserted = true
			continue
		}
		if p != nil && p.Role == "attachment-body" && annex >= 0 && annex < len(annexes) {
			blocks = append(blocks, annexes[annex]...)
			continue
		}
		blocks = append(blocks, b)
	}
	next.Blocks = blocks
	next = RenumberDocument(next)
	return next, next.Validate()
}
