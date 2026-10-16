package office

import (
	"fmt"
	"regexp"
	"strings"
)

var manualHeadingPrefix = regexp.MustCompile(`^(?:[一二三四五六七八九十百]+、|（[一二三四五六七八九十百]+）|[0-9]+[.]|（[0-9]+）)\s*`)
var manualArticlePrefix = regexp.MustCompile(`^第[一二三四五六七八九十百千0-9]+[章条]\s*`)

func RenumberDocument(m Model) Model {
	if m.SourceID != "" {
		return m
	}
	if !m.AutoNumbering {
		m = m.Clone()
		for _, p := range m.Paragraphs() {
			if p.AutoNumbered {
				p.Text = p.Prefix + p.Text
				p.Prefix = ""
				p.PrefixFont = ""
				p.AutoNumbered = false
				p.OutlineLevel = 0
			}
		}
		return m
	}
	m = m.Clone()
	counts := [4]int{}
	for _, b := range m.Blocks {
		p := b.Paragraph
		if p == nil || p.Protected || p.PageBreak {
			continue
		}
		level := 0
		switch p.Role {
		case "heading":
			level = 1
		case "heading2", "article":
			level = 2
		case "heading3", "subheading":
			level = 3
		case "heading4":
			level = 4
		}
		if level == 0 {
			p.AutoNumbered = false
			continue
		}
		if !p.AutoNumbered {
			if m.Template == "rules" && level <= 2 {
				if manualArticlePrefix.MatchString(p.Text) {
					p.Text = manualArticlePrefix.ReplaceAllString(p.Text, "")
				} else {
					p.Text = manualHeadingPrefix.ReplaceAllString(p.Text, "")
				}
			} else {
				p.Text = manualHeadingPrefix.ReplaceAllString(p.Text, "")
			}
		}
		counts[level-1]++
		{
			from := level
			if m.Template == "rules" && from < 2 {
				from = 2
			}
			for i := from; i < 4; i++ {
				counts[i] = 0
			}
		}
		p.AutoNumbered = true
		p.OutlineLevel = level
		if m.Template == "rules" {
			if level == 1 {
				p.Prefix = "第" + chinese(counts[0]) + "章 "
				p.PrefixFont = "方正小标宋简体"
				p.Font = "方正小标宋简体"
				p.Align = "center"
				p.Indent = 0
			} else if level == 2 {
				p.Prefix = "第" + chinese(counts[1]) + "条 "
				p.PrefixFont = "黑体"
				p.Role = "article"
				p.Font = "仿宋"
				p.KeepNext = false
			} else if level == 3 {
				p.Prefix = "（" + chinese(counts[2]) + "）"
				p.PrefixFont = "仿宋"
			} else {
				p.Prefix = fmt.Sprint(counts[3]) + "."
				p.PrefixFont = "仿宋"
			}
		}
		if m.Template != "rules" {
			switch level {
			case 1:
				p.Prefix = chinese(counts[0]) + "、"
			case 2:
				p.Prefix = "（" + chinese(counts[1]) + "）"
			case 3:
				p.Prefix = fmt.Sprint(counts[2]) + "."
			case 4:
				p.Prefix = "（" + fmt.Sprint(counts[3]) + "）"
			}
			p.PrefixFont = p.Font
		}
	}
	return m
}
func addNumberingPart(parts map[string]string, m Model) {
	if !m.AutoNumbering {
		return
	}
	var levels strings.Builder
	for i := 0; i < 4; i++ {
		format, text, font := "decimal", fmt.Sprintf("%%%d.", i+1), "仿宋"
		restart := ""
		switch i {
		case 0:
			format = "chineseCountingThousand"
			text = "%1、"
			font = "黑体"
		case 1:
			format = "chineseCountingThousand"
			text = "（%2）"
			font = "楷体"
		case 3:
			text = "（%4）"
		}
		if m.Template == "rules" {
			format = "chineseCountingThousand"
			if i == 0 {
				text = "第%1章 "
				font = "方正小标宋简体"
			} else if i == 1 {
				text = "第%2条 "
				font = "黑体"
				restart = `<w:lvlRestart w:val="0"/>`
			} else if i == 2 {
				text = "（%3）"
				font = "仿宋"
			} else {
				format = "decimal"
				text = "%4."
				font = "仿宋"
			}
		}
		fmt.Fprintf(&levels, `<w:lvl w:ilvl="%d"><w:start w:val="1"/><w:numFmt w:val="%s"/><w:lvlText w:val="%s"/><w:suff w:val="nothing"/>%s<w:rPr><w:rFonts w:ascii="%s" w:eastAsia="%s"/><w:sz w:val="32"/></w:rPr></w:lvl>`, i, format, text, restart, font, font)
	}
	parts["word/numbering.xml"] = `<w:numbering xmlns:w="` + W + `"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="multilevel"/>` + levels.String() + `</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`
	parts["[Content_Types].xml"] = strings.Replace(parts["[Content_Types].xml"], "</Types>", `<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`, 1)
	parts["word/_rels/document.xml.rels"] = strings.Replace(parts["word/_rels/document.xml.rels"], "</Relationships>", `<Relationship Id="numbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`, 1)
}
