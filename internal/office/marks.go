package office

import (
	"fmt"
	"strings"
	"unicode/utf8"
)

func fitMark(p *Paragraph, width float64) error {
	count := 0
	for _, line := range strings.Split(p.Text, "\n") {
		if n := utf8.RuneCountInString(line); n > count {
			count = n
		}
	}
	for p.Size > 22 && float64(count)*p.Size*25.4/72 > width {
		p.Size -= 2
	}
	if float64(count)*p.Size*25.4/72 > width {
		return fmt.Errorf("发文机关标志过长，请使用规范简称")
	}
	return nil
}
func fitMarks(m Model) (Model, error) {
	m = m.Clone()
	for _, b := range m.Blocks {
		if b.Table != nil && b.Table.Role == "joint-mark" && len(b.Table.Rows) > 0 {
			row := &b.Table.Rows[0]
			if len(row.Cells) == 0 || len(row.Cells[0].Paragraphs) == 0 {
				continue
			}
			probe := row.Cells[0].Paragraphs[0]
			probe.Text = ""
			for _, p := range row.Cells[0].Paragraphs {
				if len([]rune(p.Text)) > len([]rune(probe.Text)) {
					probe.Text = p.Text
				}
			}
			if len(row.Cells) > 1 {
				probe.Text += "文件"
			}
			if e := fitMark(&probe, 156); e != nil {
				return m, e
			}
			fileWidth := 0.0
			if len(row.Cells) > 1 {
				fileWidth = 2 * probe.Size * 25.4 / 72
				b.Table.Widths[1] = fileWidth
			}
			b.Table.Widths[0] = 156 - fileWidth
			for ci := range row.Cells {
				for pi := range row.Cells[ci].Paragraphs {
					row.Cells[ci].Paragraphs[pi].Size = probe.Size
				}
			}
		}
	}
	for _, p := range m.Paragraphs() {
		if p.Role == "agency" {
			if e := fitMark(p, m.Page.Width-m.Page.Left-m.Page.Right); e != nil {
				return m, e
			}
		}
	}
	for _, list := range [][]Paragraph{m.Header, m.FirstHeader} {
		for i := range list {
			p := &list[i]
			if p.Size >= 22 && p.Align == "center" {
				width := p.FrameWidth
				if width == 0 {
					width = m.Page.Width - m.Page.Left - m.Page.Right
				}
				if e := fitMark(p, width); e != nil {
					return m, e
				}
			}
		}
	}
	return m, nil
}
