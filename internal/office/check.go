package office

import (
	"crypto/sha256"
	"doc2govpdf/internal/document"
	_ "embed"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
)

//go:embed data/yixingci.tsv
var variantData string

//go:embed data/style-words.tsv
var styleData string

type Finding struct {
	ID          string `json:"id"`
	ParagraphID string `json:"paragraphId"`
	Rule        string `json:"rule"`
	Severity    string `json:"severity"`
	Message     string `json:"message"`
	Original    string `json:"original"`
	Replacement string `json:"replacement,omitempty"`
	Basis       string `json:"basis"`
}
type Inspection struct {
	Digest    string    `json:"digest"`
	Version   string    `json:"version"`
	Issues    []Finding `json:"issues"`
	Unchecked []string  `json:"unchecked"`
}
type wordPair struct{ from, to string }

func wordPairs(data string, reverse bool) []wordPair {
	var out []wordPair
	for _, line := range strings.Split(data, "\n") {
		if strings.HasPrefix(line, "#") {
			continue
		}
		cols := strings.Split(strings.TrimSpace(line), "\t")
		if len(cols) < 4 || cols[3] != "strict" {
			continue
		}
		if reverse {
			for _, v := range strings.Split(cols[1], "｜") {
				out = append(out, wordPair{v, cols[0]})
			}
		} else {
			out = append(out, wordPair{cols[0], cols[1]})
		}
	}
	return out
}

var variants = wordPairs(variantData, true)
var styles = wordPairs(styleData, false)
var protectedSpan = regexp.MustCompile(`“[^”]*”|「[^」]*」|《[^》]*》|https?://[^\s，。；）]+|[\w.+-]+@[\w.-]+\.[A-Za-z]+`)

func editableOccurrence(text, needle string) int {
	spans := protectedSpan.FindAllStringIndex(text, -1)
	start := 0
	for {
		n := strings.Index(text[start:], needle)
		if n < 0 {
			return -1
		}
		n += start
		protected := false
		for _, span := range spans {
			if n < span[1] && n+len(needle) > span[0] {
				protected = true
				break
			}
		}
		if !protected {
			return n
		}
		start = n + len(needle)
		if start >= len(text) {
			return -1
		}
	}
}
func Inspect(m Model) (Inspection, error) {
	m = RenumberDocument(m)
	if e := m.Validate(); e != nil {
		return Inspection{}, e
	}
	r := Inspection{Digest: fmt.Sprintf("%x", sha256.Sum256([]byte(m.Text()))), Version: "0.2.0", Issues: []Finding{}, Unchecked: []string{"事实、政策含义、引用准确性与单位审批要求"}}
	corrections := map[string]map[string]string{}
	tableIDs := map[string]bool{}
	add := func(p *Paragraph, rule, severity, message, replacement, basis string) {
		if len(r.Issues) >= 500 {
			return
		}
		original := ""
		id := ""
		if p != nil {
			original = p.Text
			id = p.ID
			if corrections[id] == nil {
				corrections[id] = TextCorrections(*p)
			}
			if value := corrections[id][rule]; value != "" {
				replacement = value
			}
			if p.Protected {
				replacement = corrections[id][rule]
			}
			if p.Role == "agency" || tableIDs[id] {
				replacement = ""
			}
		}
		key := fmt.Sprintf("%s:%s:%s:%s", r.Digest, id, rule, message)
		if replacement != "" {
			for _, prior := range r.Issues {
				if prior.ParagraphID == id && prior.Rule == rule && prior.Replacement == replacement {
					return
				}
			}
		}
		hash := sha256.Sum256([]byte(key))
		r.Issues = append(r.Issues, Finding{ID: fmt.Sprintf("%x", hash[:12]), ParagraphID: id, Rule: rule, Severity: severity, Message: message, Original: original, Replacement: replacement, Basis: basis})
	}
	for _, b := range m.Blocks {
		if b.Table != nil {
			for _, row := range b.Table.Rows {
				for _, cell := range row.Cells {
					for _, p := range cell.Paragraphs {
						tableIDs[p.ID] = true
					}
				}
			}
		}
	}
	for _, p := range m.Paragraphs() {
		if p.Role == "attachment-body" && strings.TrimSpace(p.Text) == "" {
			add(p, "attachment.empty", "error", "这个附件页还没有内容，请填写后再导出。", "", "附件内容完整性")
		}
		if strings.TrimSpace(p.Text) == "" {
			continue
		}
		if p.Italic {
			add(p, "format.italic", "review", "这里使用了斜体，公文中的中文和数字通常应使用正体，可用“统一格式”调整。", "", "公文用字体例")
		}
		if !tableIDs[p.ID] {
			if basic, e := document.Check(p.Text); e == nil {
				for _, issue := range basic.Issues {
					replacement := ""
					if issue.Replacement != "" {
						lines := strings.Split(p.Text, "\n")
						if issue.Paragraph < len(lines) {
							lines[issue.Paragraph] = issue.Replacement
							replacement = strings.Join(lines, "\n")
						}
					}
					severity := "review"
					if issue.Rule == "date.invalid" {
						severity = "error"
					}
					add(p, issue.Rule, severity, issue.Message, replacement, "GB/T 9704—2012 7.2.5、7.3.5")
				}
			}
		}
		for _, pair := range variants {
			if n := editableOccurrence(p.Text, pair.from); n >= 0 {
				next := p.Text[:n] + pair.to + p.Text[n+len(pair.from):]
				add(p, "word.variant", "review", "“"+pair.from+"”建议写作“"+pair.to+"”；专有名称请保留原写法。", next, "GF 1001—2001 异形词表（上游 strict 词条）")
			}
		}
		for _, pair := range styles {
			if editableOccurrence(p.Text, pair.from) >= 0 {
				add(p, "style.word", "suggestion", "“"+pair.from+"”："+pair.to+"。请结合语境判断。", "", "编辑建议，不属于强制格式规则")
			}
		}
		if p.Role != "agency" && !tableIDs[p.ID] {
			for rule, next := range TextCorrections(*p) {
				duplicate := false
				for _, issue := range r.Issues {
					if issue.ParagraphID == p.ID && (issue.Rule == rule || issue.Replacement == next) {
						duplicate = true
						break
					}
				}
				if !duplicate {
					message, basis := correctionExplanation(rule)
					add(p, rule, "review", message, next, basis)
				}
			}
		}
		if !tableIDs[p.ID] && (p.Role == "body" || p.Role == "heading" || p.Role == "heading2") && math.Abs(p.Size-16) > .1 {
			add(p, "format.size", "review", "这一段字号不是三号（16 磅），请确认是否有特殊排版要求。", "", "GB/T 9704—2012 7.3.4")
		}
	}
	page := m.Page
	if math.Abs(page.Width-210) > 1 || math.Abs(page.Height-297) > 1 {
		add(nil, "format.page", "review", "纸张尺寸不是 A4，请核对原稿是否采用特殊纸张。", "", "GB/T 9704—2012 5.1")
	}
	if m.Template != "letter" && (math.Abs(page.Top-37) > .1 || math.Abs(page.Bottom-35) > .1 || math.Abs(page.Left-28) > .1 || math.Abs(page.Right-26) > .1) {
		add(nil, "format.margin", "review", "页边距与通用公文设置不同，请确认是否使用信函等特殊格式。", "", "GB/T 9704—2012 5.2")
	}
	checkTables(m, add)
	checkEnumeration(m, add)
	crossMetrics(m, add)
	checkTextConventions(m, tableIDs, add)
	checkTableConventions(m, add)
	if m.PDFUnsupported {
		r.Unchecked = append(r.Unchecked, "复杂对象及其 PDF 版面")
	}
	if len(r.Issues) >= 500 {
		r.Unchecked = append(r.Unchecked, "问题超过 500 条，其余问题请分段处理")
	}
	return r, nil
}

// Share the existing rule explanations when a proposed correction is found
// before the convention pass. Otherwise it would hide the actionable message.
func correctionExplanation(rule string) (string, string) {
	for _, c := range conventions {
		if c.id == rule {
			return c.message, c.basis
		}
	}
	switch rule {
	case "reference.format":
		return "若这是发文字号，请核对年份括号、序号中的“第”和前导零；编号或引用请保留。", "发文字号体例核对；不核实或改写文号事实"
	case "punctuation.half":
		return "中文语句中有半角标点，请对照建议写法核对；代码、网址和引用保留原样。", "中英文标点体例核对；受保护的引用与网址不自动替换"
	case "format.duplicate-number":
		return "这一段可能重复写入了层次编号，请对照原文与建议写法核对。", "段落结构校验"
	default:
		return "请对照原文与建议写法，核对是否需要调整。", "对应体例修正规则；引用、网址和数字事实仍需核对"
	}
}
func hasHan(s string) bool {
	for _, r := range s {
		if r >= '\u4e00' && r <= '\u9fff' {
			return true
		}
	}
	return false
}

type addFinding func(*Paragraph, string, string, string, string, string)

var numeric = regexp.MustCompile(`^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?[%％]?$`)

func parseNumber(s string) (float64, bool, bool) {
	s = strings.TrimSpace(s)
	if !numeric.MatchString(s) {
		return 0, false, false
	}
	percent := strings.HasSuffix(s, "%") || strings.HasSuffix(s, "％")
	s = strings.TrimSuffix(strings.TrimSuffix(s, "%"), "％")
	v, e := strconv.ParseFloat(strings.ReplaceAll(s, ",", ""), 64)
	return v, percent, e == nil
}
func cellText(c Cell) string {
	var s []string
	for _, p := range c.Paragraphs {
		s = append(s, p.Text)
	}
	return strings.TrimSpace(strings.Join(s, " "))
}
func totalLabel(s string) bool {
	s = strings.Join(strings.Fields(s), "")
	return s == "合计" || s == "总计" || s == "小计"
}
func ApplyFinding(m Model, id string) (Model, error) {
	r, e := Inspect(m)
	if e != nil {
		return m, e
	}
	for _, f := range r.Issues {
		if f.ID == id && f.Replacement != "" {
			m = m.Clone()
			for _, p := range m.Paragraphs() {
				if p.ID == f.ParagraphID && (!p.Protected || TextCorrections(*p)[f.Rule] == f.Replacement) {
					if p.Protected {
						ranges, e := rebaseEditableRanges(*p, f.Replacement)
						if e != nil {
							return m, e
						}
						p.EditableRanges = ranges
					}
					p.Text = f.Replacement
					return m, nil
				}
			}
		}
	}
	return m, fmt.Errorf("此问题已变化或必须人工核对，请重新检查")
}
