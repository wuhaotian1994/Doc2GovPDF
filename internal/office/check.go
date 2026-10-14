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
var protectedSpan = regexp.MustCompile(`“[^”]*”|「[^」]*」|《[^》]*》|https?://\S+|[\w.+-]+@[\w.-]+\.[A-Za-z]+`)

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
	if e := m.Validate(); e != nil {
		return Inspection{}, e
	}
	r := Inspection{Digest: fmt.Sprintf("%x", sha256.Sum256([]byte(m.Text()))), Version: "0.2.0", Issues: []Finding{}, Unchecked: []string{"事实、政策含义、引用准确性与单位审批要求"}}
	add := func(p *Paragraph, rule, severity, message, replacement, basis string) {
		if len(r.Issues) >= 500 {
			return
		}
		original := ""
		id := ""
		if p != nil {
			original = p.Text
			id = p.ID
			if p.Protected {
				replacement = ""
			}
		}
		key := fmt.Sprintf("%s:%s:%s:%s", r.Digest, id, rule, message)
		hash := sha256.Sum256([]byte(key))
		r.Issues = append(r.Issues, Finding{ID: fmt.Sprintf("%x", hash[:12]), ParagraphID: id, Rule: rule, Severity: severity, Message: message, Original: original, Replacement: replacement, Basis: basis})
	}
	tableIDs := map[string]bool{}
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
		if p.Protected {
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
		for _, pair := range []wordPair{{",", "，"}, {";", "；"}, {":", "："}, {"(", "（"}, {")", "）"}} {
			if n := editableOccurrence(p.Text, pair.from); n >= 0 && hasHan(p.Text) {
				before, after := byte(0), byte(0)
				if n > 0 {
					before = p.Text[n-1]
				}
				if n+1 < len(p.Text) {
					after = p.Text[n+1]
				}
				if before >= '0' && before <= '9' && after >= '0' && after <= '9' {
					continue
				}
				if strings.Contains(p.Text, "http") {
					continue
				}
				add(p, "punctuation.half", "review", "中文段落中出现半角标点，请确认此处是否应使用全角。", p.Text[:n]+pair.to+p.Text[n+1:], "GB/T 15834—2011，需结合语言环境")
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
	if m.Template != "letter" && (math.Abs(page.Top-37) > 1 || math.Abs(page.Left-28) > 1) {
		add(nil, "format.margin", "review", "页边距与通用公文设置不同，请确认是否使用信函等特殊格式。", "", "GB/T 9704—2012 5.2")
	}
	checkTables(m, add)
	checkEnumeration(m, add)
	crossMetrics(m, add)
	checkTextConventions(m, tableIDs, add)
	if m.PDFUnsupported {
		r.Unchecked = append(r.Unchecked, "复杂对象及其 PDF 版面")
	}
	if len(r.Issues) >= 500 {
		r.Unchecked = append(r.Unchecked, "问题超过 500 条，其余问题请分段处理")
	}
	return r, nil
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
	s = strings.ReplaceAll(s, " ", "")
	return s == "合计" || s == "总计" || s == "小计"
}
func checkTables(m Model, add addFinding) {
	for ti, b := range m.Blocks {
		if b.Table == nil || len(b.Table.Rows) < 3 {
			continue
		}
		rows := b.Table.Rows
		for ri, row := range rows {
			if len(row.Cells) < 2 || !totalLabel(cellText(row.Cells[0])) {
				continue
			}
			for ci := 1; ci < len(row.Cells); ci++ {
				expected, pct, ok := parseNumber(cellText(row.Cells[ci]))
				if !ok || len(row.Cells[ci].Paragraphs) == 0 {
					continue
				}
				sum := 0.0
				n := 0
				ambiguous := false
				for k := 1; k < ri; k++ {
					if len(rows[k].Cells) != len(row.Cells) || totalLabel(cellText(rows[k].Cells[0])) {
						ambiguous = true
						break
					}
					v, vpct, ok := parseNumber(cellText(rows[k].Cells[ci]))
					if !ok || vpct != pct || rows[k].Cells[ci].Span != 1 || rows[k].Cells[ci].Merge != "" {
						ambiguous = true
						break
					}
					sum += v
					n++
				}
				if ambiguous || n < 1 {
					continue
				}
				if math.Abs(sum-expected) > .005 {
					p := &row.Cells[ci].Paragraphs[0]
					add(p, "number.table-total", "review", fmt.Sprintf("表格 %d 的合计为 %g，已列分项相加为 %g。请核对统计范围与原始数字。", ti+1, expected, sum), "", "数字自洽校验；数值不自动修改")
				}
				if pct && math.Abs(sum-100) > .5 {
					p := &row.Cells[ci].Paragraphs[0]
					add(p, "number.percentage", "review", fmt.Sprintf("已列占比合计为 %g%%。若这些项目构成完整总体，应核对是否为 100%%；部分列举可忽略。", sum), "", "完整构成条件下的百分比检查")
				}
			}
		}
		// Row totals are only compared when an explicit total column exists.
		if len(rows) > 2 {
			header := rows[0]
			for ci, c := range header.Cells {
				if ci < 2 || !totalLabel(cellText(c)) {
					continue
				}
				for ri := 1; ri < len(rows); ri++ {
					row := rows[ri]
					if len(row.Cells) <= ci || totalLabel(cellText(row.Cells[0])) {
						continue
					}
					total, _, ok := parseNumber(cellText(row.Cells[ci]))
					if !ok {
						continue
					}
					sum := 0.0
					valid := true
					for j := 1; j < ci; j++ {
						v, pct, ok := parseNumber(cellText(row.Cells[j]))
						if !ok || pct {
							valid = false
							break
						}
						sum += v
					}
					if valid && math.Abs(sum-total) > .005 && len(row.Cells[ci].Paragraphs) > 0 {
						add(&row.Cells[ci].Paragraphs[0], "number.row-total", "review", fmt.Sprintf("这一行合计为 %g，分项相加为 %g，请核对统计口径。", total, sum), "", "数字自洽校验")
					}
				}
			}
		}
	}
}

var countIntro = regexp.MustCompile(`(?:以下|如下|包括|做了)([一二三四五六七八九十\d]+)(?:个方面|个?事项|项|点|方面)`)

func headingLevel(p *Paragraph) int {
	text := p.Prefix + p.Text
	if h1.MatchString(text) || p.Role == "heading" {
		return 1
	}
	if h2.MatchString(text) || p.Role == "heading2" {
		return 2
	}
	if strings.HasPrefix(text, "（") && strings.Contains(text, "）") {
		return 4
	}
	if p.Role == "subheading" {
		return 3
	}
	return 0
}
func checkEnumeration(m Model, add addFinding) {
	var ps []*Paragraph
	for _, b := range m.Blocks {
		if b.Paragraph != nil {
			ps = append(ps, b.Paragraph)
		}
	}
	for i, p := range ps {
		match := countIntro.FindStringSubmatch(p.Text)
		if match == nil || editableOccurrence(p.Text, match[0]) < 0 {
			continue
		}
		want, e := strconv.Atoi(match[1])
		if e != nil {
			for n := 1; n <= 99; n++ {
				if chinese(n) == match[1] {
					want = n
					break
				}
			}
		}
		if want <= 0 || want > 100 {
			continue
		}
		level, count := 0, 0
		complete := false
		for j := i + 1; j < len(ps) && j < i+401; j++ {
			q := ps[j]
			if q.Role == "signature" || q.Role == "date" || q.Role == "imprint" || q.Role == "roster" || q.PageBreak {
				complete = true
				break
			}
			current := headingLevel(q)
			if current > 0 {
				if level == 0 {
					level = current
				}
				if current < level {
					complete = true
					break
				}
				if current == level {
					count++
				}
			}
			if j == len(ps)-1 {
				complete = true
			}
		}
		if complete && count > 0 && count != want {
			add(p, "number.enumeration", "review", fmt.Sprintf("这里写了“%s”，对应层级识别到 %d 个事项，请核对是否完整。", match[0], count), "", "列举结构检查，遇到未能完整识别的结构不作确定结论")
		}
	}
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
				if p.ID == f.ParagraphID && !p.Protected {
					p.Text = f.Replacement
					return m, nil
				}
			}
		}
	}
	return m, fmt.Errorf("此问题已变化或必须人工核对，请重新检查")
}
