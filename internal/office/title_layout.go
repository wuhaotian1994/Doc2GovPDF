package office

import (
	"math"
	"strings"
	"unicode"
)

// New documents share explicit, balanced title breaks in Word and PDF. Source
// documents retain their existing text and author-specified line breaks.
func prepareNewLayout(m Model) Model {
	if m.SourceID != "" {
		return m
	}
	m = m.Clone()
	m = RenumberDocument(m)
	// Keep some preceding content with the closing signature. Otherwise a
	// short document can end with a page containing only the agency and date.
	for i, block := range m.Blocks {
		if block.Paragraph != nil && block.Paragraph.Role == "signature" && i > 0 {
			if previous := m.Blocks[i-1].Paragraph; previous != nil && !previous.AnchorBottom {
				previous.KeepNext = true
			}
		}
	}
	for _, block := range m.Blocks {
		if block.Table != nil {
			for _, row := range block.Table.Rows {
				if row.Header {
					for _, cell := range row.Cells {
						for i := range cell.Paragraphs {
							if cell.Paragraphs[i].Font != "黑体" {
								cell.Paragraphs[i].Bold = true
							}
						}
					}
				}
			}
		}
	}
	for _, p := range m.Paragraphs() {
		if p.Role == "roster" {
			if parts := strings.SplitN(p.Text, "：", 2); len(parts) == 2 {
				width := m.Page.Width - m.Page.Left - m.Page.Right - p.LeftIndent - p.RightIndent
				lines := wrapRosterNames(parts[1], width, func(text string) float64 { return textAdvanceMM(text, p.Font, p.Size) })
				p.Text = parts[0] + "：" + strings.Join(lines, "\n")
			}
		}
		if p.Role != "title" || strings.Contains(p.Text, "\n") {
			continue
		}
		capacity := int(math.Floor((m.Page.Width - m.Page.Left - m.Page.Right) * 72 / 25.4 / p.Size))
		if capacity < 4 {
			continue
		}
		runes := []rune(p.Text)
		n := len(runes)
		if n <= capacity {
			continue
		}
		lines := (n + capacity - 1) / capacity
		out := []string{}
		start := 0
		for remaining := lines; remaining > 1; remaining-- {
			target := start + (n-start)/remaining
			lo := max(start+1, n-(remaining-1)*capacity)
			hi := min(start+capacity, n-remaining+1)
			best := target
			score := math.MaxFloat64
			for cut := lo; cut <= hi; cut++ {
				if strings.ContainsRune("，。；：！？、）】》的", runes[cut]) || strings.ContainsRune("（【《", runes[cut-1]) {
					continue
				}
				if unicode.IsDigit(runes[cut-1]) && unicode.IsDigit(runes[cut]) {
					continue
				}
				bad := false
				for _, word := range []string{"人民政府", "办公室", "关于", "开展", "材料", "整理", "工作", "通知", "请示", "报告", "办法", "纪要", "有关"} {
					for at := 0; at < len(p.Text); {
						i := strings.Index(p.Text[at:], word)
						if i < 0 {
							break
						}
						pos := len([]rune(p.Text[:at+i]))
						if cut > pos && cut < pos+len([]rune(word)) {
							bad = true
						}
						at += i + len(word)
					}
				}
				if bad {
					continue
				}
				cost := math.Abs(float64(cut - target))
				if strings.HasSuffix(string(runes[start:cut]), "关于") {
					cost -= 1.5
				}
				if cost < score {
					score = cost
					best = cut
				}
			}
			best = max(lo, min(hi, best))
			out = append(out, string(runes[start:best]))
			start = best
		}
		out = append(out, string(runes[start:]))
		p.Text = strings.Join(out, "\n")
	}
	return m
}
