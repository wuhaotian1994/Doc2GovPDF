package office

import (
	"fmt"
	"strings"
)

type fieldRun struct {
	text, font string
	width      float64
}

func (w *pdfWriter) fieldRuns(text string, p Paragraph) []fieldRun {
	runs := []fieldRun{}
	if strings.Contains(text, "签发人：") {
		parts := strings.SplitN(text, "签发人：", 2)
		runs = []fieldRun{{text: parts[0] + "签发人：", font: "仿宋"}, {text: parts[1], font: "楷体"}}
	} else {
		font := p.Font
		if strings.Contains(text, "〔") && strings.Contains(text, "〕") && strings.Contains(text, "号") {
			font = "仿宋"
		}
		runs = []fieldRun{{text: text, font: font}}
	}
	for i := range runs {
		q := p
		q.Font = runs[i].font
		q.Text = runs[i].text
		w.setFont(q)
		runs[i].width = w.textWidth(runs[i].text)
	}
	return runs
}
func (w *pdfWriter) tabbed(p Paragraph) error {
	if p.PageBreak && w.y > w.page.Top+.1 {
		w.newPage()
	}
	if strings.Contains(p.Text, "\n") {
		return fmt.Errorf("含制表位的多行段落需先拆为独立段落，Word 原件仍保留")
	}
	line := p.Line
	if line < p.Size*25.4/72*1.15 {
		line = p.Size * 25.4 / 72 * 1.3
	}
	height := line + p.Before + p.After
	if p.KeepNext {
		height += line
	}
	if e := w.room(height); e != nil {
		return e
	}
	w.y += p.Before
	inkBottom := w.y
	end := w.page.Left
	parts := strings.Split(p.Text, "\t")
	for i, text := range parts {
		if text == "" {
			continue
		}
		runs := w.fieldRuns(text, p)
		width := 0.0
		for _, run := range runs {
			width += run.width
		}
		x := w.page.Left + p.LeftIndent + p.Indent - p.Hanging
		if i > 0 {
			if i-1 >= len(p.Tabs) {
				return fmt.Errorf("制表位设置不完整，请整理该段后再生成 PDF")
			}
			stop := p.Tabs[i-1]
			x = w.page.Left + p.LeftIndent + stop.Position
			switch stop.Align {
			case "right":
				x -= width
			case "center":
				x -= width / 2
			}
		}
		if x < end-.15 || x+width > w.page.Width-w.page.Right+.15 {
			return fmt.Errorf("文号、签发人或版记内容过长，发生重叠，请缩短或换行整理")
		}
		for _, run := range runs {
			q := p
			q.Font = run.font
			q.Text = run.text
			w.setFont(q)
			w.f.SetXY(x, w.y)
			w.drawText(x, w.y, run.width+.01, line, run.text, "L", w.charSpacing)
			_, bottom := glyphInk(q)
			if b := w.y + line/2 + .3*q.Size*25.4/72 + bottom; b > inkBottom {
				inkBottom = b
			}
			x += run.width
		}
		end = x
	}
	w.lastInkBottom = inkBottom
	w.y += line
	if p.BorderBottom {
		width := borderWidth(p)
		w.drawBorder(p, w.page.Left, w.y+width/2, w.page.Width-w.page.Left-w.page.Right)
		w.y += width
	}
	w.y += p.After
	return nil
}
func (w *pdfWriter) roster(p Paragraph) error {
	parts := strings.SplitN(p.Text, "：", 2)
	label := parts[0] + "："
	left := p.LeftIndent
	if left <= 0 {
		left = 28.22
	}
	hanging := p.Hanging
	if hanging <= 0 {
		hanging = 16.93
	}
	base := p
	base.Role = "body"
	base.Indent = 0
	base.LeftIndent = 0
	base.RightIndent = 0
	base.Hanging = 0
	base.Before = 0
	base.After = 0
	base.Tabs = nil
	base.Font = "仿宋"
	name := base
	name.Text = parts[1]
	name.Role = "roster-names"
	labelPara := base
	labelPara.Font = "黑体"
	labelPara.Text = label
	w.y += p.Before
	table := Table{Role: "roster", Widths: []float64{left, w.page.Width - w.page.Left - w.page.Right - left}, Rows: []Row{{Cells: []Cell{{Span: 1, Margins: &CellMargins{Left: left - hanging}, Paragraphs: []Paragraph{labelPara}}, {Span: 1, Margins: &CellMargins{}, Paragraphs: []Paragraph{name}}}}}}
	if e := w.table(table); e != nil {
		return e
	}
	w.y += p.After
	return nil
}
