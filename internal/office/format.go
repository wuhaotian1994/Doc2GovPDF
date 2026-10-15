package office

import (
	"fmt"
	"github.com/beevik/etree"
	"strconv"
	"strings"
	"time"
)

func NormalizeLayout(m Model) Model {
	m = m.Clone()
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
	inBody := !hasTitle
	if m.Template != "letter" && len(m.FirstHeader) == 0 {
		m.Page = DefaultPage()
	}
	for _, b := range m.Blocks {
		if b.Paragraph == nil || b.Paragraph.Protected {
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
		case "body", "article", "attachment-description", "attachment-body":
			p.Font = "仿宋"
			p.Size = 16
			p.Line = 10.21
			if p.Align == "both" || p.Align == "left" {
				p.Indent = 11.29
			}
		case "heading":
			p.Font = "黑体"
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
		case "title":
			p.Font = "方正小标宋简体"
			p.Size = 22
			p.Indent = 0
			p.Align = "center"
			p.KeepNext = true
		}
	}
	return m
}
func sameFormat(a, b Paragraph) bool {
	return a.Italic == b.Italic && a.LeftIndent == b.LeftIndent && a.RightIndent == b.RightIndent && a.Hanging == b.Hanging && a.Font == b.Font && a.Size == b.Size && a.Color == b.Color && a.Align == b.Align && a.Before == b.Before && a.After == b.After && a.Line == b.Line && a.Indent == b.Indent && a.PageBreak == b.PageBreak && a.KeepNext == b.KeepNext
}
func reviseFormat(e *etree.Element, p Paragraph, tracked bool, nextID func() string) {
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
		rp := child(run, "rPr")
		if rp == nil {
			rp = etree.NewElement("w:rPr")
			run.InsertChildAt(0, rp)
		}
		old := rp.Copy()
		for _, tag := range []string{"rFonts", "sz", "szCs", "color"} {
			if v := child(rp, tag); v != nil {
				rp.RemoveChild(v)
			}
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
