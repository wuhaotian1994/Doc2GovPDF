package office

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"fmt"
	"regexp"
	"strings"
)

type Template struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Hint string `json:"hint"`
}

func Templates() []Template {
	return []Template{{"notice", "通知", "告知工作安排和需要执行的事项"}, {"report", "报告", "向上级汇报工作、情况或结果"}, {"request", "请示", "就具体事项请求上级批准"}, {"letter", "函", "不相隶属单位之间商洽和答复"}, {"minutes", "纪要", "记录会议议定事项"}, {"rules", "管理办法", "按章、条组织制度内容"}, {"plain", "非红头文书", "企业内部材料及一般文书"}}
}

type Fields struct {
	Kind        string   `json:"kind"`
	Title       string   `json:"title"`
	Agency      string   `json:"agency"`
	Reference   string   `json:"reference"`
	Recipient   string   `json:"recipient"`
	Body        string   `json:"body"`
	Date        string   `json:"date"`
	Signer      string   `json:"signer"`
	CopyTo      string   `json:"copyTo"`
	Attachments []string `json:"attachments"`
	Letterhead  bool     `json:"letterhead"`
	AnnexPages  bool     `json:"annexPages"`
	Attendees   string   `json:"attendees"`
	Absentees   string   `json:"absentees"`
	Observers   string   `json:"observers"`
}

var h1 = regexp.MustCompile(`^[一二三四五六七八九十百]+、`)
var h2 = regexp.MustCompile(`^（[一二三四五六七八九十百]+）`)
var article = regexp.MustCompile(`^第[一二三四五六七八九十百千]+[章条]`)

func NewDocument(f Fields) (Model, error) {
	valid := false
	for _, t := range Templates() {
		if t.ID == f.Kind {
			valid = true
		}
	}
	if !valid {
		return Model{}, fmt.Errorf("请选择文种")
	}
	if strings.TrimSpace(f.Title) == "" || strings.TrimSpace(f.Body) == "" {
		return Model{}, fmt.Errorf("请填写标题和正文")
	}
	if f.Letterhead && strings.TrimSpace(f.Agency) == "" {
		return Model{}, fmt.Errorf("显示红头时请填写发文单位")
	}
	if f.Signer != "" && f.Kind != "request" && f.Kind != "report" {
		return Model{}, fmt.Errorf("签发人适用于上行文，请选择请示或报告")
	}
	if f.Kind != "minutes" && (f.Attendees != "" || f.Absentees != "" || f.Observers != "") {
		return Model{}, fmt.Errorf("填写参会名单时请选择纪要文种")
	}
	attachments := []string{}
	for _, name := range f.Attachments {
		if strings.TrimSpace(name) != "" {
			attachments = append(attachments, strings.TrimSpace(name))
		}
	}
	f.Attachments = attachments
	m := Model{Page: DefaultPage(), Template: f.Kind, Warnings: []string{}, Blocks: []Block{}}
	id := 0
	add := func(text, role string) *Paragraph {
		p := &Paragraph{ID: fmt.Sprintf("p%d", id), Text: text, Role: role, Font: "仿宋", Size: 16, Line: 10.21, Align: "both", Indent: 11.29}
		id++
		switch role {
		case "title":
			p.Font = "方正小标宋简体"
			p.Size = 22
			p.Align = "center"
			p.Indent = 0
			p.After = 10
			p.KeepNext = true
		case "agency":
			p.Font = "方正小标宋简体"
			p.Size = 30
			p.Color = "FF0000"
			p.Align = "center"
			p.Indent = 0
			p.Line = 15
			p.After = 20
			p.Before = 35
			p.KeepNext = true
		case "reference":
			p.Align = "center"
			p.Indent = 0
			p.After = 12
			p.KeepNext = true
		case "recipient":
			p.Indent = 0
			p.KeepNext = true
		case "heading":
			p.Font = "黑体"
			p.KeepNext = true
		case "heading2":
			p.Font = "楷体"
			p.KeepNext = true
		case "signature", "date":
			p.Align = "right"
			p.Indent = 0
			p.RightIndent = 22.58
		case "imprint":
			p.Size = 14
			p.Indent = 0
			p.Line = 6.98
			p.AnchorBottom = true
		}
		m.Blocks = append(m.Blocks, Block{Paragraph: p})
		return p
	}
	if f.Kind == "letter" {
		m.Page.Top = 30
		m.HideFirstPageNumber = true
	}
	if f.Letterhead && f.Agency != "" {
		label := f.Agency
		if f.Kind == "minutes" {
			label += "纪要"
		} else if f.Kind != "letter" {
			label += "文件"
		}
		p := add(label, "agency")
		if f.Kind == "letter" {
			p.Before = 0
			p.After = 0
			p.FrameX = 28
			p.FrameY = 30
			p.FrameWidth = 156
			p.KeepNext = false
			m.Blocks = m.Blocks[:len(m.Blocks)-1]
			m.FirstHeader = []Paragraph{*p, {ID: "letter-head-line", Font: "仿宋", Size: 16, Line: 2.1, FrameX: 20.5, FrameY: 48, FrameWidth: 169, BorderTop: true, BorderColor: "FF0000", BorderStyle: "thinThickSmallGap"}}
			m.FirstFooter = []Paragraph{{ID: "letter-foot-line", Font: "仿宋", Size: 16, Line: 2.1, FrameX: 20.5, FrameY: 277, FrameWidth: 169, BorderTop: true, BorderColor: "FF0000", BorderStyle: "thickThinSmallGap"}}
		}
		ref := f.Reference
		if f.Signer != "" {
			ref += "\t签发人：" + f.Signer
		}
		if ref != "" {
			p = add(ref, "reference")
			p.BorderBottom = f.Kind != "letter"
			p.BorderColor = "FF0000"
			if f.Signer != "" {
				p.Align = "left"
				p.Indent = 5.64
				p.Tabs = []TabStop{{Align: "right", Position: 150.36}}
			}
			if f.Kind == "letter" {
				p.Align = "right"
			}
		}
	}
	add(f.Title, "title")
	if !f.Letterhead && (f.Reference != "" || f.Signer != "") {
		text := f.Reference
		if f.Signer != "" {
			text += "\t签发人：" + f.Signer
		}
		p := add(text, "reference")
		if f.Signer != "" {
			p.Align = "left"
			p.Indent = 5.64
			p.Tabs = []TabStop{{Align: "right", Position: 150.36}}
		}
	}
	if f.Recipient != "" {
		add(strings.TrimRight(f.Recipient, "：:")+"：", "recipient")
	}
	for _, line := range strings.Split(strings.ReplaceAll(f.Body, "\r\n", "\n"), "\n") {
		role := "body"
		if h1.MatchString(line) || article.MatchString(line) {
			role = "heading"
		}
		if h2.MatchString(line) {
			role = "heading2"
		}
		add(line, role)
	}
	for i, name := range f.Attachments {
		if strings.TrimSpace(name) == "" {
			continue
		}
		label := "附件："
		if len(f.Attachments) > 1 {
			label += fmt.Sprintf("%d. ", i+1)
		}
		add(label+name, "body")
	}
	if f.Kind == "minutes" {
		for _, entry := range [][2]string{{"出席", f.Attendees}, {"请假", f.Absentees}, {"列席", f.Observers}} {
			if entry[1] == "" {
				continue
			}
			p := add(entry[0]+"："+entry[1], "roster")
			p.Indent = 0
			p.LeftIndent = 28.22
			p.Hanging = 16.93
		}
	}
	if f.Agency != "" {
		p := add(f.Agency, "signature")
		p.Before = 10
		p.KeepNext = true
	}
	if f.Date != "" {
		add(f.Date, "date")
	}
	if f.AnnexPages {
		for i, name := range f.Attachments {
			if strings.TrimSpace(name) == "" {
				continue
			}
			label := "附件"
			if len(f.Attachments) > 1 {
				label += fmt.Sprint(i + 1)
			}
			p := add(label, "heading")
			p.PageBreak = true
			p.Indent = 0
			add(name, "title")
			add("", "attachment-body")
		}
	}
	imprint := f.Kind != "letter" && f.Letterhead && f.Agency != "" && f.Date != ""
	line := func() { p := add("", "imprint"); p.Line = 2.1; p.BorderBottom = true; p.BorderColor = "000000" }
	if imprint {
		line()
	}
	if f.CopyTo != "" {
		add("抄送："+strings.TrimRight(f.CopyTo, "。")+"。", "imprint")
		if imprint {
			line()
		}
	}
	if imprint {
		add(f.Agency+"    "+f.Date+"印发", "imprint")
		line()
	}
	return m, m.Validate()
}
func xmlText(s string) string {
	var b bytes.Buffer
	_ = xml.EscapeText(&b, []byte(s))
	return b.String()
}
func twips(mm float64) int { return int(mm*56.692913 + 0.5) }
func paragraphXML(p Paragraph) string {
	var props strings.Builder
	align := p.Align
	if align == "" {
		align = "left"
	}
	fmt.Fprintf(&props, `<w:jc w:val="%s"/><w:spacing w:before="%d" w:after="%d" w:line="%d" w:lineRule="exact"/><w:ind w:firstLine="%d"/>`, xmlText(align), twips(p.Before), twips(p.After), twips(p.Line), twips(p.Indent))
	if p.LeftIndent != 0 || p.RightIndent != 0 || p.Hanging != 0 {
		v := fmt.Sprintf(`<w:ind w:left="%d" w:right="%d" w:firstLine="%d"/>`, twips(p.LeftIndent), twips(p.RightIndent), twips(p.Indent))
		if p.Hanging > 0 {
			v = fmt.Sprintf(`<w:ind w:left="%d" w:right="%d" w:hanging="%d"/>`, twips(p.LeftIndent), twips(p.RightIndent), twips(p.Hanging))
		}
		text := strings.Replace(props.String(), fmt.Sprintf(`<w:ind w:firstLine="%d"/>`, twips(p.Indent)), v, 1)
		props.Reset()
		props.WriteString(text)
	}
	if p.KeepNext {
		props.WriteString(`<w:keepNext/>`)
	}
	if p.AnchorBottom {
		props.WriteString(`<w:framePr w:w="8844" w:h="1600" w:hRule="auto" w:hAnchor="text" w:vAnchor="margin" w:xAlign="center" w:yAlign="bottom" w:wrap="notBeside"/>`)
	} else if p.FrameWidth > 0 {
		fmt.Fprintf(&props, `<w:framePr w:w="%d" w:h="%d" w:hRule="exact" w:hAnchor="page" w:vAnchor="page" w:x="%d" w:y="%d" w:wrap="around"/>`, twips(p.FrameWidth), twips(p.Line), twips(p.FrameX), twips(p.FrameY))
	}
	if len(p.Tabs) > 0 {
		props.WriteString(`<w:tabs>`)
		for _, tab := range p.Tabs {
			fmt.Fprintf(&props, `<w:tab w:val="%s" w:pos="%d"/>`, xmlText(tab.Align), twips(tab.Position))
		}
		props.WriteString(`</w:tabs>`)
	}
	if p.PageBreak {
		props.WriteString(`<w:pageBreakBefore/>`)
	}
	if p.BorderBottom || p.BorderTop {
		style := p.BorderStyle
		if style == "" {
			style = "single"
		}
		color := p.BorderColor
		if color == "" {
			color = "000000"
		}
		side := "bottom"
		if p.BorderTop {
			side = "top"
		}
		fmt.Fprintf(&props, `<w:pBdr><w:%s w:val="%s" w:sz="12" w:color="%s"/></w:pBdr>`, side, xmlText(style), xmlText(color))
	}
	var run strings.Builder
	for i, line := range strings.Split(p.Prefix+p.Text, "\n") {
		if i > 0 {
			run.WriteString(`<w:br/>`)
		}
		fmt.Fprintf(&run, `<w:t xml:space="preserve">%s</w:t>`, xmlText(line))
	}
	color := p.Color
	if color == "" {
		color = "000000"
	}
	if len(p.Tabs) > 0 && strings.Contains(p.Text, "签发人：") {
		parts := strings.SplitN(p.Text, "签发人：", 2)
		return `<w:p><w:pPr>` + props.String() + `</w:pPr>` + formattedRun(parts[0]+"签发人：", "仿宋", p.Size, color) + formattedRun(parts[1], "楷体", p.Size, color) + `</w:p>`
	}
	if p.Role == "roster" {
		if parts := strings.SplitN(p.Text, "：", 2); len(parts) == 2 {
			return `<w:p><w:pPr>` + props.String() + `</w:pPr>` + formattedRun(parts[0]+"：", "黑体", p.Size, color) + formattedRun(parts[1], "仿宋", p.Size, color) + `</w:p>`
		}
	}
	return fmt.Sprintf(`<w:p><w:pPr>%s</w:pPr><w:r><w:rPr><w:rFonts w:ascii="%s" w:hAnsi="%s" w:eastAsia="%s"/><w:sz w:val="%d"/><w:color w:val="%s"/></w:rPr>%s</w:r></w:p>`, props.String(), xmlText(p.Font), xmlText(p.Font), xmlText(p.Font), int(p.Size*2), xmlText(color), run.String())
}

func formattedRun(text, font string, size float64, color string) string {
	var out strings.Builder
	fmt.Fprintf(&out, `<w:r><w:rPr><w:rFonts w:ascii="%s" w:hAnsi="%s" w:eastAsia="%s"/><w:sz w:val="%d"/><w:color w:val="%s"/></w:rPr>`, xmlText(font), xmlText(font), xmlText(font), int(size*2), xmlText(color))
	for i, line := range strings.Split(text, "\n") {
		if i > 0 {
			out.WriteString(`<w:br/>`)
		}
		for j, part := range strings.Split(line, "\t") {
			if j > 0 {
				out.WriteString(`<w:tab/>`)
			}
			fmt.Fprintf(&out, `<w:t xml:space="preserve">%s</w:t>`, xmlText(part))
		}
	}
	out.WriteString(`</w:r>`)
	return out.String()
}
func CreateDOCX(m Model) ([]byte, error) {
	var fitErr error
	m, fitErr = fitMarks(m)
	if fitErr != nil {
		return nil, fitErr
	}
	if e := m.Validate(); e != nil {
		return nil, e
	}
	var body strings.Builder
	for _, b := range m.Blocks {
		if b.Paragraph != nil {
			body.WriteString(paragraphXML(*b.Paragraph))
			continue
		}
		t := b.Table
		body.WriteString(`<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>`)
		if t.Borders {
			if t.BorderStyle == "three-line" {
				body.WriteString(`<w:tblBorders><w:top w:val="single" w:sz="12"/><w:bottom w:val="single" w:sz="12"/><w:left w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>`)
			} else {
				body.WriteString(`<w:tblBorders><w:top w:val="single" w:sz="8"/><w:bottom w:val="single" w:sz="8"/><w:left w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders>`)
			}
		} else {
			body.WriteString(`<w:tblBorders><w:top w:val="nil"/><w:bottom w:val="nil"/><w:left w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>`)
		}
		body.WriteString(`</w:tblPr><w:tblGrid>`)
		for _, v := range t.Widths {
			fmt.Fprintf(&body, `<w:gridCol w:w="%d"/>`, twips(v))
		}
		body.WriteString(`</w:tblGrid>`)
		for _, row := range t.Rows {
			body.WriteString(`<w:tr>`)
			if row.Header {
				body.WriteString(`<w:trPr><w:tblHeader/></w:trPr>`)
			}
			for _, c := range row.Cells {
				body.WriteString(`<w:tc><w:tcPr>`)
				if row.Header && t.BorderStyle == "three-line" {
					body.WriteString(`<w:tcBorders><w:bottom w:val="single" w:sz="6"/></w:tcBorders>`)
				}
				pad := c.padding()
				fmt.Fprintf(&body, `<w:tcMar><w:top w:w="%d" w:type="dxa"/><w:bottom w:w="%d" w:type="dxa"/><w:left w:w="%d" w:type="dxa"/><w:right w:w="%d" w:type="dxa"/></w:tcMar>`, twips(pad.Top), twips(pad.Bottom), twips(pad.Left), twips(pad.Right))
				if c.Span > 1 {
					fmt.Fprintf(&body, `<w:gridSpan w:val="%d"/>`, c.Span)
				}
				if c.Merge != "" {
					fmt.Fprintf(&body, `<w:vMerge w:val="%s"/>`, xmlText(c.Merge))
				}
				body.WriteString(`</w:tcPr>`)
				if len(c.Paragraphs) == 0 {
					body.WriteString(`<w:p/>`)
				}
				for _, p := range c.Paragraphs {
					body.WriteString(paragraphXML(p))
				}
				body.WriteString(`</w:tc>`)
			}
			body.WriteString(`</w:tr>`)
		}
		body.WriteString(`</w:tbl>`)
	}
	pg := m.Page
	body.WriteString(`<w:sectPr>`)
	if len(m.FirstHeader) > 0 {
		body.WriteString(`<w:headerReference w:type="first" r:id="headerFirst"/>`)
	}
	if len(m.FirstFooter) > 0 {
		body.WriteString(`<w:footerReference w:type="first" r:id="footerFirst"/>`)
	}
	fmt.Fprintf(&body, `<w:footerReference w:type="default" r:id="footerOdd"/><w:footerReference w:type="even" r:id="footerEven"/><w:pgSz w:w="%d" w:h="%d"/><w:pgMar w:top="%d" w:right="%d" w:bottom="%d" w:left="%d" w:header="850" w:footer="1420"/>`, twips(pg.Width), twips(pg.Height), twips(pg.Top), twips(pg.Right), twips(pg.Bottom), twips(pg.Left))
	if m.HideFirstPageNumber {
		body.WriteString(`<w:titlePg/>`)
	}
	body.WriteString(`<w:docGrid w:type="linesAndChars" w:linePitch="579" w:charSpace="-842"/></w:sectPr>`)
	parts := map[string]string{"[Content_Types].xml": `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/word/footer2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`, "_rels/.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="doc" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`, "word/document.xml": `<w:document xmlns:w="` + W + `" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>` + body.String() + `</w:body></w:document>`, "word/_rels/document.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="settings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="footerOdd" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/><Relationship Id="footerEven" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer2.xml"/></Relationships>`, "word/settings.xml": `<w:settings xmlns:w="` + W + `"><w:evenAndOddHeaders/><w:characterSpacingControl w:val="compressPunctuation"/><w:compat><w:doNotExpandShiftReturn/></w:compat></w:settings>`}
	for i, align := range []string{"right", "left"} {
		parts[fmt.Sprintf("word/footer%d.xml", i+1)] = `<w:ftr xmlns:w="` + W + `"><w:p><w:pPr><w:ind w:left="280" w:right="280" w:firstLine="0"/><w:spacing w:before="0" w:after="0" w:line="280" w:lineRule="exact"/><w:jc w:val="` + align + `"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="SimSun" w:hAnsi="SimSun" w:eastAsia="宋体"/><w:sz w:val="28"/></w:rPr><w:t>— </w:t></w:r><w:fldSimple w:instr="PAGE"><w:r><w:rPr><w:rFonts w:ascii="SimSun" w:hAnsi="SimSun" w:eastAsia="宋体"/><w:sz w:val="28"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple><w:r><w:rPr><w:rFonts w:ascii="SimSun" w:hAnsi="SimSun" w:eastAsia="宋体"/><w:sz w:val="28"/></w:rPr><w:t> —</w:t></w:r></w:p></w:ftr>`
	}
	var out bytes.Buffer
	addFirstPageParts(parts, m)
	z := zip.NewWriter(&out)
	names := []string{"[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/_rels/document.xml.rels", "word/settings.xml", "word/footer1.xml", "word/footer2.xml"}
	if len(m.FirstHeader) > 0 {
		names = append(names, "word/header-first.xml")
	}
	if len(m.FirstFooter) > 0 {
		names = append(names, "word/footer-first.xml")
	}
	for _, name := range names {
		w, e := z.Create(name)
		if e != nil {
			return nil, e
		}
		if _, e = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>` + parts[name])); e != nil {
			return nil, e
		}
	}
	if e := z.Close(); e != nil {
		return nil, e
	}
	return out.Bytes(), nil
}
