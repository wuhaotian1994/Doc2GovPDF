package office

import (
	"bytes"
	"context"
	"fmt"
	"github.com/ledongthuc/pdf"
	"golang.org/x/image/font/sfnt"
	"io"
	"math"
	"regexp"
	"sort"
	"strings"
)

type PDFIssue struct {
	Page    int    `json:"page"`
	Rule    string `json:"rule"`
	Message string `json:"message"`
}
type PDFInspection struct {
	Pages     int        `json:"pages"`
	Fonts     []string   `json:"fonts"`
	Issues    []PDFIssue `json:"issues"`
	Unchecked []string   `json:"unchecked"`
}
type PDFInspectionRequest struct {
	Data  []byte   `json:"data"`
	Allow []string `json:"allow"`
}
type PDFInspectionReply struct {
	Result PDFInspection `json:"result"`
	Error  string        `json:"error,omitempty"`
}
type pdfLine struct {
	top, bottom float64
	text        string
	heading     bool
}

var pdfTitleFonts = []string{"方正小标宋", "FZXiaoBiaoSong", "FZXBS", "STSongti-SC-Black", "NotoSerifSC-Black", "Noto Serif SC Black"}
var pdfAllowedFonts = append(append([]string{}, pdfTitleFonts...), "FangSong", "仿宋", "SimHei", "黑体", "KaiTi", "楷体", "SimSun", "宋体", "NotoSerifSC", "Noto Serif SC")

func fontMatches(name string, list []string) bool {
	for _, v := range list {
		if strings.TrimSpace(v) != "" && strings.Contains(strings.ToLower(name), strings.ToLower(v)) {
			return true
		}
	}
	return false
}
func inheritedPDFValue(v pdf.Value, key string) pdf.Value {
	for i := 0; i < 12 && !v.IsNull(); i++ {
		if x := v.Key(key); !x.IsNull() {
			return x
		}
		v = v.Key("Parent")
	}
	return pdf.Value{}
}
func actualPDFFont(f pdf.Font) string {
	name := f.BaseFont()
	if i := strings.IndexByte(name, '+'); i >= 0 {
		name = name[i+1:]
	}
	if !strings.HasPrefix(name, "utf8f") {
		return name
	}
	v := f.V
	if descendant := v.Key("DescendantFonts"); descendant.Len() > 0 {
		v = descendant.Index(0)
	}
	stream := v.Key("FontDescriptor").Key("FontFile2")
	if stream.IsNull() {
		return name
	}
	r := stream.Reader()
	if r == nil {
		return name
	}
	defer r.Close()
	data, e := io.ReadAll(io.LimitReader(r, 32*1024*1024+1))
	if e != nil || len(data) > 32*1024*1024 {
		return name
	}
	face, e := sfnt.Parse(data)
	if e != nil {
		return name
	}
	family, _ := face.Name(nil, sfnt.NameIDFamily)
	sub, _ := face.Name(nil, sfnt.NameIDSubfamily)
	if family != "" {
		return strings.TrimSpace(family + " " + sub)
	}
	return name
}

// Run this parser in the bounded worker process for files supplied by users.
func InspectPDFBytes(ctx context.Context, data []byte, allow []string) (result PDFInspection, err error) {
	defer func() {
		if recover() != nil {
			err = fmt.Errorf("无法安全解析这个 PDF，请重新导出后核对")
		}
	}()
	result = PDFInspection{Fonts: []string{}, Issues: []PDFIssue{}, Unchecked: []string{"事实、内容真实性与扫描图像中的文字；字体识别不等于字体授权或完整格式认证"}}
	if len(data) > 32*1024*1024 || !bytes.HasPrefix(data, []byte("%PDF-")) {
		return result, fmt.Errorf("请选择不超过 32 MB 的有效 PDF")
	}
	reader, e := pdf.NewReader(bytes.NewReader(data), int64(len(data)))
	if e != nil {
		return result, fmt.Errorf("PDF 无法解析，可能已加密或损坏：%w", e)
	}
	result.Pages = reader.NumPage()
	if result.Pages < 1 || result.Pages > 100 {
		return result, fmt.Errorf("仅支持核对 1 至 100 页的 PDF")
	}
	allowed := append(append([]string{}, pdfAllowedFonts...), allow...)
	titleAllowed := append(append([]string{}, pdfTitleFonts...), allow...)
	fonts := map[string]bool{}
	resolved := map[string]string{}
	reported := map[string]bool{}
	add := func(page int, rule, msg string) {
		key := fmt.Sprint(page) + rule + msg
		if !reported[key] && len(result.Issues) < 200 {
			result.Issues = append(result.Issues, PDFIssue{page, rule, msg})
			reported[key] = true
		}
	}
	all := make([][]pdfLine, result.Pages)
	for i := 1; i <= result.Pages; i++ {
		if e := ctx.Err(); e != nil {
			return result, e
		}
		p := reader.Page(i)
		box := inheritedPDFValue(p.V, "MediaBox")
		height := box.Index(3).Float64() - box.Index(1).Float64()
		width := box.Index(2).Float64() - box.Index(0).Float64()
		if math.Abs(width-595.28) > 3 || math.Abs(height-841.89) > 3 {
			add(i, "pdf.paper", "页面不是 A4，请确认是否为特殊纸张。")
		}
		names := map[string]string{}
		for _, key := range p.Fonts() {
			f := p.Font(key)
			base := f.BaseFont()
			if n := strings.IndexByte(base, '+'); n >= 0 {
				base = base[n+1:]
			}
			cacheKey := f.V.String()
			actual := resolved[cacheKey]
			if actual == "" {
				actual = actualPDFFont(f)
				resolved[cacheKey] = actual
			}
			names[base] = actual
		}
		texts := p.Content().Text
		sort.SliceStable(texts, func(a, b int) bool {
			if math.Abs(texts[a].Y-texts[b].Y) > 1 {
				return texts[a].Y > texts[b].Y
			}
			return texts[a].X < texts[b].X
		})
		for _, s := range texts {
			if strings.TrimSpace(s.S) == "" {
				continue
			}
			font := names[s.Font]
			if font == "" {
				font = s.Font
			}
			fonts[font] = true
			if !fontMatches(font, allowed) {
				add(i, "pdf.font", "实际字体“"+font+"”不在公文常用字体范围，请核对是否发生替代。")
			} else if hasHan(s.S) && s.FontSize >= 21.5 && !fontMatches(font, titleAllowed) {
				add(i, "pdf.title-font", "标题或机关标志实际使用“"+font+"”，可能未使用指定小标宋字体。")
			}
			if s.X < -.5 || s.X > width+.5 || s.Y < -.5 || s.Y > height+.5 {
				add(i, "pdf.outside", "存在超出纸张的文字位置，请查看成品。")
			}
			top := height - s.Y - s.FontSize*.85
			bottom := height - s.Y + s.FontSize*.2
			if top < 70 || bottom > 800 {
				continue
			}
			heading := s.FontSize >= 15 && (fontMatches(font, pdfTitleFonts) || fontMatches(font, []string{"SimHei", "黑体", "KaiTi", "楷体"}))
			lines := all[i-1]
			if len(lines) > 0 && math.Abs(lines[len(lines)-1].bottom-bottom) < 2 {
				last := &lines[len(lines)-1]
				last.text += s.S
				if top < last.top {
					last.top = top
				}
			} else {
				lines = append(lines, pdfLine{top, bottom, s.S, heading})
			}
			all[i-1] = lines
		}
		if len(texts) == 0 {
			add(i, "pdf.unreadable", "本页没有可提取文字，可能是扫描图像或空白页，无法自动核验字形。")
		}
	}
	for i, lines := range all {
		bodyLines := lines[:0]
		for _, line := range lines {
			if !regexp.MustCompile(`^[—–-]\s*\d+\s*[—–-]$`).MatchString(strings.TrimSpace(line.text)) {
				bodyLines = append(bodyLines, line)
			}
		}
		all[i] = bodyLines
	}
	for i, lines := range all {
		if len(lines) == 0 {
			if i < len(all)-1 {
				add(i+1, "pdf.blank", "正文区域未识别到文字，请核对空白页或扫描内容。")
			}
			continue
		}
		last := lines[len(lines)-1]
		// Footers are excluded above; attachment marks/titles at a new page are legitimate.
		if i < len(all)-1 && last.heading {
			add(i+1, "pdf.orphan-heading", "“"+last.text+"”位于页底，正文可能被挤到下一页。")
		}
		if i+1 < len(all)-1 && last.bottom < 480 && len(all[i+1]) > 0 && !all[i+1][0].heading {
			add(i+1, "pdf.large-gap", "本页正文较早结束，下一页不是新章起始，请确认是否存在多余分页。")
		}
	}
	for name := range fonts {
		result.Fonts = append(result.Fonts, name)
	}
	sort.Strings(result.Fonts)
	return result, nil
}
