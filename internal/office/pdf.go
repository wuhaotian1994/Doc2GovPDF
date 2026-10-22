package office

import (
	"bytes"
	"codeberg.org/go-pdf/fpdf"
	"context"
	"doc2govpdf/assets"
	"encoding/binary"
	"fmt"
	"golang.org/x/image/font"
	"golang.org/x/image/font/sfnt"
	"golang.org/x/image/math/fixed"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"unicode"
)

type FontInfo struct {
	Name      string `json:"name"`
	Available bool   `json:"available"`
	Fallback  string `json:"fallback,omitempty"`
}
type fontData struct {
	name string
	data []byte
}

var fontOnce sync.Once
var fonts map[string]fontData
var fontMaps map[string]*sfnt.Font

func fontCatalog() {
	fontOnce.Do(func() {
		fonts = map[string]fontData{}
		root := filepath.Join(os.Getenv("WINDIR"), "Fonts")
		if root == "Fonts" {
			root = `C:\Windows\Fonts`
		}
		candidates := map[string][]string{"仿宋": {"simfang.ttf", "STFANGSO.TTF"}, "黑体": {"simhei.ttf"}, "楷体": {"simkai.ttf"}, "宋体": {"simsun.ttc"}, "方正小标宋简体": {"FZXBSJW.TTF", "FZXBSJW.ttf", "FZXBSK.TTF"}}
		for role, names := range candidates {
			paths := []string{}
			for _, name := range names {
				paths = append(paths, filepath.Join(root, name), filepath.Join(os.Getenv("LOCALAPPDATA"), "Microsoft", "Windows", "Fonts", name))
			}
			paths = append(paths, extraFontPaths(role)...)
			for _, path := range paths {
				b, e := os.ReadFile(path)
				if e != nil {
					continue
				}
				if bytes.HasPrefix(b, []byte("ttcf")) {
					b, e = extractTTC(b, 0)
					if e != nil {
						continue
					}
				}
				if !embeddingAllowed(b) {
					continue
				}
				fonts[role] = fontData{role, b}
				break
			}
		}
		fonts["Noto Serif SC"] = fontData{"Noto Serif SC", assets.FallbackFont}
		fonts["Noto Serif SC Black"] = fontData{"Noto Serif SC Black", assets.FallbackBlackFont}
		fontMaps = map[string]*sfnt.Font{}
		for name, face := range fonts {
			if parsed, e := sfnt.Parse(face.data); e == nil {
				fontMaps[name] = parsed
			}
		}
	})
}
func FontStatus() []FontInfo {
	fontCatalog()
	out := []FontInfo{}
	for _, name := range []string{"仿宋", "黑体", "楷体", "宋体", "方正小标宋简体"} {
		_, ok := fonts[name]
		info := FontInfo{Name: name, Available: ok}
		if !ok {
			info.Fallback = resolveFont(name).name
		}
		out = append(out, info)
	}
	return out
}
func resolveFont(name string) fontData {
	fontCatalog()
	lower := strings.ToLower(name)
	switch {
	case strings.Contains(lower, "fangsong") || strings.Contains(lower, "仿宋"):
		name = "仿宋"
	case strings.Contains(lower, "simhei") || strings.Contains(lower, "黑体"):
		name = "黑体"
	case strings.Contains(lower, "kaiti") || strings.Contains(lower, "楷体"):
		name = "楷体"
	case strings.Contains(lower, "小标宋") || strings.Contains(lower, "songti sc black"):
		name = "方正小标宋简体"
	case strings.Contains(lower, "simsun") || strings.Contains(lower, "宋体"):
		name = "宋体"
	}
	if f, ok := fonts[name]; ok {
		return f
	}
	if name == "方正小标宋简体" || name == "黑体" {
		if f, ok := fonts["Noto Serif SC Black"]; ok {
			return f
		}
	}
	return fonts["Noto Serif SC"]
}

// Extract a TrueType collection face without redistributing system fonts.
func extractTTC(src []byte, face int) ([]byte, error) {
	if len(src) < 16 {
		return nil, fmt.Errorf("字体损坏")
	}
	count := int(binary.BigEndian.Uint32(src[8:12]))
	if face < 0 || face >= count || 12+4*count > len(src) {
		return nil, fmt.Errorf("字体集合无效")
	}
	start := int(binary.BigEndian.Uint32(src[12+face*4:]))
	if start < 0 || start+12 > len(src) {
		return nil, fmt.Errorf("字体索引无效")
	}
	n := int(binary.BigEndian.Uint16(src[start+4:]))
	header := 12 + n*16
	if start+header > len(src) {
		return nil, fmt.Errorf("字体表无效")
	}
	out := append([]byte(nil), src[start:start+header]...)
	headOffset := 0
	for i := 0; i < n; i++ {
		rec := start + 12 + i*16
		off := int(binary.BigEndian.Uint32(src[rec+8:]))
		length := int(binary.BigEndian.Uint32(src[rec+12:]))
		if off < 0 || length < 0 || off+length > len(src) {
			return nil, fmt.Errorf("字体表越界")
		}
		position := len(out)
		binary.BigEndian.PutUint32(out[12+i*16+8:], uint32(position))
		out = append(out, src[off:off+length]...)
		for len(out)%4 != 0 {
			out = append(out, 0)
		}
		if string(src[rec:rec+4]) == "head" {
			headOffset = position
		}
	}
	if headOffset > 0 && headOffset+12 <= len(out) {
		binary.BigEndian.PutUint32(out[headOffset+8:], 0)
		sum := uint32(0)
		for i := 0; i < len(out); i += 4 {
			sum += binary.BigEndian.Uint32(out[i : i+4])
		}
		binary.BigEndian.PutUint32(out[headOffset+8:], 0xB1B0AFBA-sum)
	}
	return out, nil
}

type PDFResult struct {
	Data     []byte
	Pages    int
	Warnings []string
}
type pdfWriter struct {
	pageFormats   map[int]Page
	charSpacing   float64
	firstFooter   []Paragraph
	f             *fpdf.Fpdf
	ctx           context.Context
	page          Page
	y             float64
	loaded        map[string]string
	warnings      map[string]bool
	pages         int
	hideFirst     bool
	header        []Paragraph
	firstHeader   []Paragraph
	lastInkBottom float64
	newDocument   bool
	faceName      string
	pointSize     float64
	keepTail      float64
	hiddenInk     bool
}

func RenderPDF(ctx context.Context, m Model) (PDFResult, error) {
	var fitErr error
	m, fitErr = fitMarks(m)
	if fitErr != nil {
		return PDFResult{}, fitErr
	}
	m = prepareNewLayout(m)
	m = preparePDFParagraphSpacing(m)
	m = prepareInkPlacement(m, false)
	m = suppressPreprintedMarks(m)
	if e := m.Validate(); e != nil {
		return PDFResult{}, e
	}
	if m.PDFUnsupported {
		return PDFResult{}, fmt.Errorf("此文档包含不能可靠转换的对象，暂不能生成 PDF；Word 原件及对象会保留")
	}
	initialPage := m.Page
	if len(m.Blocks) > 0 && m.Blocks[0].Page != nil {
		initialPage = *m.Blocks[0].Page
	}
	w := &pdfWriter{ctx: ctx, page: initialPage, loaded: map[string]string{}, warnings: map[string]bool{}, hideFirst: m.HideFirstPageNumber, header: m.Header, firstHeader: m.FirstHeader, firstFooter: m.FirstFooter}
	w.newDocument = m.SourceID == ""
	w.f = fpdf.NewCustom(&fpdf.InitType{UnitStr: "mm", Size: fpdf.SizeType{Wd: initialPage.Width, Ht: initialPage.Height}})
	w.f.SetMargins(m.Page.Left, m.Page.Top, m.Page.Right)
	w.f.SetCellMargin(0)
	w.f.SetAutoPageBreak(false, m.Page.Bottom)
	w.f.SetCompression(true)
	w.f.SetTitle("公文", true)
	w.f.SetCreator("Doc2GovPDF", true)
	w.f.SetFooterFunc(func() {
		page := w.pageFormats[w.f.PageNo()]
		if w.f.PageNo() == 1 {
			for _, p := range w.firstFooter {
				if p.BorderTop || p.BorderBottom {
					w.drawBorder(p, 20, page.Height-20, 170)
				}
			}
		}
		if w.hideFirst && w.f.PageNo() == 1 {
			return
		}
		w.setFont(Paragraph{Font: "宋体", Size: 14})
		w.f.SetTextColor(0, 0, 0)
		footerY := page.Height - page.Bottom + 7 - 3 - .3*14*25.4/72
		// Glyph bounds include non-inking font padding. Calibrated against the
		// rendered SimSun dash at 144 dpi on Windows; keep ink about 7 mm below
		// the text area instead of positioning the footer by an arbitrary edge.
		footerY += .22
		face := fontMaps[resolveFont("宋体").name]
		if face != nil {
			if glyph, e := face.GlyphIndex(nil, '—'); e == nil {
				if bounds, _, e := face.GlyphBounds(nil, glyph, fixed.I(14), font.HintingNone); e == nil {
					footerY -= float64(bounds.Min.Y) / 64 * 25.4 / 72
				}
			}
		}
		footerIndent := 14.0 * 25.4 / 72
		w.f.SetXY(page.Left+footerIndent, footerY)
		alignment := "R"
		if w.f.PageNo()%2 == 0 {
			alignment = "L"
		}
		w.f.CellFormat(page.Width-page.Left-page.Right-2*footerIndent, 6, fmt.Sprintf("— %d —", w.f.PageNo()), "", 0, alignment, false, 0, "")
	})
	w.newPage()
	var anchored []Paragraph
	for index, b := range m.Blocks {
		if e := ctx.Err(); e != nil {
			return PDFResult{}, e
		}
		if b.Page != nil && index > 0 {
			if e := w.drawAnchored(anchored); e != nil {
				return PDFResult{}, e
			}
			anchored = nil
			w.page = *b.Page
			w.newPage()
		}
		if b.Paragraph != nil {
			if b.Paragraph.AnchorBottom {
				anchored = append(anchored, *b.Paragraph)
				continue
			}
			if b.Paragraph.KeepNext {
				height := w.paragraphHeight(*b.Paragraph, 0)
				ownHeight := height
				for next := index + 1; next < len(m.Blocks); next++ {
					if m.Blocks[next].Page != nil {
						break
					}
					p := m.Blocks[next].Paragraph
					if table := m.Blocks[next].Table; table != nil {
						if table.Caption != nil {
							height += w.paragraphHeight(*table.Caption, 0)
						}
						for ri := 0; ri < len(table.Rows) && ri < 2; ri++ {
							height += w.tableRowHeight(table.Rows[ri], table.Widths)
						}
						break
					}
					if p == nil || p.AnchorBottom || p.PageBreak {
						break
					}
					limit := 0
					if !p.KeepNext {
						limit = 1
						if w.newDocument {
							limit = 2
						}
						if chapterLabel.MatchString(b.Paragraph.Prefix + b.Paragraph.Text) {
							limit = 2
						}
					}
					height += w.paragraphHeight(*p, limit)
					if !p.KeepNext {
						break
					}
				}
				w.keepTail = height - ownHeight
				if !w.newDocument || height <= w.page.Height-w.page.Top-w.page.Bottom {
					if e := w.room(height); e != nil {
						return PDFResult{}, e
					}
				}
			}
			if e := w.paragraph(*b.Paragraph); e != nil {
				return PDFResult{}, e
			}
			w.keepTail = 0
		} else if b.Table != nil {
			if e := w.table(*b.Table); e != nil {
				return PDFResult{}, e
			}
		}
		if w.pages > 100 {
			return PDFResult{}, fmt.Errorf("排版超过 100 页，请拆分文档")
		}
	}
	if e := w.drawAnchored(anchored); e != nil {
		return PDFResult{}, e
	}
	var out bytes.Buffer
	if e := w.f.Output(&out); e != nil {
		return PDFResult{}, fmt.Errorf("PDF 排版失败：%w", e)
	}
	result := PDFResult{Data: out.Bytes(), Pages: w.pages, Warnings: []string{}}
	for warning := range w.warnings {
		result.Warnings = append(result.Warnings, warning)
	}
	return result, nil
}
func (w *pdfWriter) setFont(p Paragraph) {
	w.hiddenInk = p.HiddenInk
	fd := resolveFont(p.Font)
	if r := missingGlyph(fd.name, p.Prefix+p.Text); r != 0 {
		fd = fonts["Noto Serif SC"]
		w.warnings["部分字符在原字体中缺失，已使用 Noto Serif SC 显示，请核对字形。"] = true
		if missing := missingGlyph(fd.name, p.Prefix+p.Text); missing != 0 {
			w.f.SetError(fmt.Errorf("字体无法显示字符 %U，请调整该字符后重试；Word 原件仍保留", missing))
			return
		}
	}
	sum := fd.name
	family := w.loaded[sum]
	if family == "" {
		family = fmt.Sprintf("f%d", len(w.loaded))
		w.f.AddUTF8FontFromBytes(family, "", fd.data)
		w.loaded[sum] = family
	}
	if strings.HasPrefix(fd.name, "Noto Serif SC") && p.Font != fd.name {
		w.warnings["当前排版引擎未取得可用字体“"+p.Font+"”，PDF 使用已嵌入的 "+fd.name+" 备用字体，仅供草拟，不代表全文国标检查通过。"] = true
	}
	w.f.SetFont(family, "", p.Size)
	w.faceName = fd.name
	w.pointSize = p.Size
	w.f.RawWriteStr("BT 0 Tr ET")
	w.charSpacing = 0
	if p.Size == 16 && w.page.GridType == "linesAndChars" && w.page.CharSpace >= -1000 && w.page.CharSpace <= 0 {
		w.charSpacing = float64(w.page.CharSpace) / 4096 * 25.4 / 72
	}
	w.f.RawWriteStr(fmt.Sprintf("BT %.5f Tc ET", w.charSpacing*72/25.4))
	w.f.SetTextColor(0, 0, 0)
	if len(p.Color) == 6 {
		if color, e := strconv.ParseUint(p.Color, 16, 32); e == nil {
			w.f.SetTextColor(int(color>>16), int(color>>8&255), int(color&255))
		}
	}
	if p.Bold && !strings.Contains(fd.name, "Black") {
		n, _ := strconv.ParseUint(p.Color, 16, 32)
		w.f.SetDrawColor(int(n>>16), int(n>>8&255), int(n&255))
		w.f.SetLineWidth(p.Size * 25.4 / 72 * .015)
		w.f.RawWriteStr("BT 2 Tr ET")
	}
}

func missingGlyph(name, text string) rune {
	font := fontMaps[name]
	if font == nil {
		return 0
	}
	for _, r := range text {
		if unicode.IsSpace(r) || unicode.Is(unicode.Cf, r) {
			continue
		}
		index, e := font.GlyphIndex(nil, r)
		if e != nil || index == 0 {
			return r
		}
	}
	return 0
}

func embeddingAllowed(b []byte) bool {
	if len(b) < 12 {
		return false
	}
	n := int(binary.BigEndian.Uint16(b[4:6]))
	if 12+n*16 > len(b) {
		return false
	}
	for i := 0; i < n; i++ {
		entry := b[12+i*16 : 12+(i+1)*16]
		if string(entry[:4]) != "OS/2" {
			continue
		}
		offset := int(binary.BigEndian.Uint32(entry[8:12]))
		if offset < 0 || offset+10 > len(b) {
			return false
		}
		flags := binary.BigEndian.Uint16(b[offset+8 : offset+10])
		return flags&0x0302 == 0
	}
	return false
}
func (w *pdfWriter) newPage() {
	if w.pages >= 100 {
		w.f.SetError(fmt.Errorf("排版超过 100 页，请拆分文档"))
		return
	}
	if w.pageFormats == nil {
		w.pageFormats = map[int]Page{}
	}
	w.pageFormats[w.pages+1] = w.page
	w.f.AddPageFormat("P", fpdf.SizeType{Wd: w.page.Width, Ht: w.page.Height})
	w.f.SetMargins(w.page.Left, w.page.Top, w.page.Right)
	w.pages++
	w.y = w.page.Top
	lines := w.header
	if w.pages == 1 && len(w.firstHeader) > 0 {
		lines = w.firstHeader
	}
	y := 12.0
	if w.pages == 1 && len(lines) > 0 {
		y = 30
	}
	for _, p := range lines {
		if p.FrameY > 0 {
			y = p.FrameY
		}
		if p.BorderTop {
			width := p.FrameWidth
			if width <= 0 {
				width = w.page.Width - w.page.Left - w.page.Right
			}
			x := p.FrameX
			if x == 0 {
				x = w.page.Left
			}
			if w.newDocument {
				w.drawBorder(p, x, y, width)
			} else {
				w.drawBorder(p, x-.5, y, width+1)
			}
		}
		if strings.TrimSpace(p.Text) == "" {
			continue
		}
		w.setFont(p)
		height := p.Size * 25.4 / 72 * 1.3
		align := "L"
		if p.Align == "center" {
			align = "C"
		}
		w.f.SetXY(w.page.Left, y)
		w.drawText(w.page.Left, y, w.page.Width-w.page.Left-w.page.Right, height, p.Text, align, w.charSpacing)
		y += height
		if p.BorderBottom {
			w.f.SetDrawColor(210, 0, 0)
			if !p.HiddenInk {
				w.f.Line(w.page.Left, y, w.page.Width-w.page.Right, y)
			}
		}
	}
	if w.pages == 1 && len(lines) > 0 && y+6 > w.y {
		gap := 3.0
		w.y = y + gap
	}
}
func (w *pdfWriter) room(height float64) error {
	if height > w.page.Height-w.page.Top-w.page.Bottom {
		return fmt.Errorf("单个段落或表格行超出一页，请拆分内容")
	}
	if w.y+height > w.page.Height-w.page.Bottom {
		w.newPage()
	}
	return nil
}

// Greedy rune wrapping preserves every character and handles CJK without spaces.
func (w *pdfWriter) wrap(text string, width float64) []string { return w.wrapIndented(text, width, 0) }
func (w *pdfWriter) wrapIndented(text string, width, indent float64) []string {
	var out []string
	first := true
	for _, part := range strings.Split(strings.ReplaceAll(text, "\t", "    "), "\n") {
		line := ""
		for _, r := range part {
			next := line + string(r)
			available := width
			if first {
				available -= indent
			}
			if w.f.GetStringWidth(string(r)) > available+.15 {
				w.f.SetError(fmt.Errorf("字号或缩进导致字符超出版心，请调整格式"))
				return []string{text}
			}
			if line != "" && w.textWidth(next) > available+.15 {
				chars := []rune(line)
				cut := len(chars)
				if nonbreakingRune(r) && cut > 0 && nonbreakingRune(chars[cut-1]) {
					start := cut
					for start > 0 && nonbreakingRune(chars[start-1]) {
						start--
					}
					if start > 0 {
						cut = start
					}
				}
				if strings.ContainsRune("，。；：！？、）】》〉」』〕％%.,;:!?)]}", r) {
					cut = min(cut, len(chars)-1)
					for cut > 0 && cut < len(chars) && nonbreakingRune(chars[cut-1]) && nonbreakingRune(chars[cut]) {
						cut--
					}
				}
				for cut > 0 && ((cut < len(chars) && strings.ContainsRune("，。；：！？、）】》〉」』〕％%.,;:!?)]}", chars[cut])) || strings.ContainsRune("（【《〈「『〔([{", chars[cut-1])) {
					cut--
				}
				if cut == 0 {
					cut = len(chars)
				}
				out = append(out, string(chars[:cut]))
				line = string(chars[cut:]) + string(r)
				first = false
			} else {
				line = next
			}
		}
		out = append(out, line)
		first = false
	}
	return out
}

func nonbreakingRune(r rune) bool {
	return r >= '0' && r <= '9' || r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r == '×' || r == '-' || r == '/' || r == '.' || r == '%'
}
func (w *pdfWriter) paragraph(p Paragraph) error {
	if p.Role == "letterhead-divider" && w.lastInkBottom > 0 {
		p.Line = math.Max(.1, w.lastInkBottom+4-w.y-borderWidth(p)/2)
	}
	if p.Role == "roster" && strings.Contains(p.Text, "：") {
		return w.roster(p)
	}
	if len(p.Tabs) > 0 && strings.Contains(p.Text, "\t") && len(p.BreakOffsets) == 0 {
		return w.tabbed(p)
	}
	if len(p.BreakOffsets) > 0 {
		offsets := append(append([]int{}, p.BreakOffsets...), len(p.Text))
		start := 0
		for i, end := range offsets {
			if e := w.ctx.Err(); e != nil {
				return e
			}
			part := p
			part.BreakOffsets = nil
			part.Text = p.Text[start:end]
			if i > 0 {
				part.PageBreak = false
				part.Prefix = ""
				part.Before = 0
				part.Indent = 0
			}
			if i < len(offsets)-1 {
				part.After = 0
				part.KeepNext = false
			}
			if part.Text != "" {
				if e := w.paragraph(part); e != nil {
					return e
				}
			}
			if i < len(offsets)-1 {
				w.newPage()
			}
			start = end
		}
		return nil
	}
	// An explicit line break ends justification. Keep its next line inside the
	// same paragraph without repeating first-line indentation or spacing.
	if strings.Contains(p.Text, "\n") {
		parts := strings.Split(p.Text, "\n")
		for i, text := range parts {
			part := p
			part.Text = text
			if i > 0 {
				part.Before, part.Indent, part.Hanging = 0, 0, 0
				part.Prefix, part.PageBreak = "", false
			}
			if i < len(parts)-1 {
				part.After, part.KeepNext = 0, true
			}
			if e := w.paragraph(part); e != nil {
				return e
			}
		}
		return nil
	}
	if p.PageBreak && w.y > w.page.Top+.1 {
		w.newPage()
	}
	// Word suppresses space-before at an automatic page start. Keep authored
	// source placement and explicit page breaks, but match this for new output.
	if w.newDocument && w.pages > 1 && math.Abs(w.y-w.page.Top) < .1 && !p.PageBreak {
		p.Before = 0
	}
	w.setFont(p)
	line := p.Line
	if strings.TrimSpace(p.Text) != "" && line < p.Size*25.4/72*1.15 {
		line = p.Size * 25.4 / 72 * 1.3
	}
	width := w.page.Width - w.page.Left - w.page.Right - p.LeftIndent - p.RightIndent
	if width < 20 {
		return fmt.Errorf("段落左右缩进过大，请调整后重试")
	}
	indent := p.Indent - p.Hanging
	if p.Size == 16 && math.Abs(p.Indent-11.29) < .1 && p.Hanging == 0 {
		indent = 2 * (16*25.4/72 + w.charSpacing)
	}
	if p.Align == "center" || p.Align == "right" {
		indent = 0
	}
	lines := w.wrapIndented(p.Prefix+p.Text, width, indent)
	if p.KeepNext {
		height := p.Before + line*float64(len(lines)) + p.After + line
		if !w.newDocument || height <= w.page.Height-w.page.Top-w.page.Bottom {
			if e := w.room(height); e != nil {
				return e
			}
		}
	}
	w.y += p.Before
	// New Word documents use widow/orphan control by default. A three-line
	// paragraph cannot leave one line on either page; longer paragraphs need
	// at least two lines on each side of an automatic page break.
	if w.newDocument && len(lines) > 1 {
		need := min(len(lines), 2)
		if len(lines) == 3 {
			need = 3
		}
		if e := w.room(float64(need) * line); e != nil {
			return e
		}
	}
	for i, txt := range lines {
		if e := w.ctx.Err(); e != nil {
			return e
		}
		need := line
		if w.newDocument && len(lines)-i == 2 {
			need = 2 * line
		}
		// Reserve following content at the widow boundary once. Retrying on the
		// last line can strand that single line when two lines plus an oversized
		// keep chain did not fit a page but one line plus that chain does.
		if w.newDocument && p.KeepNext && len(lines)-i == min(2, len(lines)) && w.keepTail > 0 {
			tail := float64(len(lines)-i)*line + p.After + w.keepTail
			if tail <= w.page.Height-w.page.Top-w.page.Bottom {
				need = tail
			}
		}
		if e := w.room(need); e != nil {
			return e
		}
		w.setFont(p)
		x := w.page.Left + p.LeftIndent
		if i == 0 {
			x += indent
		}
		align := "L"
		if p.Align == "center" {
			align = "C"
		} else if p.Align == "right" {
			align = "R"
		}
		w.f.SetXY(x, w.y)
		spacing := w.charSpacing
		if p.Align == "both" && i < len(lines)-1 && w.textWidth(txt) > .8*(w.page.Width-w.page.Right-p.RightIndent-x) {
			n := len([]rune(txt))
			if n > 1 {
				spacing = (w.page.Width - w.page.Right - p.RightIndent - x - w.glyphsWidth(txt)) / float64(n-1)
				w.f.RawWriteStr(fmt.Sprintf("BT %.5f Tc ET", spacing*72/25.4))
			}
		}
		lead, leadFont := "", ""
		if i == 0 && p.PrefixFont != "" {
			lead = p.Prefix
			leadFont = p.PrefixFont
		}
		if i == 0 && p.Role == "article" {
			lead = articleLabel.FindString(txt)
			leadFont = "黑体"
		}
		if lead != "" && strings.HasPrefix(txt, lead) {
			q := p
			q.Font = leadFont
			q.Text = lead
			w.setFont(q)
			w.f.RawWriteStr(fmt.Sprintf("BT %.5f Tc ET", spacing*72/25.4))
			advance := w.glyphsWidth(lead) + float64(len([]rune(lead)))*spacing
			if align == "C" || align == "R" {
				w.setFont(p)
				total := advance + w.glyphsWidth(strings.TrimPrefix(txt, lead)) + float64(max(0, len([]rune(strings.TrimPrefix(txt, lead)))-1))*spacing
				available := w.page.Width - w.page.Right - p.RightIndent - x
				if align == "C" {
					x += (available - total) / 2
				} else {
					x += available - total
				}
				w.setFont(q)
			}
			w.drawText(x, w.y, advance, line, lead, "L", spacing)
			w.setFont(p)
			w.f.RawWriteStr(fmt.Sprintf("BT %.5f Tc ET", spacing*72/25.4))
			w.f.SetXY(x+advance, w.y)
			w.drawText(x+advance, w.y, w.page.Width-w.page.Right-p.RightIndent-x-advance, line, strings.TrimPrefix(txt, lead), "L", spacing)
		} else {
			w.drawText(x, w.y, w.page.Width-w.page.Right-p.RightIndent-x, line, txt, align, spacing)
		}
		_, bottom := glyphInk(Paragraph{Font: p.Font, Size: p.Size, Text: txt})
		w.lastInkBottom = w.y + line/2 + .3*p.Size*25.4/72 + bottom
		w.y += line
	}
	if p.BorderBottom {
		color := p.BorderColor
		if color == "" || color == "auto" {
			color = "000000"
		}
		n, _ := strconv.ParseUint(color, 16, 32)
		w.f.SetDrawColor(int(n>>16), int(n>>8&255), int(n&255))
		width := borderWidth(p)
		w.f.SetLineWidth(width)
		if !p.HiddenInk {
			w.f.Line(w.page.Left, w.y+width/2, w.page.Width-w.page.Right, w.y+width/2)
		}
		w.y += width
	}
	w.y += p.After
	return nil
}
func (w *pdfWriter) table(t Table) error {
	if t.Caption != nil {
		height := w.paragraphHeight(*t.Caption, 0)
		for i := 0; i < len(t.Rows) && i < 2; i++ {
			height += w.tableRowHeight(t.Rows[i], t.Widths)
		}
		if e := w.room(height); e != nil {
			return e
		}
		if e := w.paragraph(*t.Caption); e != nil {
			return e
		}
	}
	width := w.page.Width - w.page.Left - w.page.Right
	columns := len(t.Widths)
	if columns == 0 {
		for _, r := range t.Rows {
			n := 0
			for _, c := range r.Cells {
				n += c.Span
			}
			if n > columns {
				columns = n
			}
		}
	}
	if columns < 1 {
		return nil
	}
	widths := make([]float64, columns)
	sum := 0.0
	for _, v := range t.Widths {
		sum += v
	}
	tableX := w.page.Left
	requested := sum
	if t.Width > 0 {
		requested = t.Width
	}
	if requested > 0 && requested < width {
		if t.Align == "center" {
			tableX += (width - requested) / 2
		} else if t.Align == "right" {
			tableX += width - requested
		}
		width = requested
	}
	for i := range widths {
		widths[i] = width / float64(columns)
		if len(t.Widths) == columns && sum > 0 {
			widths[i] = t.Widths[i] / sum * width
		}
	}
	for rowIndex, row := range t.Rows {
		if e := w.ctx.Err(); e != nil {
			return e
		}
		spacer := len(row.Cells) > 0
		for _, cell := range row.Cells {
			if !cell.NoBorders || cellText(cell) != "" {
				spacer = false
			}
		}
		if spacer && row.Height > 0 {
			if e := w.room(row.Height); e != nil {
				return e
			}
			w.y += row.Height
			continue
		}
		height := row.Height
		col := 0
		cellLines := make([][]string, len(row.Cells))
		cellWidths := make([]float64, len(row.Cells))
		cellFonts := make([]Paragraph, len(row.Cells))
		cellHeights := make([]float64, len(row.Cells))
		for i, c := range row.Cells {
			cw := 0.0
			for j := 0; j < c.Span && col+j < columns; j++ {
				cw += widths[col+j]
			}
			col += c.Span
			if cw < 5 {
				return fmt.Errorf("表格列结构无效")
			}
			cellWidths[i] = cw
			text := ""
			p := Paragraph{Font: "仿宋", Size: 14}
			for j, para := range c.Paragraphs {
				if j == 0 {
					p = para
				}
				if j > 0 {
					text += "\n"
				}
				text += para.Prefix + para.Text
			}
			if t.Borders && p.Size > 22 {
				p.Size = 22
			}
			cellFonts[i] = p
			p.Text = text
			cellFonts[i] = p
			w.setFont(p)
			padding := c.padding()
			available := cw - padding.Left - padding.Right - p.LeftIndent - p.RightIndent
			for _, r := range text {
				if r != '\n' && r != '\t' && w.f.GetStringWidth(string(r)) > available+.15 {
					return fmt.Errorf("表格列过窄，请扩大列宽或减少列数")
				}
			}
			cellLines[i] = w.wrap(text, available)
			if p.Role == "roster-names" {
				cellLines[i] = nil
				for _, line := range wrapRosterNames(text, available, w.textWidth) {
					cellLines[i] = append(cellLines[i], w.wrap(line, available)...)
				}
			}
			line := p.Line
			if line < p.Size*25.4/72*1.15 {
				line = p.Size * 25.4 / 72 * 1.4
			}
			cellHeights[i] = line
			h := float64(len(cellLines[i]))*line + padding.Top + padding.Bottom
			if h > height {
				height = h
			}
		}
		if w.newDocument && rowIndex+1 < len(t.Rows) {
			keep := false
			for _, cell := range row.Cells {
				for _, p := range cell.Paragraphs {
					keep = keep || p.KeepNext
				}
			}
			if keep {
				pair := height + w.tableRowHeight(t.Rows[rowIndex+1], widths)
				header := 0.0
				if rowIndex > 0 && t.Rows[0].Header {
					header = w.tableRowHeight(t.Rows[0], widths)
				}
				if pair+header <= w.page.Height-w.page.Top-w.page.Bottom && w.y+pair > w.page.Height-w.page.Bottom {
					w.newPage()
					if header > 0 {
						if e := w.table(Table{Align: t.Align, Width: t.Width, Rows: []Row{t.Rows[0]}, Widths: t.Widths, Borders: t.Borders, BorderStyle: t.BorderStyle, Role: "repeat-header"}); e != nil {
							return e
						}
					}
				}
			}
		}
		if rowIndex > 0 && w.y+height > w.page.Height-w.page.Bottom {
			if t.Borders && t.BorderStyle == "three-line" {
				w.f.SetDrawColor(0, 0, 0)
				w.f.SetLineWidth(.4)
				w.f.Line(tableX, w.y, tableX+width, w.y)
			}
			w.newPage()
			if t.Rows[0].Header {
				if e := w.table(Table{Align: t.Align, Width: t.Width, Rows: []Row{t.Rows[0]}, Widths: t.Widths, Borders: t.Borders, BorderStyle: t.BorderStyle, Role: "repeat-header"}); e != nil {
					return e
				}
				if w.y+height > w.page.Height-w.page.Bottom {
					return fmt.Errorf("表格单行过长，请拆分后再出稿")
				}
			}
		}
		if rowIndex == 0 && row.Header && len(t.Rows) > 1 {
			if e := w.room(height + w.tableRowHeight(t.Rows[1], widths)); e != nil {
				return e
			}
		}
		if e := w.room(height); e != nil {
			return e
		}
		x := tableX
		if rowIndex == 0 && t.Borders && t.BorderStyle == "three-line" {
			w.f.SetDrawColor(0, 0, 0)
			w.f.SetLineWidth(.4)
			w.f.Line(x, w.y, x+width, w.y)
		}
		for i, c := range row.Cells {
			cw := cellWidths[i]
			if c.Fill != "" {
				red, green, blue := hexColor(c.Fill)
				w.f.SetFillColor(red, green, blue)
				w.f.Rect(x, w.y, cw, height, "F")
			}
			if c.Borders != nil {
				for _, side := range []string{"top", "bottom", "left", "right"} {
					border, explicit := c.Borders[side]
					if !explicit {
						if !t.Borders || c.NoBorders || t.BorderStyle == "three-line" {
							continue
						}
						border = CellBorder{Style: "single", Width: .2, Color: "282828"}
					}
					if border.Style == "nil" || border.Style == "none" || border.Style == "" {
						continue
					}
					red, green, blue := hexColor(border.Color)
					w.f.SetDrawColor(red, green, blue)
					w.f.SetLineWidth(border.Width)
					switch side {
					case "top":
						w.f.Line(x, w.y, x+cw, w.y)
					case "bottom":
						w.f.Line(x, w.y+height, x+cw, w.y+height)
					case "left":
						w.f.Line(x, w.y, x, w.y+height)
					case "right":
						w.f.Line(x+cw, w.y, x+cw, w.y+height)
					}
				}
			} else if t.Borders && !c.NoBorders && t.BorderStyle != "three-line" {
				w.f.SetDrawColor(40, 40, 40)
				w.f.SetLineWidth(.2)
				w.f.Rect(x, w.y, cw, height, "D")
			}
			w.setFont(cellFonts[i])
			lh := cellHeights[i]
			padding := c.padding()
			left := padding.Left + cellFonts[i].LeftIndent
			right := padding.Right + cellFonts[i].RightIndent
			if c.Merge != "continue" {
				extra := height - padding.Top - padding.Bottom - float64(len(cellLines[i]))*lh
				offset := 0.0
				if extra > 0 {
					if c.VerticalAlign == "center" {
						offset = extra / 2
					} else if c.VerticalAlign == "bottom" {
						offset = extra
					}
				}
				for j, txt := range cellLines[i] {
					w.f.SetXY(x+left, w.y+padding.Top+offset+float64(j)*lh)
					align := "L"
					if cellFonts[i].Align == "center" {
						align = "C"
					} else if cellFonts[i].Align == "right" {
						align = "R"
					}
					w.drawText(x+left, w.y+padding.Top+offset+float64(j)*lh, cw-left-right, lh, txt, align, w.charSpacing)
				}
			}
			x += cw
		}
		w.y += height
		if row.Header && t.Borders && t.BorderStyle == "three-line" {
			w.f.SetDrawColor(0, 0, 0)
			w.f.SetLineWidth(.2)
			w.f.Line(tableX, w.y, tableX+width, w.y)
		}
	}
	if t.Borders && t.BorderStyle == "three-line" && t.Role != "repeat-header" {
		w.f.SetDrawColor(0, 0, 0)
		w.f.SetLineWidth(.4)
		w.f.Line(tableX, w.y, tableX+width, w.y)
	}
	return nil
}

func (w *pdfWriter) textWidth(text string) float64 {
	n := len([]rune(text))
	if n < 1 {
		return 0
	}
	return w.glyphsWidth(text) + float64(n-1)*w.charSpacing
}

const compactPunctuation = "，。；：！？、（）【】《》〈〉「」『』〔〕“”‘’"

func (w *pdfWriter) runeAdvance(r rune) (float64, float64) {
	width := w.f.GetStringWidth(string(r))
	if w.page.GridType != "linesAndChars" || !strings.ContainsRune(compactPunctuation, r) || width < .8*w.pointSize*25.4/72 {
		return width, 0
	}
	width /= 2
	shift := 0.0
	if face := fontMaps[w.faceName]; face != nil {
		if glyph, e := face.GlyphIndex(nil, r); e == nil {
			if b, _, e := face.GlyphBounds(nil, glyph, fixed.Int26_6(w.pointSize*64), font.HintingNone); e == nil {
				left := float64(b.Min.X) / 64 * 25.4 / 72
				right := float64(b.Max.X) / 64 * 25.4 / 72
				shift = (width-(right-left))/2 - left
			}
		}
	}
	return width, shift
}
func (w *pdfWriter) glyphsWidth(text string) float64 {
	width := 0.0
	for _, r := range text {
		advance, _ := w.runeAdvance(r)
		width += advance
	}
	return width
}
func (w *pdfWriter) drawText(x, y, width, height float64, text, align string, spacing float64) {
	if w.hiddenInk {
		return
	}
	n := len([]rune(text))
	actual := w.glyphsWidth(text) + float64(max(0, n-1))*spacing
	if align == "R" {
		x += width - actual
	} else if align == "C" {
		x += (width - actual) / 2
	}
	if !strings.ContainsAny(text, compactPunctuation) {
		w.f.RawWriteStr(fmt.Sprintf("BT %.5f Tc ET", spacing*72/25.4))
		w.f.SetXY(x, y)
		w.f.CellFormat(actual+.01, height, text, "", 0, "L", false, 0, "")
		return
	}
	w.f.RawWriteStr("BT 0 Tc ET")
	for _, r := range text {
		advance, shift := w.runeAdvance(r)
		w.f.SetXY(x+shift, y)
		w.f.CellFormat(advance, height, string(r), "", 0, "L", false, 0, "")
		x += advance + spacing
	}
}

func (w *pdfWriter) drawBorder(p Paragraph, x, y, width float64) {
	if p.HiddenInk {
		return
	}
	color := p.BorderColor
	if color == "" || color == "auto" {
		color = "000000"
	}
	n, _ := strconv.ParseUint(color, 16, 32)
	w.f.SetDrawColor(int(n>>16), int(n>>8&255), int(n&255))
	if strings.Contains(strings.ToLower(p.BorderStyle), "thick") {
		if strings.HasPrefix(strings.ToLower(p.BorderStyle), "thinthick") {
			w.f.SetLineWidth(.7)
			w.f.Line(x, y-1.1, x+width, y-1.1)
			w.f.SetLineWidth(.2)
			w.f.Line(x, y-.1, x+width, y-.1)
			return
		}
		w.f.SetLineWidth(.7)
		w.f.Line(x, y-.35, x+width, y-.35)
		w.f.SetLineWidth(.2)
		w.f.Line(x, y-1.1, x+width, y-1.1)
	} else {
		w.f.SetLineWidth(borderWidth(p))
		w.f.Line(x, y, x+width, y)
	}
}

func borderWidth(p Paragraph) float64 {
	if p.BorderWidth > 0 {
		return p.BorderWidth
	}
	return .4
}

func (w *pdfWriter) paragraphHeight(p Paragraph, limit int) float64 {
	w.setFont(p)
	line := p.Line
	if strings.TrimSpace(p.Text) != "" && line < p.Size*25.4/72*1.15 {
		line = p.Size * 25.4 / 72 * 1.3
	}
	indent := p.Indent - p.Hanging
	if p.Align == "center" || p.Align == "right" {
		indent = 0
	}
	n := len(w.wrapIndented(p.Prefix+p.Text, w.page.Width-w.page.Left-w.page.Right-p.LeftIndent-p.RightIndent, indent))
	if len(p.Tabs) > 0 {
		n = 1
	}
	if w.newDocument && limit == 2 && n == 3 {
		limit = 3
	}
	if limit > 0 && n > limit {
		n = limit
	}
	h := p.Before + p.After + line*float64(n)
	if p.BorderBottom {
		h += borderWidth(p)
	}
	return h
}

func (w *pdfWriter) tableRowHeight(row Row, widths []float64) float64 {
	h := row.Height
	col := 0
	for _, cell := range row.Cells {
		cw := 0.0
		for j := 0; j < cell.Span && col+j < len(widths); j++ {
			cw += widths[col+j]
		}
		col += cell.Span
		if len(cell.Paragraphs) == 0 {
			continue
		}
		p := cell.Paragraphs[0]
		if p.Size > 22 {
			p.Size = 22
		}
		texts := []string{}
		for _, q := range cell.Paragraphs {
			texts = append(texts, q.Prefix+q.Text)
		}
		p.Text = strings.Join(texts, "\n")
		w.setFont(p)
		padding := cell.padding()
		line := p.Line
		if line < p.Size*25.4/72*1.15 {
			line = p.Size * 25.4 / 72 * 1.4
		}
		n := len(w.wrap(p.Text, cw-padding.Left-padding.Right-p.LeftIndent-p.RightIndent))
		ch := float64(n)*line + padding.Top + padding.Bottom
		if ch > h {
			h = ch
		}
	}
	return h
}

func (w *pdfWriter) drawAnchored(anchored []Paragraph) error {
	if len(anchored) > 0 {
		height := 0.0
		for _, p := range anchored {
			w.setFont(p)
			line := p.Line
			if strings.TrimSpace(p.Text) != "" && line < p.Size*25.4/72*1.15 {
				line = p.Size * 25.4 / 72 * 1.3
			}
			lines := len(w.wrapIndented(p.Prefix+p.Text, w.page.Width-w.page.Left-w.page.Right-p.LeftIndent-p.RightIndent, p.Indent-p.Hanging))
			if len(p.Tabs) > 0 && !strings.Contains(p.Text, "\n") {
				lines = 1
			}
			height += p.Before + p.After + line*float64(lines)
			if p.BorderBottom {
				height += borderWidth(p)
			}
		}
		if e := w.room(height); e != nil {
			return e
		}
		w.y = w.page.Height - w.page.Bottom - height
		for _, p := range anchored {
			p.KeepNext = false
			if e := w.paragraph(p); e != nil {
				return e
			}
		}
	}
	return nil
}

func hexColor(color string) (int, int, int) {
	n, _ := strconv.ParseUint(color, 16, 32)
	return int(n >> 16), int(n >> 8 & 255), int(n & 255)
}
