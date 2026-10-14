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
