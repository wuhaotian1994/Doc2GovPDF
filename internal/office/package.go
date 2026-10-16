package office

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/xml"
	"fmt"
	"github.com/beevik/etree"
	"io"
	"path"
	"strconv"
	"strings"
	"time"
)

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"

type Package struct {
	Original []byte
	Parts    map[string][]byte
	XML      *etree.Document
	Model    Model
	baseline Model
	stories  map[string]string
	elements map[string]*etree.Element
}

func child(e *etree.Element, name string) *etree.Element {
	if e == nil {
		return nil
	}
	for _, c := range e.ChildElements() {
		if c.Tag == name && c.NamespaceURI() == W {
			return c
		}
	}
	return nil
}
func attr(e *etree.Element, name string) string {
	if e == nil {
		return ""
	}
	for _, a := range e.Attr {
		if a.Key == name {
			return a.Value
		}
	}
	return ""
}

func enabled(e *etree.Element) bool {
	return e != nil && attr(e, "val") != "0" && attr(e, "val") != "false" && attr(e, "val") != "off"
}
func number(s string, fallback float64) float64 {
	if n, e := strconv.ParseFloat(s, 64); e == nil {
		return n
	}
	return fallback
}
func descendants(e *etree.Element, name string) []*etree.Element {
	var out []*etree.Element
	if e == nil {
		return out
	}
	for _, c := range e.ChildElements() {
		if c.Tag == name && c.NamespaceURI() == W {
			out = append(out, c)
		}
		out = append(out, descendants(c, name)...)
	}
	return out
}
func parseXML(b []byte) (*etree.Document, error) {
	d := etree.NewDocument()
	if bytes.Contains(bytes.ToUpper(b), []byte("<!DOCTYPE")) {
		return nil, fmt.Errorf("不支持带 DTD 的文档")
	}
	decoder := xml.NewDecoder(bytes.NewReader(b))
	depth, count := 0, 0
	for {
		token, e := decoder.Token()
		if e == io.EOF {
			break
		}
		if e != nil {
			return nil, fmt.Errorf("文档 XML 损坏：%w", e)
		}
		count++
		switch token.(type) {
		case xml.StartElement:
			depth++
		case xml.EndElement:
			depth--
		}
		if depth > 128 || count > 500000 {
			return nil, fmt.Errorf("文档 XML 结构过于复杂")
		}
	}
	if err := d.ReadFromBytes(b); err != nil {
		return nil, fmt.Errorf("文档 XML 损坏：%w", err)
	}
	return d, nil
}
func Open(data []byte) (*Package, error) {
	if len(data) > 50*1024*1024 {
		return nil, fmt.Errorf("文件超过 50 MB")
	}
	z, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, fmt.Errorf("请使用未加密的 DOCX 文件")
	}
	if len(z.File) > 2000 {
		return nil, fmt.Errorf("文档内部对象过多")
	}
	p := &Package{Original: append([]byte(nil), data...), Parts: map[string][]byte{}, elements: map[string]*etree.Element{}}
	total := uint64(0)
	for _, f := range z.File {
		if f.FileInfo().IsDir() {
			continue
		}
		name := f.Name
		if path.Clean(name) != name || strings.HasPrefix(name, "/") || strings.Contains(name, "\\") || strings.HasPrefix(name, "../") {
			return nil, fmt.Errorf("文档内部路径无效")
		}
		if _, ok := p.Parts[name]; ok {
			return nil, fmt.Errorf("文档包含重复文件")
		}
		if strings.Contains(strings.ToLower(name), "vbaproject") || strings.HasPrefix(strings.ToLower(name), "word/embeddings/") {
			return nil, fmt.Errorf("不处理宏或嵌入程序，请另存为普通 DOCX")
		}
		total += f.UncompressedSize64
		if total > 100*1024*1024 || f.UncompressedSize64 > 32*1024*1024 {
			return nil, fmt.Errorf("文档解压后过大")
		}
		r, e := f.Open()
		if e != nil {
			return nil, e
		}
		b, e := io.ReadAll(io.LimitReader(r, 32*1024*1024+1))
		r.Close()
		if e != nil || len(b) > 32*1024*1024 {
			return nil, fmt.Errorf("无法安全读取文档部件")
		}
		p.Parts[name] = b
	}
	p.XML, err = parseXML(p.Parts["word/document.xml"])
	if err != nil {
		return nil, err
	}
	root := p.XML.Root()
	if root == nil || root.Tag != "document" || root.NamespaceURI() != W {
		return nil, fmt.Errorf("不支持此 Word 文档格式")
	}
	body := child(root, "body")
	if body == nil {
		return nil, fmt.Errorf("文档正文缺失")
	}
	p.Model = Model{Page: DefaultPage(), Template: "imported", SourceID: fmt.Sprintf("%x", sha256.Sum256(data)), Warnings: []string{}, Blocks: []Block{}}
	p.stories = map[string]string{}
	styles := readStyles(p.Parts["word/styles.xml"])
	nums := readNumbering(p.Parts["word/numbering.xml"])
	counts := map[string][]int{}
	index := 0
	var paragraph func(*etree.Element) Paragraph
	paragraph = func(e *etree.Element) Paragraph {
		r := Paragraph{ID: fmt.Sprintf("p%d", index), Role: "body", Align: "both", Font: "仿宋", Size: 16, Line: 10.21, Indent: 11.29}
		index++
		p.elements[r.ID] = e
		pr := child(e, "pPr")
		styleID := attr(child(pr, "pStyle"), "val")
		if style, ok := styles[styleID]; ok {
			applyProps(&r, child(style, "pPr"), child(style, "rPr"))
		}
		applyProps(&r, pr, nil)
		r.ExplicitIndent = child(pr, "ind") != nil
		if style := styles[styleID]; style != nil {
			name := strings.ToLower(attr(child(style, "name"), "val"))
			if strings.HasPrefix(name, "heading") {
				r.OutlineLevel = int(number(strings.TrimSpace(strings.TrimPrefix(name, "heading")), 0))
			}
			if ol := child(child(style, "pPr"), "outlineLvl"); ol != nil {
				r.OutlineLevel = int(number(attr(ol, "val"), 9)) + 1
			}
		}
		if ol := child(pr, "outlineLvl"); ol != nil {
			r.OutlineLevel = int(number(attr(ol, "val"), 9)) + 1
		}
		if r.OutlineLevel > 0 && r.OutlineLevel < 5 {
			r.Role = []string{"", "heading", "heading2", "subheading", "subheading"}[r.OutlineLevel]
			r.KeepNext = true
		}
		var walk func(*etree.Element)
		baseFont, baseSize, baseColor, baseItalic, baseBold := r.Font, r.Size, r.Color, r.Italic, r.Bold
		anyItalic, anyRed := false, false
		walk = func(n *etree.Element) {
			if n.NamespaceURI() != W {
				r.Protected = true
				p.Model.PDFUnsupported = true
				return
			}
			if n.NamespaceURI() == W {
				switch n.Tag {
				case "r":
					r.Font, r.Size, r.Color, r.Italic, r.Bold = baseFont, baseSize, baseColor, baseItalic, baseBold
					if style := styles[attr(child(child(n, "rPr"), "rStyle"), "val")]; style != nil {
						applyProps(&r, nil, child(style, "rPr"))
					}
				case "pPr":
					return
				case "del", "moveFrom":
					r.Protected = true
					return
				case "ins", "moveTo", "fldSimple", "fldChar", "sdt", "hyperlink", "commentRangeStart", "commentRangeEnd", "commentReference", "bookmarkStart", "bookmarkEnd":
					r.Protected = true
				case "t":
					anyItalic = anyItalic || r.Italic
					anyRed = anyRed || strings.EqualFold(r.Color, "FF0000")
					r.Text += n.Text()
					return
				case "tab":
					r.Text += "\t"
					return
				case "br", "cr":
					if attr(n, "type") == "page" {
						r.BreakOffsets = append(r.BreakOffsets, len(r.Text))
						r.Protected = true
					} else {
						r.Text += "\n"
					}
					return
				case "drawing", "pict", "object", "sym":
					r.Protected = true
					p.Model.PDFUnsupported = true
					return
				case "footnoteReference", "endnoteReference":
					r.Protected = true
					p.Model.PDFUnsupported = true
				case "rPr":
					if v := child(n, "vertAlign"); v != nil && attr(v, "val") != "baseline" {
						r.Protected = true
						p.Model.PDFUnsupported = true
					}
					applyProps(&r, nil, n)
					return
				}
			}
			for _, c := range n.ChildElements() {
				walk(c)
			}
		}
		walk(e)
		r.Italic = anyItalic
		if anyRed {
			r.Color = "FF0000"
		}
		if np := child(pr, "numPr"); np != nil {
			id := attr(child(np, "numId"), "val")
			lvl := int(number(attr(child(np, "ilvl"), "val"), 0))
			if defs, ok := nums[id]; ok && lvl < len(defs) && lvl >= 0 {
				if counts[id] == nil {
					counts[id] = make([]int, len(defs))
				}
				counts[id][lvl]++
				for j := lvl + 1; j < len(defs); j++ {
					if defs[j].Restart != 0 && (defs[j].Restart < 0 || lvl == defs[j].Restart-1) {
						counts[id][j] = 0
					}
				}
				r.Prefix = formatNumber(defs[lvl], counts[id], lvl)
				r.PrefixFont = defs[lvl].Font
				r.Role = "heading"
				if lvl == 1 {
					r.Role = "heading2"
				} else if lvl >= 2 || len(r.Prefix) > 0 && r.Prefix[0] >= '0' && r.Prefix[0] <= '9' {
					r.Role = "subheading"
				}
				r.KeepNext = true
				if articleLabel.MatchString(r.Prefix) {
					r.Role = "article"
					r.KeepNext = false
				}
			}
		}
		if strings.Contains(strings.ToLower(styleID), "title") || r.Size >= 21 && r.Color != "FF0000" && r.Align == "center" {
			r.Role = "title"
			r.KeepNext = true
		}
		if r.Color == "FF0000" {
			r.Role = "agency"
		}
		if r.AnchorBottom {
			r.Role = "imprint"
		}
		if r.Hanging > 0 && (strings.HasPrefix(r.Text, "出席：") || strings.HasPrefix(r.Text, "请假：") || strings.HasPrefix(r.Text, "列席：")) {
			r.Role = "roster"
		}
		if r.Role == "body" {
			if h1.MatchString(r.Text) {
				r.Role = "heading"
				r.KeepNext = true
			} else if h2.MatchString(r.Text) {
				r.Role = "heading2"
				r.KeepNext = true
			}
		}
		if len(descendants(e, "pPrChange"))+len(descendants(e, "rPrChange")) > 0 {
			r.FormatLocked = true
		}
		if len(descendants(e, "rPrChange")) > 0 {
			r.Protected = true
		}
		if r.Protected {
			for _, g := range editableRunGroups(e) {
				r.EditableRanges = append(r.EditableRanges, TextRange{g.start, g.end})
			}
		}
		return r
	}
	for _, e := range body.ChildElements() {
		switch e.Tag {
		case "p":
			r := paragraph(e)
			p.Model.Blocks = append(p.Model.Blocks, Block{Paragraph: &r})
		case "tbl":
			t := Table{Rows: []Row{}, Borders: strings.Contains(attr(child(child(e, "tblPr"), "tblStyle"), "val"), "Grid"), BorderStyle: "grid"}
			t.Align = attr(child(child(e, "tblPr"), "jc"), "val")
			if size := child(child(e, "tblPr"), "tblW"); attr(size, "type") == "dxa" {
				t.Width = number(attr(size, "w"), 0) / 56.6929
			}
			for _, c := range childElements(child(e, "tblGrid"), "gridCol") {
				t.Widths = append(t.Widths, number(attr(c, "w"), 1000)/56.6929)
			}
			if borders := child(child(e, "tblPr"), "tblBorders"); borders != nil {
				visible := false
				for _, b := range borders.ChildElements() {
					if v := attr(b, "val"); v != "nil" && v != "none" && v != "" {
						visible = true
					}
				}
				t.Borders = visible
				grid := false
				for _, side := range []string{"left", "right", "insideH", "insideV"} {
					b := child(borders, side)
					if v := attr(b, "val"); v != "" && v != "none" && v != "nil" {
						grid = true
					}
				}
				if visible && !grid {
					t.BorderStyle = "three-line"
				}
			}
			for _, tr := range childElements(e, "tr") {
				row := Row{Cells: []Cell{}, Header: enabled(child(child(tr, "trPr"), "tblHeader"))}
				row.Height = number(attr(child(child(tr, "trPr"), "trHeight"), "val"), 0) / 56.6929
				for _, tc := range childElements(tr, "tc") {
					cell := Cell{Paragraphs: []Paragraph{}, Span: int(number(attr(child(child(tc, "tcPr"), "gridSpan"), "val"), 1))}
					cell.VerticalAlign = attr(child(child(tc, "tcPr"), "vAlign"), "val")
					margins := CellMargins{Left: 1.905, Right: 1.905}
					for _, pr := range []*etree.Element{child(child(e, "tblPr"), "tblCellMar"), child(child(tc, "tcPr"), "tcMar")} {
						if pr == nil {
							continue
						}
						for _, item := range []struct {
							tag    string
							target *float64
						}{{"top", &margins.Top}, {"bottom", &margins.Bottom}, {"left", &margins.Left}, {"right", &margins.Right}, {"start", &margins.Left}, {"end", &margins.Right}} {
							if v := child(pr, item.tag); v != nil {
								*item.target = number(attr(v, "w"), 0) / 56.6929
							}
						}
					}
					cell.Margins = &margins
					if borders := child(child(tc, "tcPr"), "tcBorders"); borders != nil {
						cell.NoBorders = true
						for _, border := range borders.ChildElements() {
							if val := attr(border, "val"); val != "nil" && val != "none" && val != "" {
								cell.NoBorders = false
							}
						}
					}
					if vm := child(child(tc, "tcPr"), "vMerge"); vm != nil {
						cell.Merge = attr(vm, "val")
						if cell.Merge == "" {
							cell.Merge = "continue"
						}
					}
					for _, ce := range tc.ChildElements() {
						if ce.Tag == "p" {
							cell.Paragraphs = append(cell.Paragraphs, paragraph(ce))
						} else if ce.Tag == "tbl" {
							return nil, fmt.Errorf("不支持嵌套表格，请先拆分该表格")
						}
					}
					row.Cells = append(row.Cells, cell)
				}
				t.Rows = append(t.Rows, row)
			}
			p.Model.Blocks = append(p.Model.Blocks, Block{Table: &t})
			if rows := childElements(e, "tr"); len(rows) > 0 {
				var widths []float64
				valid := true
				for _, cell := range childElements(rows[0], "tc") {
					pr := child(cell, "tcPr")
					cw := child(pr, "tcW")
					width := number(attr(cw, "w"), 0)
					if attr(cw, "type") != "dxa" || width <= 0 || child(pr, "gridSpan") != nil {
						valid = false
						break
					}
					widths = append(widths, width/56.6929)
				}
				if valid && len(widths) > 0 {
					t.Widths = widths
				}
			}
		case "sectPr":
			p.readPage(e)
		default:
			if e.Tag != "bookmarkStart" && e.Tag != "bookmarkEnd" {
				return nil, fmt.Errorf("正文含暂不支持的结构 %s，原件未改变", e.Tag)
			}
		}
	}
	for i := 0; i+1 < len(p.Model.Blocks); i++ {
		p0 := p.Model.Blocks[i].Paragraph
		if p0 != nil && p.Model.Blocks[i+1].Table != nil && strings.HasPrefix(strings.TrimSpace(p0.Text), "表") && p0.Align == "center" {
			p0.Role = "caption"
		}
	}
	for i, b := range p.Model.Blocks {
		date := b.Paragraph
		if date == nil || date.Align != "right" || !dateStandalone(strings.ReplaceAll(date.Text, " ", "")) {
			continue
		}
		date.Role = "date"
		for j := i - 1; j >= 0 && i-j <= 4; j-- {
			sign := p.Model.Blocks[j].Paragraph
			if sign == nil || sign.Align != "right" || len([]rune(sign.Text)) > 60 || strings.TrimSpace(sign.Text) == "" {
				break
			}
			sign.Role = "signature"
			sign.KeepNext = true
		}
	}
	if p.Model.PDFUnsupported {
		p.Model.Warnings = append(p.Model.Warnings, "图片、公式或脚注等对象保留在 Word 中，当前不能生成此文件的 PDF。")
	}
	for _, r := range p.Model.Paragraphs() {
		if r.Protected {
			p.Model.Warnings = append(p.Model.Warnings, "含已有修订、域或受保护对象的段落只读，原样保留。")
			break
		}
	}
	if rels, err := parseXML(p.Parts["word/_rels/document.xml.rels"]); err == nil && rels.Root() != nil {
		targets := map[string]string{}
		for _, rel := range rels.Root().ChildElements() {
			if attr(rel, "TargetMode") != "External" {
				targets[attr(rel, "Id")] = path.Clean(path.Join("word", attr(rel, "Target")))
			}
		}
		for _, section := range descendants(body, "sectPr") {
			for _, ref := range childElements(section, "headerReference") {
				target := targets[attr(ref, "id")]
				if hd, err := parseXML(p.Parts[target]); err == nil && hd.Root() != nil {
					var lines []Paragraph
					for _, e := range descendants(hd.Root(), "p") {
						lines = append(lines, paragraph(e))
					}
					if attr(ref, "type") == "first" {
						p.Model.FirstHeader = lines
						p.stories["firstHeader"] = target
					} else if attr(ref, "type") == "default" {
						p.Model.Header = lines
						p.stories["header"] = target
					}
				}
			}
			for _, ref := range childElements(section, "footerReference") {
				if fd, err := parseXML(p.Parts[targets[attr(ref, "id")]]); err == nil && fd.Root() != nil {
					if attr(ref, "type") == "first" {
						p.Model.FirstFooter = nil
					}
					for _, e := range descendants(fd.Root(), "p") {
						line := paragraph(e)
						if attr(ref, "type") == "first" {
							p.Model.FirstFooter = append(p.Model.FirstFooter, line)
							p.stories["firstFooter"] = targets[attr(ref, "id")]
						}
						if strings.Trim(line.Text, " \t\r\n—-0123456789") != "" {
							p.Model.PDFUnsupported = true
							p.Model.Warnings = append(p.Model.Warnings, "自定义页脚文字会保留在 Word 中，请选择 Word 导出。")
						}
					}
				}
			}
		}
	}
	if err = p.Model.Validate(); err != nil {
		return nil, err
	}
	if p.Model.HideFirstPageNumber {
		for _, header := range p.Model.FirstHeader {
			if strings.Contains(strings.ToLower(header.BorderStyle), "thick") {
				p.Model.Template = "letter"
				break
			}
		}
	}
	inferStructuralRoles(&p.Model)
	p.baseline = p.Model.Clone()
	return p, nil
}
func childElements(e *etree.Element, name string) []*etree.Element {
	var out []*etree.Element
	if e != nil {
		for _, c := range e.ChildElements() {
			if c.Tag == name && c.NamespaceURI() == W {
				out = append(out, c)
			}
		}
	}
	return out
}
func (p *Package) readPage(e *etree.Element) {
	sz := child(e, "pgSz")
	margin := child(e, "pgMar")
	pg := &p.Model.Page
	pg.Width = number(attr(sz, "w"), 11906) / 56.6929
	pg.Height = number(attr(sz, "h"), 16838) / 56.6929
	pg.Top = number(attr(margin, "top"), 2098) / 56.6929
	pg.Bottom = number(attr(margin, "bottom"), 1984) / 56.6929
	pg.Left = number(attr(margin, "left"), 1587) / 56.6929
	pg.Right = number(attr(margin, "right"), 1474) / 56.6929
	grid := child(e, "docGrid")
	pg.GridType = attr(grid, "type")
	pg.LinePitch = int(number(attr(grid, "linePitch"), 0))
	pg.CharSpace = int(number(attr(grid, "charSpace"), 0))
	p.Model.HideFirstPageNumber = child(e, "titlePg") != nil
}
func applyProps(p *Paragraph, pp, rp *etree.Element) {
	if pp != nil {
		if v := attr(child(pp, "jc"), "val"); v != "" {
			p.Align = v
		}
		sp := child(pp, "spacing")
		p.Before = number(attr(sp, "before"), p.Before*56.6929) / 56.6929
		p.After = number(attr(sp, "after"), p.After*56.6929) / 56.6929
		if attr(sp, "lineRule") == "exact" {
			p.Line = number(attr(sp, "line"), 579) / 56.6929
		}
		ind := child(pp, "ind")
		if tabs := child(pp, "tabs"); tabs != nil {
			p.Tabs = nil
			for _, tab := range childElements(tabs, "tab") {
				p.Tabs = append(p.Tabs, TabStop{Align: attr(tab, "val"), Position: number(attr(tab, "pos"), 0) / 56.6929})
			}
		}
		p.LeftIndent = number(attr(ind, "left"), p.LeftIndent*56.6929) / 56.6929
		p.RightIndent = number(attr(ind, "right"), p.RightIndent*56.6929) / 56.6929
		p.Hanging = number(attr(ind, "hanging"), p.Hanging*56.6929) / 56.6929
		if v := attr(ind, "firstLine"); v != "" {
			p.Indent = number(v, 0) / 56.6929
		}
		if v := attr(ind, "firstLineChars"); v != "" {
			p.Indent = number(v, 0) / 100 * p.Size * 25.4 / 72
		}
		if value := child(pp, "pageBreakBefore"); value != nil {
			p.PageBreak = enabled(value)
		}
		if value := child(pp, "keepNext"); value != nil {
			p.KeepNext = enabled(value)
		}
		p.BorderBottom = child(child(pp, "pBdr"), "bottom") != nil
		if border := child(child(pp, "pBdr"), "bottom"); border != nil {
			p.BorderColor = attr(border, "color")
			p.BorderStyle = attr(border, "val")
			p.BorderWidth = number(attr(border, "sz"), 8) / 8 * 25.4 / 72
		}
		if border := child(child(pp, "pBdr"), "top"); border != nil {
			p.BorderTop = true
			p.BorderColor = attr(border, "color")
			p.BorderStyle = attr(border, "val")
			p.BorderWidth = number(attr(border, "sz"), 8) / 8 * 25.4 / 72
		}
		if frame := child(pp, "framePr"); frame != nil {
			p.AnchorBottom = attr(frame, "vAnchor") == "margin" && attr(frame, "yAlign") == "bottom"
			p.FrameX = number(attr(frame, "x"), 0) / 56.6929
			p.FrameY = number(attr(frame, "y"), 0) / 56.6929
			p.FrameWidth = number(attr(frame, "w"), 0) / 56.6929
		}
	}
	if rp != nil {
		if bold := child(rp, "b"); bold != nil {
			p.Bold = enabled(bold)
		}
		if italic := child(rp, "i"); italic != nil && attr(italic, "val") != "0" && attr(italic, "val") != "false" {
			p.Italic = true
		}
		if v := attr(child(rp, "rFonts"), "eastAsia"); v != "" {
			p.Font = v
		}
		p.Size = number(attr(child(rp, "sz"), "val"), p.Size*2) / 2
		if v := attr(child(rp, "color"), "val"); v != "" && v != "auto" {
			p.Color = strings.ToUpper(v)
		}
	}
}
func readStyles(data []byte) map[string]*etree.Element {
	out := map[string]*etree.Element{}
	d, e := parseXML(data)
	if e != nil {
		return out
	}
	for _, s := range childElements(d.Root(), "style") {
		out[attr(s, "styleId")] = s
	}
	return out
}

type numLevel struct {
	Format, Text string
	Start        int
	Font         string
	Restart      int
}

func readNumbering(data []byte) map[string][]numLevel {
	out := map[string][]numLevel{}
	d, e := parseXML(data)
	if e != nil {
		return out
	}
	abstract := map[string][]numLevel{}
	for _, a := range childElements(d.Root(), "abstractNum") {
		levels := make([]numLevel, 9)
		for _, l := range childElements(a, "lvl") {
			i := int(number(attr(l, "ilvl"), 0))
			if i < 0 || i > 8 {
				continue
			}
			levels[i] = numLevel{attr(child(l, "numFmt"), "val"), attr(child(l, "lvlText"), "val"), int(number(attr(child(l, "start"), "val"), 1)), attr(child(child(l, "rPr"), "rFonts"), "eastAsia"), int(number(attr(child(l, "lvlRestart"), "val"), -1))}
		}
		abstract[attr(a, "abstractNumId")] = levels
	}
	for _, n := range childElements(d.Root(), "num") {
		out[attr(n, "numId")] = abstract[attr(child(n, "abstractNumId"), "val")]
	}
	return out
}
func chinese(n int) string {
	digits := []rune("零一二三四五六七八九")
	if n < 0 || n >= 100000000 {
		return strconv.Itoa(n)
	}
	if n == 0 {
		return "零"
	}
	if n >= 10000 {
		out := chinese(n/10000) + "万"
		rest := n % 10000
		if rest > 0 {
			if rest < 1000 {
				out += "零"
			}
			out += chinese(rest)
		}
		return out
	}
	var out strings.Builder
	zero := false
	for i, unit := range []int{1000, 100, 10, 1} {
		digit := n / unit
		n %= unit
		if digit == 0 {
			if out.Len() > 0 && n > 0 {
				zero = true
			}
			continue
		}
		if zero {
			out.WriteRune('零')
			zero = false
		}
		if !(unit == 10 && digit == 1 && out.Len() == 0) {
			out.WriteRune(digits[digit])
		}
		out.WriteString([]string{"千", "百", "十", ""}[i])
	}
	return out.String()
}
func formatNumber(l numLevel, counts []int, level int) string {
	s := l.Text
	for i, n := range counts {
		if n == 0 {
			n = 1
		}
		if i == level {
			n += l.Start - 1
		}
		v := strconv.Itoa(n)
		if strings.Contains(l.Format, "chinese") || strings.Contains(l.Format, "ideograph") {
			v = chinese(n)
		}
		s = strings.ReplaceAll(s, fmt.Sprintf("%%%d", i+1), v)
	}
	return s
}
func (p *Package) Export(m Model, tracked bool) ([]byte, error) {
	if e := m.Validate(); e != nil {
		return nil, e
	}
	if m.SourceID != p.Model.SourceID {
		return nil, fmt.Errorf("文档来源不匹配")
	}
	old := p.baseline.Paragraphs()
	next := m.Paragraphs()
	if len(old) != len(next) {
		return nil, fmt.Errorf("导入文档不能直接增删结构，请新建文档后重新排版")
	}
	d := p.XML.Copy()
	d.Root().CreateAttr("xmlns:w", W)
	body := child(d.Root(), "body")
	list := bodyParagraphElements(body)
	if len(list) != len(old) {
		return nil, fmt.Errorf("原文段落结构无法安全修改")
	}
	changed := false
	roots := []*etree.Element{d.Root()}
	for name, data := range p.Parts {
		if name != "word/document.xml" && strings.HasSuffix(name, ".xml") {
			if part, e := parseXML(data); e == nil && part.Root() != nil {
				roots = append(roots, part.Root())
			}
		}
	}
	nextID := revisionIDs(roots...)
	if m.Page != p.baseline.Page {
		for _, section := range descendants(body, "sectPr") {
			if section.Parent() != nil && section.Parent().Tag == "sectPrChange" {
				continue
			}
			oldSection := section.Copy()
			grid := child(section, "docGrid")
			if grid == nil {
				grid = section.CreateElement("w:docGrid")
			}
			grid.CreateAttr("w:type", m.Page.GridType)
			grid.CreateAttr("w:linePitch", strconv.Itoa(m.Page.LinePitch))
			grid.CreateAttr("w:charSpace", strconv.Itoa(m.Page.CharSpace))
			sz := child(section, "pgSz")
			if sz == nil {
				sz = section.CreateElement("w:pgSz")
			}
			sz.CreateAttr("w:w", strconv.Itoa(twips(m.Page.Width)))
			sz.CreateAttr("w:h", strconv.Itoa(twips(m.Page.Height)))
			margin := child(section, "pgMar")
			if margin == nil {
				margin = etree.NewElement("w:pgMar")
				section.InsertChildAt(sz.Index()+1, margin)
			}
			for key, v := range map[string]float64{"top": m.Page.Top, "bottom": m.Page.Bottom, "left": m.Page.Left, "right": m.Page.Right} {
				margin.CreateAttr("w:"+key, strconv.Itoa(twips(v)))
			}
			if tracked && child(section, "sectPrChange") == nil {
				change := section.CreateElement("w:sectPrChange")
				change.CreateAttr("w:id", nextID())
				change.CreateAttr("w:author", "Doc2GovPDF")
				change.CreateAttr("w:date", time.Now().UTC().Format(time.RFC3339))
				change.AddChild(oldSection)
			}
			if change := child(section, "sectPrChange"); change != nil {
				section.RemoveChild(change)
				section.AddChild(change)
			}
		}
		changed = true
	}
	for i, r := range next {
		if r.ID != old[i].ID {
			return nil, fmt.Errorf("段落顺序已改变")
		}
		formatChanged := !sameFormat(*r, *old[i])
		if old[i].FormatLocked && formatChanged {
			return nil, fmt.Errorf("此段有原有格式修订，请保留其格式；正文仍可单独修改")
		}
		if r.Text == old[i].Text && !formatChanged {
			continue
		}
		if old[i].Protected {
			if formatChanged {
				if len(old[i].EditableRanges) == 0 {
					return nil, fmt.Errorf("此段包含原有修订或对象，不能自动修改格式")
				}
				reviseFormatOnRuns(list[i], *r, tracked, nextID, true)
			}
			if e := rewriteProtectedText(list[i], old[i].Text, r.Text, tracked, nextID); e != nil {
				return nil, e
			}
			changed = true
			continue
		}
		changed = true
		para := list[i]
		if formatChanged {
			reviseFormat(para, *r, tracked, nextID)
		}
		if r.Text == old[i].Text {
			continue
		}
		var children []*etree.Element
		for _, c := range para.ChildElements() {
			if c.Tag != "pPr" {
				children = append(children, c)
			}
		}
		var props *etree.Element
		if len(children) > 0 && children[0].Tag == "r" {
			if rp := child(children[0], "rPr"); rp != nil {
				props = rp.Copy()
			}
		}
		for _, c := range children {
			para.RemoveChild(c)
		}
		if tracked {
			stripOwnRunHistory(props)
			del := para.CreateElement("w:del")
			del.CreateAttr("w:id", nextID())
			del.CreateAttr("w:author", "Doc2GovPDF")
			del.CreateAttr("w:date", time.Now().UTC().Format(time.RFC3339))
			for _, c := range children {
				del.AddChild(c)
				for _, t := range descendants(c, "t") {
					t.Tag = "delText"
				}
			}
			ins := para.CreateElement("w:ins")
			ins.CreateAttr("w:id", nextID())
			ins.CreateAttr("w:author", "Doc2GovPDF")
			ins.CreateAttr("w:date", time.Now().UTC().Format(time.RFC3339))
			addParagraphText(ins, *r, props)
		} else {
			addParagraphText(para, *r, props)
		}
	}
	bodyChanged := changed
	overrides := map[string][]byte{}
	for kind, name := range p.stories {
		before, after := p.baseline.Header, m.Header
		switch kind {
		case "firstHeader":
			before, after = p.baseline.FirstHeader, m.FirstHeader
		case "firstFooter":
			before, after = p.baseline.FirstFooter, m.FirstFooter
		}
		data, edited, err := rewriteStory(p.Parts[name], before, after, tracked, nextID)
		if err != nil {
			return nil, err
		}
		if edited {
			overrides[name] = data
			changed = true
		}
	}
	if m.LayoutNormalized {
		footerParts, e := normalizedFooterParts(p.Parts, d)
		if e != nil {
			return nil, e
		}
		if len(footerParts) > 0 {
			changed = true
			bodyChanged = true
		}
		for name, data := range footerParts {
			overrides[name] = data
		}
	}
	if !changed {
		return append([]byte(nil), p.Original...), nil
	}
	xml := p.Parts["word/document.xml"]
	var e error
	if bodyChanged {
		xml, e = d.WriteToBytes()
		if e != nil {
			return nil, e
		}
	}
	var b bytes.Buffer
	z := zip.NewWriter(&b)
	zr, _ := zip.NewReader(bytes.NewReader(p.Original), int64(len(p.Original)))
	for _, entry := range zr.File {
		if entry.FileInfo().IsDir() {
			continue
		}
		w, e := z.Create(entry.Name)
		if e != nil {
			return nil, e
		}
		v := p.Parts[entry.Name]
		if entry.Name == "word/document.xml" {
			v = xml
		}
		if override, ok := overrides[entry.Name]; ok {
			v = override
		}
		if _, e = w.Write(v); e != nil {
			return nil, e
		}
	}
	for name, data := range overrides {
		if _, exists := p.Parts[name]; !exists {
			w, e := z.Create(name)
			if e != nil {
				return nil, e
			}
			if _, e = w.Write(data); e != nil {
				return nil, e
			}
		}
	}
	if e = z.Close(); e != nil {
		return nil, e
	}
	return b.Bytes(), nil
}
func addRun(parent *etree.Element, text string, props *etree.Element) {
	r := parent.CreateElement("w:r")
	if props != nil {
		r.AddChild(props)
	}
	for i, line := range strings.Split(text, "\n") {
		if i > 0 {
			r.CreateElement("w:br")
		}
		for j, text := range strings.Split(line, "\t") {
			if j > 0 {
				r.CreateElement("w:tab")
			}
			t := r.CreateElement("w:t")
			t.CreateAttr("xml:space", "preserve")
			t.SetText(text)
		}
	}
}

func revisionIDs(roots ...*etree.Element) func() string {
	next := int64(100000)
	var scan func(*etree.Element)
	scan = func(e *etree.Element) {
		if n, err := strconv.ParseInt(attr(e, "id"), 10, 64); err == nil && n >= next && n < (1<<60) {
			next = n + 1
		}
		for _, c := range e.ChildElements() {
			scan(c)
		}
	}
	for _, root := range roots {
		if root != nil {
			scan(root)
		}
	}
	return func() string { s := strconv.FormatInt(next, 10); next++; return s }
}
