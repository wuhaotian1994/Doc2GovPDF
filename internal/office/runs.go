package office

import (
	"fmt"
	"github.com/beevik/etree"
	"strings"
)

// The inserted run already has its final formatting. The old run keeps the
// original format revision inside the deletion; copying it would duplicate IDs.
func stripOwnRunHistory(props *etree.Element) {
	if props == nil {
		return
	}
	for _, c := range props.ChildElements() {
		if c.Tag == "rPrChange" && attr(c, "author") == "Doc2GovPDF" {
			props.RemoveChild(c)
		}
	}
}

func addParagraphText(parent *etree.Element, p Paragraph, props *etree.Element) {
	add := func(text, font string) {
		var rp *etree.Element
		if props != nil {
			rp = props.Copy()
		} else {
			rp = etree.NewElement("w:rPr")
		}
		if old := child(rp, "rFonts"); old != nil {
			rp.RemoveChild(old)
		}
		fonts := rp.CreateElement("w:rFonts")
		for _, k := range []string{"ascii", "hAnsi", "eastAsia"} {
			fonts.CreateAttr("w:"+k, font)
		}
		if size := child(rp, "sz"); size != nil {
			size.CreateAttr("w:val", fmt.Sprint(int(p.Size*2)))
		}
		addRun(parent, text, rp)
	}
	if p.Role == "roster" {
		if parts := strings.SplitN(p.Text, "：", 2); len(parts) == 2 {
			add(parts[0]+"：", "黑体")
			add(parts[1], "仿宋")
			return
		}
	}
	if len(p.Tabs) > 0 && strings.Contains(p.Text, "签发人：") {
		parts := strings.SplitN(p.Text, "签发人：", 2)
		add(parts[0]+"签发人：", "仿宋")
		add(parts[1], "楷体")
		return
	}
	addRun(parent, p.Text, props)
}
