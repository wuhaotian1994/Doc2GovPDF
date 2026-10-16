package office

import (
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"unicode/utf8"
)

func (m Model) Clone() Model {
	b, _ := json.Marshal(m)
	var out Model
	_ = json.Unmarshal(b, &out)
	return out
}

type TabStop struct {
	Align    string  `json:"align"`
	Position float64 `json:"position"`
}
type Paragraph struct {
	HiddenInk      bool        `json:"hiddenInk,omitempty"`
	ExplicitIndent bool        `json:"explicitIndent,omitempty"`
	AutoNumbered   bool        `json:"autoNumbered,omitempty"`
	EditableRanges []TextRange `json:"editableRanges,omitempty"`
	FormatLocked   bool        `json:"formatLocked,omitempty"`
	OutlineLevel   int         `json:"outlineLevel,omitempty"`
	Italic         bool        `json:"italic,omitempty"`
	Bold           bool        `json:"bold,omitempty"`
	ID             string      `json:"id"`
	Text           string      `json:"text"`
	Prefix         string      `json:"prefix,omitempty"`
	PrefixFont     string      `json:"prefixFont,omitempty"`
	Role           string      `json:"role"`
	Align          string      `json:"align"`
	Font           string      `json:"font"`
	Size           float64     `json:"size"`
	Color          string      `json:"color,omitempty"`
	Before         float64     `json:"before"`
	After          float64     `json:"after"`
	Line           float64     `json:"line"`
	Indent         float64     `json:"indent"`
	LeftIndent     float64     `json:"leftIndent,omitempty"`
	RightIndent    float64     `json:"rightIndent,omitempty"`
	Hanging        float64     `json:"hanging,omitempty"`
	PageBreak      bool        `json:"pageBreak,omitempty"`
	BreakOffsets   []int       `json:"breakOffsets,omitempty"`
	KeepNext       bool        `json:"keepNext,omitempty"`
	BorderBottom   bool        `json:"borderBottom,omitempty"`
	BorderColor    string      `json:"borderColor,omitempty"`
	BorderTop      bool        `json:"borderTop,omitempty"`
	BorderStyle    string      `json:"borderStyle,omitempty"`
	BorderWidth    float64     `json:"borderWidth,omitempty"`
	AnchorBottom   bool        `json:"anchorBottom,omitempty"`
	FrameX         float64     `json:"frameX,omitempty"`
	FrameY         float64     `json:"frameY,omitempty"`
	FrameWidth     float64     `json:"frameWidth,omitempty"`
	Protected      bool        `json:"protected,omitempty"`
	Tabs           []TabStop   `json:"tabs,omitempty"`
}
type CellMargins struct {
	Top    float64 `json:"top"`
	Bottom float64 `json:"bottom"`
	Left   float64 `json:"left"`
	Right  float64 `json:"right"`
}

func (c Cell) padding() CellMargins {
	if c.Margins != nil {
		return *c.Margins
	}
	return CellMargins{2, 2, 2, 2}
}

type Cell struct {
	VerticalAlign string       `json:"verticalAlign,omitempty"`
	Paragraphs    []Paragraph  `json:"paragraphs"`
	Span          int          `json:"span"`
	Merge         string       `json:"merge,omitempty"`
	Margins       *CellMargins `json:"margins,omitempty"`
	NoBorders     bool         `json:"noBorders,omitempty"`
}
type Row struct {
	Cells  []Cell  `json:"cells"`
	Header bool    `json:"header"`
	Height float64 `json:"height,omitempty"`
}
type Table struct {
	Caption     *Paragraph `json:"caption,omitempty"`
	Align       string     `json:"align,omitempty"`
	Width       float64    `json:"width,omitempty"`
	BorderStyle string     `json:"borderStyle,omitempty"`
	Rows        []Row      `json:"rows"`
	Widths      []float64  `json:"widths"`
	Borders     bool       `json:"borders"`
	Role        string     `json:"role,omitempty"`
}
type Block struct {
	Paragraph *Paragraph `json:"paragraph,omitempty"`
	Table     *Table     `json:"table,omitempty"`
}
type Page struct {
	Width     float64 `json:"width"`
	Height    float64 `json:"height"`
	Top       float64 `json:"top"`
	Bottom    float64 `json:"bottom"`
	Left      float64 `json:"left"`
	Right     float64 `json:"right"`
	GridType  string  `json:"gridType"`
	LinePitch int     `json:"linePitch"`
	CharSpace int     `json:"charSpace"`
}
type Model struct {
	ConfirmedIssues     []string        `json:"confirmedIssues,omitempty"`
	AutoNumbering       bool            `json:"autoNumbering,omitempty"`
	LayoutNormalized    bool            `json:"layoutNormalized,omitempty"`
	Preprinted          bool            `json:"preprinted,omitempty"`
	ReviewComments      []ReviewComment `json:"reviewComments,omitempty"`
	Blocks              []Block         `json:"blocks"`
	Page                Page            `json:"page"`
	Template            string          `json:"template"`
	SourceID            string          `json:"sourceId,omitempty"`
	Warnings            []string        `json:"warnings"`
	PDFUnsupported      bool            `json:"pdfUnsupported"`
	HideFirstPageNumber bool            `json:"hideFirstPageNumber"`
	Header              []Paragraph     `json:"header,omitempty"`
	FirstHeader         []Paragraph     `json:"firstHeader,omitempty"`
	FirstFooter         []Paragraph     `json:"firstFooter,omitempty"`
}

func DefaultPage() Page {
	return Page{Width: 210, Height: 297, Top: 37, Bottom: 35, Left: 28, Right: 26, GridType: "linesAndChars", LinePitch: 579, CharSpace: -842}
}
func (m *Model) Paragraphs() []*Paragraph {
	var out []*Paragraph
	for i := range m.Blocks {
		b := &m.Blocks[i]
		if b.Paragraph != nil {
			out = append(out, b.Paragraph)
		}
		if b.Table != nil {
			if b.Table.Caption != nil {
				out = append(out, b.Table.Caption)
			}
			for ri := range b.Table.Rows {
				for ci := range b.Table.Rows[ri].Cells {
					cell := &b.Table.Rows[ri].Cells[ci]
					for pi := range cell.Paragraphs {
						out = append(out, &cell.Paragraphs[pi])
					}
				}
			}
		}
	}
	return out
}
func (m *Model) Text() string {
	var lines []string
	for _, p := range m.Paragraphs() {
		lines = append(lines, p.Prefix+p.Text)
	}
	return strings.Join(lines, "\n")
}
func (m *Model) Validate() error {
	for _, n := range []float64{m.Page.Width, m.Page.Height, m.Page.Top, m.Page.Bottom, m.Page.Left, m.Page.Right} {
		if math.IsNaN(n) || math.IsInf(n, 0) {
			return fmt.Errorf("页面尺寸无效")
		}
	}
	if len(m.Header)+len(m.FirstHeader)+len(m.FirstFooter) > 200 {
		return fmt.Errorf("页眉页脚结构过于复杂")
	}
	for _, p := range append(append(append([]Paragraph{}, m.Header...), m.FirstHeader...), m.FirstFooter...) {
		if len(p.Text) > 8000 || p.Size < 5 || p.Size > 72 || p.FrameY < 0 || p.FrameY > m.Page.Height || p.FrameWidth < 0 || p.FrameWidth > m.Page.Width {
			return fmt.Errorf("页眉页脚尺寸超出支持范围")
		}
	}
	if len(m.Blocks) > 12000 {
		return fmt.Errorf("文档段落过多，请拆分后处理")
	}
	total := 0
	ids := map[string]bool{}
	if m.Page.Width < 100 || m.Page.Width > 450 || m.Page.Height < 100 || m.Page.Height > 600 || m.Page.Left < 0 || m.Page.Right < 0 || m.Page.Top < 0 || m.Page.Bottom < 0 || m.Page.Width-m.Page.Left-m.Page.Right < 40 || m.Page.Height-m.Page.Top-m.Page.Bottom < 40 {
		return fmt.Errorf("页面尺寸无效")
	}
	for _, p := range m.Paragraphs() {
		lastRange := 0
		if len(p.EditableRanges) > 1000 {
			return fmt.Errorf("段落保护片段过多")
		}
		for _, r := range p.EditableRanges {
			if r.Start < lastRange || r.End < r.Start || r.End > len(p.Text) || !utf8.ValidString(p.Text[r.Start:r.End]) {
				return fmt.Errorf("段落保护片段位置无效")
			}
			lastRange = r.End
		}
		for _, n := range []float64{p.Size, p.Before, p.After, p.Line, p.Indent, p.LeftIndent, p.RightIndent, p.Hanging} {
			if math.IsNaN(n) || math.IsInf(n, 0) {
				return fmt.Errorf("段落尺寸无效")
			}
		}
		if len(p.BreakOffsets) > 100 {
			return fmt.Errorf("单段分页符过多")
		}
		last := -1
		for _, offset := range p.BreakOffsets {
			if offset < last || offset < 0 || offset > len(p.Text) || !utf8.ValidString(p.Text[:offset]) {
				return fmt.Errorf("段内分页位置无效")
			}
			last = offset
		}
		if p.LeftIndent < 0 || p.RightIndent < 0 || p.Hanging < 0 || p.LeftIndent > 100 || p.RightIndent > 100 || p.Hanging > 100 {
			return fmt.Errorf("段落缩进超出支持范围")
		}
		if p.ID == "" || ids[p.ID] {
			return fmt.Errorf("段落标识无效")
		}
		ids[p.ID] = true
		total += len(p.Text)
		if !utf8.ValidString(p.Text) {
			return fmt.Errorf("正文编码无效")
		}
		for _, r := range p.Text {
			if r < 32 && r != '\n' && r != '\t' && r != '\r' || r == 0xfffe || r == 0xffff {
				return fmt.Errorf("正文含不可写入的字符")
			}
		}
		if p.Size < 5 || p.Size > 72 || p.Before < 0 || p.After < 0 || p.Line < 0 || p.Before > 250 || p.After > 250 || p.Line > 100 || p.Indent < 0 || p.Indent > 100 {
			return fmt.Errorf("段落尺寸超出支持范围")
		}
	}
	if total > 2*1024*1024 {
		return fmt.Errorf("正文超过 2 MB")
	}
	if strings.TrimSpace(m.Text()) == "" {
		return fmt.Errorf("请填写正文")
	}
	for _, b := range m.Blocks {
		if (b.Paragraph == nil) == (b.Table == nil) {
			return fmt.Errorf("文档块结构无效")
		}
		if b.Table != nil {
			if len(b.Table.Rows) > 1000 || len(b.Table.Widths) > 30 {
				return fmt.Errorf("表格过大")
			}
			if math.IsNaN(b.Table.Width) || math.IsInf(b.Table.Width, 0) || b.Table.Width < 0 || b.Table.Width > m.Page.Width {
				return fmt.Errorf("表格宽度无效")
			}
			for _, row := range b.Table.Rows {
				if len(row.Cells) > 30 {
					return fmt.Errorf("表格列数过多")
				}
				for _, cell := range row.Cells {
					if cell.Span < 1 || cell.Span > 30 {
						return fmt.Errorf("合并单元格无效")
					}
				}
			}
		}
	}
	return nil
}
func Plain(text string) Model {
	m := Model{Page: DefaultPage(), Template: "plain", Warnings: []string{}, Blocks: []Block{}}
	first := true
	for i, line := range strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n") {
		p := Paragraph{ID: fmt.Sprintf("p%d", i), Text: line, Role: "body", Align: "both", Font: "仿宋", Size: 16, Line: 10.21, Indent: 11.29}
		if first && strings.TrimSpace(line) != "" {
			p.Role = "title"
			p.Size = 22
			p.Font = "方正小标宋简体"
			p.Align = "center"
			p.Indent = 0
			p.After = 5
			p.KeepNext = true
			first = false
		}
		m.Blocks = append(m.Blocks, Block{Paragraph: &p})
	}
	return m
}
