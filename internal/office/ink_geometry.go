package office

import (
	"golang.org/x/image/font"
	"golang.org/x/image/math/fixed"
	"math"
	"strings"
	"unicode"
)

// The PDF cell API positions a baseline, not the visible glyph edge. Use the
// resolved font outlines when a template specifies physical ink placement.
func glyphInk(p Paragraph) (float64, float64) {
	fontCatalog()
	face := fontMaps[resolveFont(p.Font).name]
	if face == nil {
		return -.8 * p.Size * 25.4 / 72, .1 * p.Size * 25.4 / 72
	}
	low, high := math.Inf(1), math.Inf(-1)
	for _, r := range p.Prefix + p.Text {
		if unicode.IsSpace(r) {
			continue
		}
		g, e := face.GlyphIndex(nil, r)
		if e != nil {
			continue
		}
		b, _, e := face.GlyphBounds(nil, g, fixed.Int26_6(p.Size*64), font.HintingNone)
		if e != nil {
			continue
		}
		low = math.Min(low, float64(b.Min.Y)/64*25.4/72)
		high = math.Max(high, float64(b.Max.Y)/64*25.4/72)
	}
	if math.IsInf(low, 1) {
		return 0, 0
	}
	return low, high
}
func textAdvanceMM(text, name string, size float64) float64 {
	fontCatalog()
	face := fontMaps[resolveFont(name).name]
	if face == nil {
		return float64(len([]rune(text))) * size * 25.4 / 72
	}
	width := 0.0
	for _, r := range text {
		g, e := face.GlyphIndex(nil, r)
		if e != nil {
			continue
		}
		a, e := face.GlyphAdvance(nil, g, fixed.Int26_6(size*64), font.HintingNone)
		if e == nil {
			advance := float64(a) / 64 * 25.4 / 72
			if strings.ContainsRune(compactPunctuation, r) && advance >= .8*size*25.4/72 {
				advance /= 2
			}
			width += advance
		}
	}
	if size == 16 {
		width += float64(len([]rune(text))) * float64(-842) / 4096 * 25.4 / 72
	}
	return width
}
func inkTopOffset(p Paragraph, line float64, word bool) float64 {
	low, _ := glyphInk(p)
	baseline := line/2 + .3*p.Size*25.4/72
	if word {
		face := fontMaps[resolveFont(p.Font).name]
		if face != nil {
			if metrics, e := face.Metrics(nil, fixed.Int26_6(p.Size*64), font.HintingNone); e == nil {
				baseline = line/2 + float64(metrics.Ascent-metrics.Descent)/128*25.4/72 + .2
			}
		}
	}
	return baseline + low
}
func prepareInkPlacement(m Model, word bool) Model {
	if m.SourceID != "" {
		return m
	}
	m = m.Clone()
	metaHeight := 0.0
	for i, b := range m.Blocks {
		if p := b.Paragraph; p != nil {
			if p.Role == "header-meta" {
				metaHeight += p.Before + p.Line + p.After
			}
			if p.Role == "mark-spacer" && i+1 < len(m.Blocks) && m.Blocks[i+1].Table != nil {
				t := m.Blocks[i+1].Table
				if len(t.Rows) > 0 && len(t.Rows[0].Cells) > 0 && len(t.Rows[0].Cells[0].Paragraphs) > 0 {
					q := t.Rows[0].Cells[0].Paragraphs[0]
					p.Line = math.Max(.1, 35-metaHeight-inkTopOffset(q, q.Line, word))
				}
			}
		}
	}
	for _, p := range m.Paragraphs() {
		if p.Role == "agency" && p.Before > 0 {
			p.Before = math.Max(0, 35-metaHeight-inkTopOffset(*p, p.Line, word))
		}
	}
	for i := range m.FirstHeader {
		p := &m.FirstHeader[i]
		if p.Role == "agency" {
			line := p.Line
			if !word {
				line = p.Size * 25.4 / 72 * 1.3
			}
			p.FrameY = math.Max(0, 30-inkTopOffset(*p, line, word))
		}
	}
	if m.Template == "letter" && len(m.FirstHeader) > 1 {
		mark := m.FirstHeader[0]
		top, bottom := glyphInk(mark)
		lineCenter := 30 + bottom - top + 4
		for i := range m.FirstHeader {
			p := &m.FirstHeader[i]
			if p.BorderTop {
				p.FrameY = lineCenter + 1.1
				if word {
					p.FrameY = lineCenter - .26
				}
			}
		}
	}
	return m
}
