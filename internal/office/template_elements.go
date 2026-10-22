package office

import (
	"fmt"
	"math"
	"regexp"
	"strings"
)

func cleanNames(names []string) []string {
	var out []string
	seen := map[string]bool{}
	for _, s := range names {
		s = strings.TrimSpace(s)
		if s != "" && !seen[s] {
			out = append(out, s)
			seen[s] = true
		}
	}
	return out
}

// Blank author lines are not names. Unlike agency cleanup, ordered signer
// repeats remain distinct authored entries and must never be deduplicated.
func cleanSignerNames(names []string) []string {
	var out []string
	for _, name := range names {
		if name = strings.TrimSpace(name); name != "" {
			out = append(out, name)
		}
	}
	return out
}

// Keep two independently measured columns, rather than spacing the next name
// from the end of a variable-length first name. Reserve nominal advances (not
// negative document-grid compression) so Word and PDF both fit at 16 points.
func jointSignerAdvance(text, font string) float64 {
	if text == "" {
		return 0
	}
	width := textAdvanceMM(text, font, 16) + float64(len([]rune(text)))*842/4096*25.4/72
	if missingGlyph(resolveFont(font).name, text) != 0 {
		width = math.Max(width, float64(len([]rune(text)))*16*25.4/72)
	}
	return width + .2
}

func jointSignerTabStops(f Fields) ([]TabStop, error) {
	if len(f.Signers) <= 1 {
		return nil, nil
	}
	if strings.ContainsAny(f.Reference, "\r\n\t") {
		return nil, fmt.Errorf("多人签发的文号需为单独一行，不能含换行或制表符；原文未改变")
	}
	widths := [2]float64{}
	total := 0
	for index, name := range f.Signers {
		length := len([]rune(name))
		total += length
		if length > 60 {
			return nil, fmt.Errorf("第 %d 位签发人姓名超过 60 字符，请核对原文；不会截字或缩小字号", index+1)
		}
		widths[index%2] = math.Max(widths[index%2], jointSignerAdvance(name, "楷体"))
	}
	if total > 240 {
		return nil, fmt.Errorf("签发人姓名合计超过 240 字符，请核对原文；不会截字或缩小字号")
	}
	const left, right = 5.64, 150.36
	gap := 2 * 16 * 25.4 / 72
	second := right - widths[1]
	first := second - gap - widths[0]
	labelWidth := math.Max(jointSignerAdvance("签发人：", "仿宋"), 4*16*25.4/72)
	label := first - labelWidth
	if label < left+.3 {
		return nil, fmt.Errorf("签发人姓名过长，无法以 16 磅字号在当前版心排成两列；请核对姓名，不能截字或缩小字号")
	}
	referenceLimit := first
	if len(f.Signers) <= 2 {
		referenceLimit = label
	}
	if f.Reference != "" && left+jointSignerAdvance(f.Reference, "仿宋") > referenceLimit-.3 {
		return nil, fmt.Errorf("文号过长，无法与末行签发人同排且保留两列位置；请核对文号，不能截字或缩小字号")
	}
	return []TabStop{{Align: "left", Position: label}, {Align: "left", Position: first}, {Align: "left", Position: second}}, nil
}

func validateExtraFields(f Fields) (Fields, error) {
	if err := validateIssuanceFields(f); err != nil {
		return f, err
	}
	f.Agencies = cleanNames(f.Agencies)
	f.Signers = cleanSignerNames(f.Signers)
	f.SigningAgencies = cleanNames(f.SigningAgencies)
	if len(f.Agencies) > 0 {
		f.Agency = f.Agencies[0]
	} else if f.Agency != "" {
		f.Agencies = []string{f.Agency}
	}
	if len(f.Signers) > 0 {
		f.Signer = f.Signers[0]
	} else if f.Signer != "" {
		f.Signers = []string{f.Signer}
	}
	if len(f.Agencies) > 6 || len(f.Signers) > 12 || len(f.SigningAgencies) > 6 {
		return f, fmt.Errorf("联合机关最多 6 个、签发人最多 12 位，请拆分超长版头")
	}
	if f.CopyNumber != "" && !regexp.MustCompile(`^[0-9]{1,6}$`).MatchString(f.CopyNumber) {
		return f, fmt.Errorf("份号请填写 1 至 6 位数字")
	}
	if f.Classification != "" && f.Classification != "秘密" && f.Classification != "机密" && f.Classification != "绝密" {
		return f, fmt.Errorf("请选择有效的密级")
	}
	if f.SecrecyPeriod != "" && f.Classification == "" {
		return f, fmt.Errorf("填写保密期限前请先选择密级")
	}
	if len([]rune(f.SecrecyPeriod)) > 16 {
		return f, fmt.Errorf("保密期限过长")
	}
	if f.Urgency != "" && f.Urgency != "特急" && f.Urgency != "加急" {
		return f, fmt.Errorf("请选择特急或加急")
	}
	if f.Preprinted && !f.Letterhead {
		return f, fmt.Errorf("预印套打需要启用红头版式")
	}
	if f.DetachedAttachments && (!f.AnnexPages || f.Reference == "") {
		return f, fmt.Errorf("不装订附件需要创建附件页并填写主件发文字号")
	}
	if f.IssueNumber != "" && f.Kind != "minutes" {
		return f, fmt.Errorf("纪要期号仅适用于纪要")
	}
	for _, s := range append(append(append([]string{}, f.Agencies...), f.Signers...), f.SigningAgencies...) {
		if strings.ContainsAny(s, "\n\r\t") {
			return f, fmt.Errorf("每个机关或签发人请单独填写一行")
		}
	}
	return f, nil
}
func extraParagraph(id, text, role string) *Paragraph {
	return &Paragraph{ID: "extra-" + id, Text: text, Role: role, Font: "仿宋", Size: 16, Line: 10.21, Align: "left"}
}
func applyExtraFields(m Model, f Fields) (Model, error) {
	jointTabs, err := jointSignerTabStops(f)
	if err != nil {
		return m, err
	}
	m.Preprinted = f.Preprinted
	if f.Preprinted {
		m.Warnings = append(m.Warnings, "当前为预印套打：红头与红线留白，请使用对应的红头纸。")
	}
	var meta []Block
	for i, text := range []string{f.CopyNumber, f.Classification, f.Urgency} {
		if text == "" {
			continue
		}
		if i == 0 {
			text = strings.Repeat("0", 6-len(text)) + text
		}
		if i == 1 && f.SecrecyPeriod != "" {
			text += "★" + f.SecrecyPeriod
		}
		p := extraParagraph(fmt.Sprintf("meta-%d", i), text, "header-meta")
		p.Font = "黑体"
		p.KeepNext = true
		meta = append(meta, Block{Paragraph: p})
	}
	var blocks []Block
	for _, b := range m.Blocks {
		p := b.Paragraph
		if p == nil {
			blocks = append(blocks, b)
			continue
		}
		if p.Role == "agency" {
			if f.Kind == "minutes" {
				p.Text = f.Agency + "纪要"
			} else if f.MarkWithoutFile {
				p.Text = f.Agency
			}
			if len(f.Agencies) > 1 && f.Kind != "letter" && f.Kind != "minutes" {
				spacer := extraParagraph("mark-space", "", "mark-spacer")
				spacer.Line = 35
				spacer.KeepNext = true
				blocks = append(blocks, Block{Paragraph: spacer})
				size := 36.0
				longest := ""
				for _, name := range f.Agencies {
					if len([]rune(name)) > len([]rune(longest)) {
						longest = name
					}
				}
				if !f.MarkWithoutFile {
					longest += "文件"
				}
				probe := *p
				probe.Text = longest
				_ = fitMark(&probe, 156)
				size = probe.Size
				fileWidth := 0.0
				if !f.MarkWithoutFile {
					fileWidth = 2 * size * 25.4 / 72
				}
				cells := []Cell{{Span: 1, VerticalAlign: "center", Margins: &CellMargins{}}}
				for i, name := range f.Agencies {
					q := extraParagraph(fmt.Sprintf("agency-%d", i), name, "agency")
					q.Font = p.Font
					q.Color = "FF0000"
					q.Size = size
					q.Align = "center"
					q.Line = 18.1
					cells[0].Paragraphs = append(cells[0].Paragraphs, *q)
				}
				widths := []float64{156 - fileWidth}
				if fileWidth > 0 {
					q := extraParagraph("file-mark", "文件", "agency")
					q.Font = p.Font
					q.Color = "FF0000"
					q.Size = size
					q.Line = 18.1
					q.Align = "center"
					cells = append(cells, Cell{Span: 1, VerticalAlign: "center", Margins: &CellMargins{}, Paragraphs: []Paragraph{*q}})
					widths = append(widths, fileWidth)
				}
				blocks = append(blocks, Block{Table: &Table{Role: "joint-mark", Align: "center", Width: 156, Widths: widths, Rows: []Row{{Height: float64(len(f.Agencies)) * 18.1, Cells: cells}}}})
				gap := extraParagraph("mark-gap", "", "mark-gap")
				gap.Line = 20.42
				gap.KeepNext = true
				blocks = append(blocks, Block{Paragraph: gap})
				continue
			}
		}
		if p.Role == "reference" && len(f.Signers) > 1 {
			for i := 0; i < len(f.Signers); i += 2 {
				ref, label := "", ""
				if i+2 >= len(f.Signers) {
					ref = f.Reference
				}
				if i == 0 {
					label = "签发人："
				}
				text := ref + "\t" + label + "\t" + f.Signers[i]
				if i+1 < len(f.Signers) {
					text += "\t" + f.Signers[i+1]
				}
				q := extraParagraph(fmt.Sprintf("signer-%d", i), text, "signer")
				q.Font = "楷体"
				q.Indent = 5.64
				q.KeepNext = true
				q.Tabs = append([]TabStop(nil), jointTabs...)
				if i+2 >= len(f.Signers) {
					q.After = p.After
				}
				blocks = append(blocks, Block{Paragraph: q})
			}
			continue
		}
		if p.Role == "reference" && f.Kind == "minutes" && f.IssueNumber != "" {
			p.Text = f.IssueNumber
		}
		if p.Role == "signature" {
			units := f.SigningAgencies
			if len(units) == 0 {
				units = f.Agencies
			}
			if len(units) == 0 {
				units = []string{p.Text}
			}
			for i, name := range units {
				q := *p
				q.ID = fmt.Sprintf("extra-signature-%d", i)
				q.Text = name
				if i > 0 {
					q.Before = 0
				}
				if f.Unsealed {
					q.RightIndent = unsealedPads(units, f.Date, true)
				}
				blocks = append(blocks, Block{Paragraph: &q})
			}
			continue
		}
		if p.Role == "date" && f.Unsealed {
			units := f.SigningAgencies
			if len(units) == 0 {
				units = f.Agencies
			}
			p.RightIndent = unsealedPads(units, f.Date, false)
		}
		if p.PageBreak && strings.HasPrefix(p.Text, "附件") && f.DetachedAttachments {
			p.Text = f.Reference + p.Text
		}
		if p.Role == "imprint" && strings.Contains(p.Text, "\t") {
			issuer, date := imprintValues(f)
			p.Text = issuer + "\t" + date + "印发"
		}
		blocks = append(blocks, b)
		if p.Role == "date" && f.Note != "" {
			note := extraParagraph("note", f.Note, "note")
			note.Indent = 11.29
			note.Before = 10.21
			blocks = append(blocks, Block{Paragraph: note})
		}
	}
	m.Blocks = append(meta, blocks...)
	// A letter has its mark in the first-page header; metadata belongs below its line.
	if f.Kind == "letter" && len(meta) > 0 {
		for i := range m.Blocks {
			if p := m.Blocks[i].Paragraph; p != nil && p.Role == "reference" {
				first := m.Blocks[0].Paragraph
				first.Text += "\t" + p.Text
				first.Tabs = []TabStop{{Align: "right", Position: 156}}
				first.After = 0
				m.Blocks = append(m.Blocks[:i], m.Blocks[i+1:]...)
				last := m.Blocks[len(meta)-1].Paragraph
				last.After = 20.42
				break
			}
		}
	}
	return m, nil
}
func unsealedPads(units []string, date string, signature bool) float64 {
	width := func(s string) float64 {
		n := 0.0
		for _, r := range s {
			if r < 256 {
				n += .5
			} else {
				n++
			}
		}
		return n
	}
	unitWidth := 0.0
	for _, u := range units {
		unitWidth = math.Max(unitWidth, width(u))
	}
	dateWidth := width(date)
	right := math.Max(2, 4+dateWidth-unitWidth)
	if !signature {
		right = math.Max(0, right+unitWidth-2-dateWidth)
	}
	return right * 16 * 25.4 / 72
}
func suppressPreprintedMarks(m Model) Model {
	if !m.Preprinted {
		return m
	}
	m = m.Clone()
	hide := func(p *Paragraph) {
		if p.Role == "agency" {
			p.HiddenInk = true
		}
		if p.BorderColor == "FF0000" {
			p.HiddenInk = true
		}
	}
	for _, p := range m.Paragraphs() {
		hide(p)
	}
	for _, ps := range [][]Paragraph{m.FirstHeader, m.FirstFooter} {
		for i := range ps {
			hide(&ps[i])
		}
	}
	return m
}
