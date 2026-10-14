package office

import "fmt"

func SetRole(m Model, id, role string) (Model, error) {
	valid := map[string]bool{"body": true, "title": true, "heading": true, "heading2": true, "signature": true, "date": true}
	if !valid[role] {
		return m, fmt.Errorf("段落类型无效")
	}
	m = m.Clone()
	for _, p := range m.Paragraphs() {
		if p.ID != id {
			continue
		}
		if p.Protected || p.Prefix != "" {
			return m, fmt.Errorf("此段包含受保护内容或自动编号，请保留原结构")
		}
		p.Role = role
		p.Size = 16
		p.Font = "仿宋"
		p.Align = "both"
		p.Indent = 11.29
		p.Color = "000000"
		p.KeepNext = false
		switch role {
		case "title":
			p.Size = 22
			p.Font = "方正小标宋简体"
			p.Align = "center"
			p.Indent = 0
			p.KeepNext = true
		case "heading":
			p.Font = "黑体"
			p.KeepNext = true
		case "heading2":
			p.Font = "楷体"
			p.KeepNext = true
		case "signature", "date":
			p.Align = "right"
			p.Indent = 0
		}
		return m, nil
	}
	return m, fmt.Errorf("未找到这一段")
}
