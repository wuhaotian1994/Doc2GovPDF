package office

import (
	"regexp"
	"strings"
	"unicode"
)

var descriptionStart = regexp.MustCompile(`^附件\s*[：:]\s*(?:([0-9]+)[.．、]\s*)?(.+)$`)
var descriptionNext = regexp.MustCompile(`^([0-9]+)[.．、]\s*(.+)$`)
var declaredAnnexMark = regexp.MustCompile(`^附件\s*([0-9]*)$`)

// Explicit generated annex roles express author intent. Original-source
// preservation never becomes a claim of normalization or a reason to rewrite it.
func attachmentFindings(m Model, add func(*Paragraph, string, string, string, string, string)) {
	if m.SourceID != "" {
		return
	}
	type description struct{ number, name string }
	var descriptions []description
	var labels []*Paragraph
	collecting := false
	compact := func(s string) string {
		return strings.Map(func(r rune) rune {
			if unicode.IsSpace(r) {
				return -1
			}
			return r
		}, s)
	}
	for _, block := range m.Blocks {
		p := block.Paragraph
		if p == nil {
			collecting = false
			continue
		}
		if p.Role == "attachment-label" {
			labels = append(labels, p)
			collecting = false
			continue
		}
		if len(labels) > 0 {
			continue
		}
		text := strings.TrimSpace(p.Text)
		if match := descriptionStart.FindStringSubmatch(text); match != nil {
			descriptions = append(descriptions, description{match[1], compact(match[2])})
			collecting = true
			continue
		}
		if collecting {
			if match := descriptionNext.FindStringSubmatch(text); match != nil {
				descriptions = append(descriptions, description{match[1], compact(match[2])})
				continue
			}
			if text != "" {
				collecting = false
			}
		}
	}
	seen := map[string]bool{}
	for _, label := range labels {
		basis := "GB/T 9704—2012 7.3.4、7.3.7、7.5；仅核对明确声明的实际附件，不核验附件业务事实。"
		if !label.PageBreak {
			add(label, "annex.page", "error", "实际附件需要另面起排，请保留附件身份后重新预览。", "", basis)
		}
		mark := declaredAnnexMark.FindStringSubmatch(strings.TrimSpace(label.Text))
		if mark == nil {
			add(label, "annex.label", "error", "附件标识需要使用“附件”及原有明确顺序号，请核对原材料。", "", basis)
			continue
		}
		number := mark[1]
		if len(labels) > 1 && (number == "" || seen[number]) {
			add(label, "annex.number", "error", "多个实际附件需要各自明确且不重复的顺序号，请核对原标识和正文附件说明，不会猜补。", "", basis)
		}
		seen[number] = true
		var title *Paragraph
		after := false
		for _, b := range m.Blocks {
			if b.Paragraph == label {
				after = true
				continue
			}
			if !after {
				continue
			}
			if b.Paragraph != nil && strings.TrimSpace(b.Paragraph.Text) == "" {
				continue
			}
			if b.Paragraph != nil && b.Paragraph.Role == "attachment-title" {
				title = b.Paragraph
			}
			break
		}
		if title == nil {
			add(label, "annex.title", "error", "实际附件还缺少明确的标题，请在原标识后补齐标题并重新确认。", "", basis)
			continue
		}
		payload := false
		pastTitle := false
		for _, b := range m.Blocks {
			if b.Paragraph == title {
				pastTitle = true
				continue
			}
			if !pastTitle {
				continue
			}
			if b.Paragraph != nil && (b.Paragraph.Role == "attachment-label" || b.Paragraph.Role == "imprint") {
				break
			}
			if b.Table != nil && len(b.Table.Rows) > 0 || b.Paragraph != nil && strings.TrimSpace(b.Paragraph.Text) != "" {
				payload = true
				break
			}
		}
		if !payload {
			add(title, "annex.empty", "error", "实际附件标题后还没有内容，请补齐文字或原表，或取消这处附件身份。", "", basis)
		}
		if title.Align != "center" || title.Indent != 0 {
			add(title, "annex.title-layout", "error", "实际附件标题应居中编排，请重新确认附件身份与预览。", "", basis)
		}
		matched := false
		for _, d := range descriptions {
			if d.name == compact(title.Text) && (d.number == number || len(labels) == 1 && (d.number == "" || d.number == "1") && (number == "" || number == "1")) {
				matched = true
				break
			}
		}
		if !matched {
			add(title, "annex.link", "error", "实际附件的名称或顺序号与正文附件说明尚未对应。请核对正文中的“附件：……”或附件名称字段，不会自动补造。", "", basis)
		}
	}
}
