package office

// Behavioral port of gongwen-kit check-num.js (MIT, HUANGHE 2026).
// Findings stay human-reviewable: amounts are never silently rewritten.
import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
)

var rateSuffix = regexp.MustCompile(`(?:率|增速|增幅|单价|均价|倍数)$`)
var trailingUnit = regexp.MustCompile(`[（(][^（()）]*[）)]\s*$`)

func rateLabel(s string) bool {
	s = strings.TrimSpace(trailingUnit.ReplaceAllString(s, ""))
	return rateSuffix.MatchString(s) || strings.HasPrefix(s, "平均")
}
func rateColumn(s string) bool {
	return rateLabel(s) && !regexp.MustCompile(`占比|比例|比重|构成`).MatchString(s)
}
func expandedCells(row Row) []*Cell {
	var cells []*Cell
	for i := range row.Cells {
		c := &row.Cells[i]
		if c.Merge == "continue" {
			cells = append(cells, nil)
		} else {
			cells = append(cells, c)
		}
		for j := 1; j < c.Span; j++ {
			cells = append(cells, nil)
		}
	}
	return cells
}
func cellAt(rows [][]*Cell, r, c int) *Cell {
	if r < 0 || r >= len(rows) || c < 0 || c >= len(rows[r]) {
		return nil
	}
	return rows[r][c]
}
func numericText(c *Cell) string {
	if c == nil {
		return ""
	}
	return cellText(*c)
}
func cellFinding(c *Cell) *Paragraph {
	if c == nil || len(c.Paragraphs) == 0 {
		return nil
	}
	return &c.Paragraphs[0]
}
func rowTotalLabel(row []*Cell) (int, string) {
	for i, c := range row {
		if s := numericText(c); totalLabel(s) {
			return i, strings.Join(strings.Fields(s), "")
		}
	}
	return -1, ""
}
func rateRow(row []*Cell) bool {
	for _, c := range row {
		s := numericText(c)
		if _, _, ok := parseNumber(s); !ok && rateLabel(s) {
			return true
		}
	}
	return false
}
func checkTables(m Model, add addFinding) {
	ti := 0
	for _, block := range m.Blocks {
		if block.Table == nil {
			continue
		}
		ti++
		t := block.Table
		if len(t.Rows) < 2 {
			continue
		}
		rows := make([][]*Cell, len(t.Rows))
		for i, r := range t.Rows {
			rows[i] = expandedCells(r)
		}
		declared := t.Rows[0].Header
		first := 1
		if !declared {
			for _, c := range rows[0] {
				if _, _, ok := parseNumber(numericText(c)); ok {
					first = 0
					break
				}
			}
		}
		for ri, row := range rows {
			li, label := rowTotalLabel(row)
			if ri < first || li < 0 {
				continue
			}
			from := ri - 1
			for from >= first {
				_, prior := rowTotalLabel(rows[from])
				if prior != "" && (label == "小计" || prior != "小计") {
					break
				}
				from--
			}
			var segment, subs []int
			for k := from + 1; k < ri; k++ {
				if rateRow(rows[k]) {
					continue
				}
				_, prior := rowTotalLabel(rows[k])
				segment = append(segment, k)
				if prior == "小计" {
					subs = append(subs, k)
				}
			}
			if label != "小计" {
				if len(subs) > 0 {
					segment = subs
				} else {
					var clean []int
					for _, k := range segment {
						if _, l := rowTotalLabel(rows[k]); l == "" {
							clean = append(clean, k)
						}
					}
					segment = clean
				}
			}
			if len(segment) == 0 {
				for k := ri + 1; k < len(rows); k++ {
					if _, l := rowTotalLabel(rows[k]); l != "" {
						break
					}
					if !rateRow(rows[k]) {
						segment = append(segment, k)
					}
				}
			}
			for ci, c := range row {
				if ci == li || rateColumn(numericText(cellAt(rows, 0, ci))) {
					continue
				}
				want, pct, ok := parseNumber(numericText(c))
				if !ok {
					continue
				}
				sum, n, clean := 0.0, 0, true
				for _, k := range segment {
					v, pc, ok := parseNumber(numericText(cellAt(rows, k, ci)))
					if !ok {
						clean = false
						break
					}
					if pc && !pct {
						continue
					}
					sum += v
					n++
				}
				minimum := 1
				if !declared {
					minimum = 2
				}
				if !clean || n < minimum {
					continue
				}
				if math.Abs(sum-want) > .005 {
					add(cellFinding(c), "number.table-total", "review", fmt.Sprintf("表格 %d 的%s为 %g，当前分段的 %d 个分项相加为 %g。请核对统计范围与原始数字。", ti, label, want, n, sum), "", "分段数字自洽核对，未声明表头的表仅提示；不自动修改数字")
				} else if pct && math.Abs(sum-100) > .5 {
					add(cellFinding(c), "number.percentage", "review", fmt.Sprintf("当前占比合计为 %g%%，分项之和与合计一致。若这里只列部分构成，可保留。", sum), "", "部分构成不必达到 100%，请核对口径")
				}
			}
		}
		for ci, h := range rows[0] {
			if !totalLabel(numericText(h)) {
				continue
			}
			mixed := false
			for j, c := range rows[0] {
				if j > 0 && j != ci && rateColumn(numericText(c)) {
					mixed = true
				}
			}
			if mixed {
				continue
			}
			for ri := 1; ri < len(rows); ri++ {
				label := numericText(cellAt(rows, ri, 0))
				if totalLabel(label) || rateLabel(label) || regexp.MustCompile(`余额|期初|期末|累计`).MatchString(label) {
					continue
				}
				c := cellAt(rows, ri, ci)
				want, pct, ok := parseNumber(numericText(c))
				if !ok {
					continue
				}
				sum, n, clean := 0.0, 0, true
				for j := 1; j < len(rows[0]); j++ {
					if j == ci {
						continue
					}
					v, pc, ok := parseNumber(numericText(cellAt(rows, ri, j)))
					if !ok || pc != pct {
						clean = false
						break
					}
					sum += v
					n++
				}
				if clean && n > 0 && math.Abs(sum-want) > .005 {
					add(cellFinding(c), "number.row-total", "review", fmt.Sprintf("这一行合计为 %g，其余分项列相加为 %g，请核对统计口径。", want, sum), "", "合计列检查，跳过比率与余额类行")
				}
			}
		}
	}
}

var countIntro = regexp.MustCompile(`(?:以下|如下|下列|包括|做了)([一二两三四五六七八九十\d]+)(?:个)?(?:方面|事项|项工作|项|点|条|类|件事|问题)`)
var inlineEnumeration = regexp.MustCompile(`(?:^|[，。；：、\s])([一二三四五六七八九十]{1,3})是`)

func countNumber(s string) int {
	if s == "两" {
		return 2
	}
	if n, e := strconv.Atoi(s); e == nil {
		return n
	}
	for n := 1; n < 100; n++ {
		if chinese(n) == s {
			return n
		}
	}
	return 0
}
func headingLevel(p *Paragraph) int {
	if p.OutlineLevel > 0 {
		return p.OutlineLevel
	}
	text := p.Prefix + p.Text
	if h1.MatchString(text) || p.Role == "heading" {
		return 1
	}
	if h2.MatchString(text) || p.Role == "heading2" {
		return 2
	}
	if p.Role == "subheading" {
		if strings.HasPrefix(text, "（") {
			return 4
		}
		return 3
	}
	return 0
}
func checkEnumeration(m Model, add addFinding) {
	var ps []*Paragraph
	for _, b := range m.Blocks {
		if b.Paragraph != nil && strings.TrimSpace(b.Paragraph.Text) != "" {
			ps = append(ps, b.Paragraph)
		}
	}
	section := 0
	for i, p := range ps {
		if lv := headingLevel(p); lv > 0 {
			section = lv
			continue
		}
		loc := countIntro.FindStringSubmatchIndex(p.Text)
		if loc == nil || editableOccurrence(p.Text, p.Text[loc[0]:loc[1]]) < 0 {
			continue
		}
		intro := p.Text[loc[0]:loc[1]]
		want := countNumber(p.Text[loc[2]:loc[3]])
		if want < 1 {
			continue
		}
		inline := p.Text[loc[1]:]
		marks := inlineEnumeration.FindAllStringSubmatch(inline, -1)
		if len(marks) == 0 && i+1 < len(ps) && headingLevel(ps[i+1]) == 0 {
			marks = inlineEnumeration.FindAllStringSubmatch(ps[i+1].Text, -1)
		}
		count := 0
		if len(marks) >= 2 && countNumber(marks[0][1]) == 1 {
			seen := map[int]bool{}
			for _, mark := range marks {
				seen[countNumber(mark[1])] = true
			}
			for seen[count+1] {
				count++
			}
		} else {
			if section == 0 {
				continue
			}
			for j := i + 1; j < len(ps); j++ {
				lv := headingLevel(ps[j])
				if lv > 0 && lv <= section {
					break
				}
				if lv == section+1 {
					count++
				}
			}
		}
		if count > 0 && count != want {
			add(p, "number.enumeration", "review", fmt.Sprintf("这里写了“%s”，相应列举识别到 %d 项，请核对是否完整。", intro, count), "", "章节下一级标题或连续行内列举核对；数字不自动修改")
		}
	}
}
