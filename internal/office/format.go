package office

import (
	"fmt"
	"github.com/beevik/etree"
	"math"
	"strconv"
	"strings"
	"time"
)

func NormalizeLayout(m Model) Model {
	m = m.Clone()
	m.LayoutNormalized = true
	m.Page.GridType = "linesAndChars"
	m.Page.LinePitch = 579
	m.Page.CharSpace = -842
	hasTitle := false
	for _, p := range m.Paragraphs() {
		if p.Role == "title" {
			hasTitle = true
			break
		}
	}
	for i, b := range m.Blocks {
		if i >= 8 || hasTitle {
			break
		}
		p := b.Paragraph
		if p != nil && strings.HasSuffix(strings.TrimSpace(p.Text), "期") && strings.ContainsAny(p.Text, "0123456789") {
			continue
		}
		if p != nil && !p.Protected && !p.FormatLocked && p.Align == "center" && p.Color != "FF0000" && p.Role == "body" && strings.TrimSpace(p.Text) != "" && !strings.Contains(p.Text, "号") && !dateStandalone(strings.ReplaceAll(p.Text, " ", "")) {
			p.Role = "title"
			break
		}
	}
	for _, p := range m.Paragraphs() {
		if p.Role == "title" {
			hasTitle = true
			break
		}
	}
	inBody := !hasTitle
	if m.Template != "letter" && len(m.FirstHeader) == 0 {
		want := DefaultPage()
		a, b := []float64{m.Page.Width, m.Page.Height, m.Page.Top, m.Page.Bottom, m.Page.Left, m.Page.Right}, []float64{want.Width, want.Height, want.Top, want.Bottom, want.Left, want.Right}
		for i := range a {
			if math.Abs(a[i]-b[i]) > .1 {
				m.Page = want
				break
			}
		}
	}
	for _, b := range m.Blocks {
		if b.Paragraph == nil || (b.Paragraph.Protected && len(b.Paragraph.EditableRanges) == 0) || b.Paragraph.FormatLocked || b.Paragraph.Role == "agency" || b.Paragraph.Color == "FF0000" {
			continue
		}
		p := b.Paragraph
		p.Italic = false
		if p.Role == "title" {
			inBody = true
		}
		if !inBody || strings.TrimSpace(p.Text) == "" {
			continue
		}
		switch p.Role {
		case "body", "article", "attachment-body":
			p.Font = "仿宋"
			p.Size = 16
			p.Line = 10.21
			if (p.Align == "both" || p.Align == "left") && !p.ExplicitIndent && math.Abs(p.Indent-11.29) > .2 {
				p.Indent = 11.29
			}
		case "heading":
			p.Font = "黑体"
			if chapterLabel.MatchString(p.Prefix + p.Text) {
				p.Font = "方正小标宋简体"
			}
			p.Size = 16
			p.Line = 10.21
		case "heading2":
			p.Font = "楷体"
			p.Size = 16
			p.Line = 10.21
		case "roster":
			p.Font = "仿宋"
			p.Size = 16
			p.Line = 10.21
		case "subheading", "heading3", "heading4":
			p.Font = "仿宋"
			p.Size = 16
			p.Line = 10.21
		case "title":
			p.Font = "方正小标宋简体"
			p.Size = 22
			p.Indent = 0
			p.Align = "center"
			p.KeepNext = true
		}
		if p.Role == "body" || p.Role == "heading" || p.Role == "heading2" || p.Role == "subheading" || p.Role == "title" {
			p.Bold = false
		}
	}
	return m
}
func sameFormat(a, b Paragraph) bool {
	canonical := func(s string) string {
		switch strings.ToLower(s) {
		case "fangsong":
			return "仿宋"
		case "simhei":
			return "黑体"
		case "kaiti":
			return "楷体"
		case "simsun":
			return "宋体"
		}
		return s
	}
	if a.Bold != b.Bold || a.Italic != b.Italic || canonical(a.Font) != canonical(b.Font) || a.Color != b.Color || a.Align != b.Align || a.PageBreak != b.PageBreak || a.KeepNext != b.KeepNext {
		return false
	}
	x, y := []float64{a.LeftIndent, a.RightIndent, a.Hanging, a.Size, a.Before, a.After, a.Line, a.Indent}, []float64{b.LeftIndent, b.RightIndent, b.Hanging, b.Size, b.Before, b.After, b.Line, b.Indent}
	for i := range x {
		if math.Abs(x[i]-y[i]) > .02 {
			return false
		}
	}
	return true
}
func reviseFormat(e *etree.Element, p Paragraph, tracked bool, nextID func() string) {
	reviseFormatOnRuns(e, p, tracked, nextID, false)
}
func reviseFormatOnRuns(e *etree.Element, p Paragraph, tracked bool, nextID func() string, safeOnly bool) {
	pp := child(e, "pPr")
	if pp == nil {
		pp = etree.NewElement("w:pPr")
		e.InsertChildAt(0, pp)
	}
	old := pp.Copy()
	for _, tag := range []string{"jc", "spacing", "ind", "keepNext", "pageBreakBefore"} {
		if v := child(pp, tag); v != nil {
			pp.RemoveChild(v)
		}
	}
	jc := pp.CreateElement("w:jc")
	jc.CreateAttr("w:val", p.Align)
	spacing := pp.CreateElement("w:spacing")
	spacing.CreateAttr("w:before", strconv.Itoa(twips(p.Before)))
	spacing.CreateAttr("w:after", strconv.Itoa(twips(p.After)))
	spacing.CreateAttr("w:line", strconv.Itoa(twips(p.Line)))
	spacing.CreateAttr("w:lineRule", "exact")
	indent := pp.CreateElement("w:ind")
	indent.CreateAttr("w:firstLine", strconv.Itoa(twips(p.Indent)))
	indent.CreateAttr("w:left", strconv.Itoa(twips(p.LeftIndent)))
	indent.CreateAttr("w:right", strconv.Itoa(twips(p.RightIndent)))
	if p.Hanging > 0 {
		indent.RemoveAttr("w:firstLine")
		indent.CreateAttr("w:hanging", strconv.Itoa(twips(p.Hanging)))
	}
	if p.KeepNext {
		pp.CreateElement("w:keepNext")
	}
	if p.PageBreak {
		pp.CreateElement("w:pageBreakBefore")
	}
	if tracked {
		change := pp.CreateElement("w:pPrChange")
		change.CreateAttr("w:id", nextID())
		change.CreateAttr("w:author", "Doc2GovPDF")
		change.CreateAttr("w:date", time.Now().UTC().Format(time.RFC3339))
		change.AddChild(old)
	}
	for _, run := range descendants(e, "r") {
		if safeOnly && (run.Parent() != e || !simpleEditableRun(run)) {
			continue
		}
		rp := child(run, "rPr")
		if rp == nil {
			rp = etree.NewElement("w:rPr")
			run.InsertChildAt(0, rp)
		}
		old := rp.Copy()
		for _, tag := range []string{"rFonts", "sz", "szCs", "color", "b", "bCs"} {
			if v := child(rp, tag); v != nil {
				rp.RemoveChild(v)
			}
		}
		if p.Bold {
			rp.CreateElement("w:b")
		}
		font := rp.CreateElement("w:rFonts")
		fontName := p.Font
		if p.Role == "roster" {
			for _, text := range descendants(run, "t") {
				if strings.HasSuffix(text.Text(), "：") {
					fontName = "黑体"
				}
			}
		}
		if !p.Italic {
			if italic := child(rp, "i"); italic != nil {
				rp.RemoveChild(italic)
			}
		}
		for _, key := range []string{"ascii", "hAnsi", "eastAsia"} {
			font.CreateAttr("w:"+key, fontName)
		}
		size := rp.CreateElement("w:sz")
		size.CreateAttr("w:val", fmt.Sprint(int(p.Size*2)))
		color := p.Color
		if color == "" {
			color = "000000"
		}
		rp.CreateElement("w:color").CreateAttr("w:val", color)
		if tracked {
			change := rp.CreateElement("w:rPrChange")
			change.CreateAttr("w:id", nextID())
			change.CreateAttr("w:author", "Doc2GovPDF")
			change.CreateAttr("w:date", time.Now().UTC().Format(time.RFC3339))
			change.AddChild(old)
		}
	}
}
