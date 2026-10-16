package office

import "math"

// Word collapses adjacent paragraph after/before spacing to their maximum.
// The PDF engine consumes after immediately, so only add the remainder before.
func preparePDFParagraphSpacing(m Model) Model {
	if m.SourceID != "" {
		return m
	}
	m = m.Clone()
	after := 0.0
	for _, b := range m.Blocks {
		if b.Table != nil {
			after = 0
			continue
		}
		p := b.Paragraph
		if p == nil || p.AnchorBottom {
			continue
		}
		if p.PageBreak {
			after = 0
		}
		p.Before = math.Max(0, p.Before-after)
		after = p.After
	}
	return m
}
