package office

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"fmt"
	"regexp"
	"sort"
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
	AutoNumbering       bool     `json:"autoNumbering,omitempty"`
	Agencies            []string `json:"agencies,omitempty"`
	Signers             []string `json:"signers,omitempty"`
	SigningAgencies     []string `json:"signingAgencies,omitempty"`
	CopyNumber          string   `json:"copyNumber,omitempty"`
	Classification      string   `json:"classification,omitempty"`
	SecrecyPeriod       string   `json:"secrecyPeriod,omitempty"`
	Urgency             string   `json:"urgency,omitempty"`
	Preprinted          bool     `json:"preprinted,omitempty"`
	MarkWithoutFile     bool     `json:"markWithoutFile,omitempty"`
	IssueNumber         string   `json:"issueNumber,omitempty"`
	Issuer              string   `json:"issuer,omitempty"`
	IssueDate           string   `json:"issueDate,omitempty"`
	Unsealed            bool     `json:"unsealed,omitempty"`
	Note                string   `json:"note,omitempty"`
	DetachedAttachments bool     `json:"detachedAttachments,omitempty"`
	Kind                string   `json:"kind"`
	Title               string   `json:"title"`
	Agency              string   `json:"agency"`
	Reference           string   `json:"reference"`
	Recipient           string   `json:"recipient"`
	Body                string   `json:"body"`
	Date                string   `json:"date"`
	Signer              string   `json:"signer"`
	CopyTo              string   `json:"copyTo"`
	Attachments         []string `json:"attachments"`
	Letterhead          bool     `json:"letterhead"`
	AnnexPages          bool     `json:"annexPages"`
	Attendees           string   `json:"attendees"`
	Absentees           string   `json:"absentees"`
	Observers           string   `json:"observers"`
}

var h1 = regexp.MustCompile(`^[一二三四五六七八九十百]+、`)
var h2 = regexp.MustCompile(`^（[一二三四五六七八九十百]+）`)
var h3 = regexp.MustCompile(`^[0-9]+\.[^0-9]`)
var h4 = regexp.MustCompile(`^（[0-9]+）`)
var article = regexp.MustCompile(`^第[一二三四五六七八九十百千]+[章条]`)
var chapterLabel = regexp.MustCompile(`^第[一二三四五六七八九十百千0-9]+章`)
var articleLabel = regexp.MustCompile(`^第[一二三四五六七八九十百千0-9]+条`)

func NewDocument(f Fields) (Model, error) {
	var extraErr error
	f, extraErr = validateExtraFields(f)
	if extraErr != nil {
		return Model{}, extraErr
	}
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
	if f.Signer != "" && f.Kind != "request" && f.Kind != "report" && f.Kind != "plain" {
		return Model{}, fmt.Errorf("签发人适用于上行文；可在填写稿明确填写，其他模板请按实际适用条件选择请示或报告")
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
			p.Size = 36
			p.Color = "FF0000"
			p.Align = "center"
			p.Indent = 0
			p.Line = 19.05
			p.After = 20.42
			p.Before = 35
			p.KeepNext = true
		case "reference":
			p.Align = "center"
			p.Indent = 0
			p.After = 0
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
			m.FirstHeader = []Paragraph{*p, {ID: "letter-head-line", Font: "仿宋", Size: 16, Line: 2.1, FrameX: 20, FrameY: 48, FrameWidth: 170, BorderTop: true, BorderColor: "FF0000", BorderStyle: "thinThickSmallGap"}}
			m.FirstFooter = []Paragraph{{ID: "letter-foot-line", Font: "仿宋", Size: 16, Line: 2.1, FrameX: 20, FrameY: 275.62, FrameWidth: 170, BorderTop: true, BorderColor: "FF0000", BorderStyle: "thickThinSmallGap"}}
		}
		ref := f.Reference
		if f.Signer != "" {
			ref += "\t签发人：" + f.Signer
		}
		if ref != "" || f.Kind != "letter" {
			p = add(ref, "reference")
			if f.Signer != "" {
				p.Align = "left"
				p.Indent = 5.64
				p.Tabs = []TabStop{{Align: "right", Position: 150.36}}
			}
			if f.Kind == "letter" {
				p.Align = "right"
				p.After = 12
			}
		}
		if f.Kind != "letter" {
			// A separate divider keeps the gap below the reference independent
			// from the two blank body lines above the document title.
			divider := add("", "letterhead-divider")
			divider.Line = 1.94
			divider.BorderWidth = .4
			divider.Indent = 0
			divider.BorderBottom = true
			divider.BorderColor = "FF0000"
			divider.After = 20.42
			divider.KeepNext = true
		}
	}
	// Explicit signer metadata in the generic writer precedes the title, even
	// without a red heading. Preserve legacy unsigned and typed-template order.
	plainSignerBeforeTitle := f.Kind == "plain" && !f.Letterhead && f.Signer != ""
	if !plainSignerBeforeTitle {
		add(f.Title, "title")
	}
	if !f.Letterhead && (f.Reference != "" || f.Signer != "") {
		text := f.Reference
		if f.Signer != "" {
			text += "\t签发人：" + f.Signer
		}
		p := add(text, "reference")
		p.After = 12
		if f.Signer != "" {
			p.Align = "left"
			p.Indent = 5.64
			p.Tabs = []TabStop{{Align: "right", Position: 150.36}}
		}
	}
	if plainSignerBeforeTitle {
		add(f.Title, "title")
	}
	if f.Recipient != "" {
		add(strings.TrimRight(f.Recipient, "：:")+"：", "recipient")
	}
	for _, line := range strings.Split(strings.ReplaceAll(f.Body, "\r\n", "\n"), "\n") {
		roleText := line
		if f.Kind == "plain" {
			// Recognize pasted indentation without rewriting authored text.
			roleText = strings.TrimSpace(line)
		}
		role := "body"
		if h1.MatchString(roleText) || article.MatchString(roleText) {
			role = "heading"
		}
		if h2.MatchString(roleText) {
			role = "heading2"
		}
		if h3.MatchString(roleText) {
			role = "heading3"
		}
		if h4.MatchString(roleText) {
			role = "heading4"
		}
		if f.Kind == "plain" && articleLabel.MatchString(roleText) {
			// A numbered article carries prose; it is not a heading paragraph.
			role = "article"
		}
		p := add(line, role)
		if role == "heading3" || role == "heading4" {
			p.KeepNext = true
		}
		if f.Kind == "rules" && chapterLabel.MatchString(line) {
			p.Align = "center"
			p.Indent = 0
			p.Font = "方正小标宋简体"
			p.Before = 10.21
			p.After = 10.21
		}
		if f.Kind == "rules" && articleLabel.MatchString(line) {
			p.Role = "article"
			p.Font = "仿宋"
			p.KeepNext = false
		}
		if f.Kind == "rules" && h2.MatchString(line) {
			p.Role = "heading3"
			p.Font = "仿宋"
		}
		if f.Kind == "rules" && h3.MatchString(line) {
			p.Role = "heading4"
			p.Font = "仿宋"
		}
	}
	for i, name := range f.Attachments {
		if strings.TrimSpace(name) == "" {
			continue
		}
		label := "附件："
		if i > 0 {
			label = ""
		}
		if len(f.Attachments) > 1 {
			label += fmt.Sprintf("%d. ", i+1)
		}
		p := add(label+name, "attachment-description")
		p.KeepNext = true
		prefixWidth := textAdvanceMM(label, p.Font, p.Size)
		p.LeftIndent = 11.29 + prefixWidth
		if i > 0 {
			p.LeftIndent += textAdvanceMM("附件：", p.Font, p.Size)
		}
		p.Hanging = prefixWidth
		p.Indent = 0
		if i == 0 {
			p.Before = 10.21
		}
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
			p.After = 10.21
			title := add(name, "title")
			title.Size = 16
			title.Role = "attachment-title"
			add("", "attachment-body")
		}
	}
	issuer, issueDate := imprintValues(f)
	imprint := f.Kind != "letter" && (hasExplicitImprint(f) || f.Letterhead && f.Agency != "" && f.Date != "")
	line := func(width, height float64) {
		p := add("", "imprint")
		p.Line = height
		p.BorderBottom = true
		p.BorderColor = "000000"
		p.BorderWidth = width
	}
	if imprint {
		line(.35, 2.1)
	}
	if f.CopyTo != "" {
		p := add("抄送："+strings.TrimRight(f.CopyTo, "。")+"。", "imprint")
		p.LeftIndent = 4 * 14 * 25.4 / 72
		p.Hanging = 3 * 14 * 25.4 / 72
		p.RightIndent = 14 * 25.4 / 72
		if imprint {
			line(.25, 2.1)
		}
	}
	if imprint {
		p := add(issuer+"\t"+issueDate+"印发", "imprint")
		p.LeftIndent = 14 * 25.4 / 72
		p.Tabs = []TabStop{{Align: "right", Position: 156 - 2*14*25.4/72}}
		line(.35, 1.06)
	}
	m = applyExtraFields(m, f)
	m.AutoNumbering = f.AutoNumbering
	m = RenumberDocument(m)
	return m, m.Validate()
}
func xmlText(s string) string {
	var b bytes.Buffer
	_ = xml.EscapeText(&b, []byte(s))
	return b.String()
}
func twips(mm float64) int { return int(mm*56.692913 + 0.5) }
func paragraphXML(p Paragraph) string {
	if p.HiddenInk {
		if p.BorderBottom {
			p.Line += borderWidth(p)
		}
		p.Text = ""
		p.Prefix = ""
		p.Color = "000000"
		p.BorderTop = false
		p.BorderBottom = false
	}
	var props strings.Builder
	props.WriteString(`<w:snapToGrid w:val="0"/>`)
	if p.BorderBottom && p.Text == "" && p.FrameWidth == 0 {
		p.LeftIndent += borderWidth(p)
		p.RightIndent += borderWidth(p)
	}
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
	if p.AutoNumbered {
		fmt.Fprintf(&props, `<w:numPr><w:ilvl w:val="%d"/><w:numId w:val="1"/></w:numPr>`, p.OutlineLevel-1)
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
		width := 12
		if strings.Contains(strings.ToLower(style), "thick") {
			width = 18
		}
		if p.BorderWidth > 0 {
			width = int(p.BorderWidth*72/25.4*8 + .5)
		}
		fmt.Fprintf(&props, `<w:pBdr><w:%s w:val="%s" w:sz="%d" w:space="0" w:color="%s"/></w:pBdr>`, side, xmlText(style), width, xmlText(color))
	}
	var run strings.Builder
	visiblePrefix := p.Prefix
	if p.AutoNumbered {
		visiblePrefix = ""
	}
	for i, line := range strings.Split(visiblePrefix+p.Text, "\n") {
		if i > 0 {
			run.WriteString(`<w:br/>`)
		}
		fmt.Fprintf(&run, `<w:t xml:space="preserve">%s</w:t>`, xmlText(line))
	}
	color := p.Color
	if color == "" {
		color = "000000"
	}
	if p.Role == "header-meta" && strings.Contains(p.Text, "\t") {
		parts := strings.SplitN(p.Text, "\t", 2)
		return `<w:p><w:pPr>` + props.String() + `</w:pPr>` + formattedRun(parts[0]+"\t", p.Font, p.Size, color) + formattedRun(parts[1], "仿宋", p.Size, color) + `</w:p>`
	}
	if p.Role == "signer" {
		parts := strings.SplitN(p.Text, "\t", 2)
		if len(parts) == 2 {
			right := formattedRun(parts[1], "楷体", p.Size, color)
			if strings.HasPrefix(parts[1], "签发人：") {
				right = formattedRun("签发人：", "仿宋", p.Size, color) + formattedRun(strings.TrimPrefix(parts[1], "签发人："), "楷体", p.Size, color)
			}
			return `<w:p><w:pPr>` + props.String() + `</w:pPr>` + formattedRun(parts[0]+"\t", "仿宋", p.Size, color) + right + `</w:p>`
		}
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
	if p.Role == "article" {
		label := articleLabel.FindString(p.Text)
		return `<w:p><w:pPr>` + props.String() + `</w:pPr>` + formattedRun(label, "黑体", p.Size, color) + formattedRun(strings.TrimPrefix(p.Text, label), p.Font, p.Size, color) + `</w:p>`
	}
	if p.PrefixFont != "" && p.Prefix != "" && !p.AutoNumbered {
		return `<w:p><w:pPr>` + props.String() + `</w:pPr>` + formattedRun(p.Prefix, p.PrefixFont, p.Size, color) + formattedRun(p.Text, p.Font, p.Size, color) + `</w:p>`
	}
	if strings.Contains(p.Text, "\t") {
		return `<w:p><w:pPr>` + props.String() + `</w:pPr>` + formattedRun(p.Prefix+p.Text, p.Font, p.Size, color) + `</w:p>`
	}
	bold := ""
	if p.Bold {
		bold = `<w:b/>`
	}
	return fmt.Sprintf(`<w:p><w:pPr>%s</w:pPr><w:r><w:rPr>%s<w:rFonts w:ascii="%s" w:hAnsi="%s" w:eastAsia="%s"/><w:sz w:val="%d"/><w:color w:val="%s"/></w:rPr>%s</w:r></w:p>`, props.String(), bold, xmlText(p.Font), xmlText(p.Font), xmlText(p.Font), int(p.Size*2), xmlText(color), run.String())
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
	if len(RequiredFallbackFonts(m, true)) > 0 {
		return nil, fmt.Errorf("Word完整字体资源尚未准备完成，请重试")
	}
	var fitErr error
	m, fitErr = fitMarks(m)
	if fitErr != nil {
		return nil, fitErr
	}
	m = prepareNewLayout(m)
	m = prepareInkPlacement(m, true)
	m = suppressPreprintedMarks(m)
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
		if t.Caption != nil {
			body.WriteString(paragraphXML(*t.Caption))
		}
		widths := append([]float64{}, t.Widths...)
		columns := 0
		for _, row := range t.Rows {
			n := 0
			for _, cell := range row.Cells {
				n += cell.Span
			}
			if n > columns {
				columns = n
			}
		}
		if len(widths) != columns {
			widths = make([]float64, columns)
			for i := range widths {
				widths[i] = (m.Page.Width - m.Page.Left - m.Page.Right) / float64(columns)
			}
		}
		total := 0.0
		for _, v := range widths {
			total += v
		}
		if t.Width > 0 && total > 0 {
			for i := range widths {
				widths[i] = widths[i] * t.Width / total
			}
			total = t.Width
		}
		fmt.Fprintf(&body, `<w:tbl><w:tblPr><w:tblW w:w="%d" w:type="dxa"/><w:tblLayout w:type="fixed"/>`, twips(total))
		if t.Align != "" {
			fmt.Fprintf(&body, `<w:jc w:val="%s"/>`, xmlText(t.Align))
		}
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
		for _, v := range widths {
			fmt.Fprintf(&body, `<w:gridCol w:w="%d"/>`, twips(v))
		}
		body.WriteString(`</w:tblGrid>`)
		for _, row := range t.Rows {
			body.WriteString(`<w:tr><w:trPr><w:cantSplit/>`)
			if row.Header {
				body.WriteString(`<w:tblHeader/>`)
			}
			if row.Height > 0 {
				fmt.Fprintf(&body, `<w:trHeight w:val="%d" w:hRule="atLeast"/>`, twips(row.Height))
			}
			body.WriteString(`</w:trPr>`)
			col := 0
			for _, c := range row.Cells {
				body.WriteString(`<w:tc><w:tcPr>`)
				cw := 0.0
				for j := 0; j < c.Span && col+j < len(widths); j++ {
					cw += widths[col+j]
				}
				col += c.Span
				fmt.Fprintf(&body, `<w:tcW w:w="%d" w:type="dxa"/>`, twips(cw))
				if c.VerticalAlign != "" {
					fmt.Fprintf(&body, `<w:vAlign w:val="%s"/>`, xmlText(c.VerticalAlign))
				}
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
		parts[fmt.Sprintf("word/footer%d.xml", i+1)] = pageFooterXML(align)
	}
	var out bytes.Buffer
	addFirstPageParts(parts, m)
	parts["word/styles.xml"] = `<w:styles xmlns:w="` + W + `"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="仿宋" w:hAnsi="仿宋" w:eastAsia="仿宋"/><w:sz w:val="32"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:line="579" w:lineRule="exact"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`
	parts["[Content_Types].xml"] = strings.Replace(parts["[Content_Types].xml"], "</Types>", `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`, 1)
	parts["word/_rels/document.xml.rels"] = strings.Replace(parts["word/_rels/document.xml.rels"], "</Relationships>", `<Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`, 1)
	addNumberingPart(parts, m)
	fontFiles := addFallbackFonts(parts)
	z := zip.NewWriter(&out)
	names := []string{}
	for name := range parts {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		w, e := z.Create(name)
		if e != nil {
			return nil, e
		}
		if _, e = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>` + parts[name])); e != nil {
			return nil, e
		}
	}
	fontNames := []string{}
	for name := range fontFiles {
		fontNames = append(fontNames, name)
	}
	sort.Strings(fontNames)
	for _, name := range fontNames {
		w, e := z.Create(name)
		if e != nil {
			return nil, e
		}
		if _, e = w.Write(fontFiles[name]); e != nil {
			return nil, e
		}
	}
	if e := z.Close(); e != nil {
		return nil, e
	}
	return out.Bytes(), nil
}
