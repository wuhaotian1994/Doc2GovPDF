package office

import (
	"fmt"
	"math"
	"regexp"
	"strings"
)

var metricPattern = regexp.MustCompile(`([\p{Han}A-Za-z]{2,18}?)(?:为|达到|达|共计|合计|共有|共|约为)\s*(-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?)\s*(万亿元|亿元|万元|元|万人|平方米|公里|人|名|个|项|家|亩|吨|台|套|%|％)`)
var yearPattern = regexp.MustCompile(`(?:19|20)\d{2}\s*年`)
var metricChange = regexp.MustCompile(`(?:分别|变更|调整|改|成|增加|减少|增至|降至|提高|降低|上升|下降|增长|扩大|缩减)$`)
var vagueMetric = regexp.MustCompile(`^(其中|合计|总计|共|约|(年均)?(复合)?(增长率|增速|增幅|占比|比例|比重|规模|市场规模|同比增长|环比增长|毛利率|净利率))$`)
var metricTail = regexp.MustCompile(`(?:约|累计|预计将|预计|将|已)$`)
var tableMetricPrefix = regexp.MustCompile(`^(全年|本年度?|当年|年度|累计|实现|全市|全省|全区|全县|全国)*$`)
var headerUnit = regexp.MustCompile(`[（(]([^）)]+)[）)]`)

type metricValue struct {
	value     float64
	paragraph *Paragraph
	unit, raw string
	table     int
}

func unitValue(value float64, unit string) (float64, string) {
	switch unit {
	case "万亿元":
		return value * 1e12, "元"
	case "亿元":
		return value * 1e8, "元"
	case "万元":
		return value * 1e4, "元"
	case "万人":
		return value * 1e4, "人"
	case "％":
		return value, "%"
	}
	return value, unit
}
func noWhitespace(s string) string { return strings.Join(strings.Fields(s), "") }
func crossMetrics(m Model, add addFinding) {
	type unitTable struct {
		unit, period string
		values       map[string]metricValue
	}
	var unitTables []unitTable
	tables := map[string]metricValue{}
	for ti, b := range m.Blocks {
		if b.Table == nil || len(b.Table.Rows) < 2 {
			continue
		}
		rows := b.Table.Rows
		head := expandedCells(rows[0])
		headers := []string{}
		for _, c := range head {
			headers = append(headers, numericText(c))
		}
		header := strings.Join(headers, "|")
		u := headerUnit.FindStringSubmatch(header)
		table := unitTable{values: map[string]metricValue{}}
		if len(u) > 1 {
			table.unit = strings.TrimSpace(u[1])
		}
		table.period = noWhitespace(yearPattern.FindString(header))
		for _, r := range rows[1:] {
			cells := expandedCells(r)
			if len(cells) < 2 {
				continue
			}
			label := numericText(cells[0])
			if label == "" {
				continue
			}
			for ci := 1; ci < len(cells); ci++ {
				v, _, ok := parseNumber(numericText(cells[ci]))
				if !ok {
					continue
				}
				p := cellFinding(cells[ci])
				if p == nil {
					continue
				}
				if len(head) == 2 && len(cells) == 2 && table.unit != "" {
					table.values[label] = metricValue{value: v, paragraph: p, raw: numericText(cells[ci])}
				}
				if !rows[0].Header || totalLabel(label) || len([]rune(label)) < 2 || !hasHan(label) {
					continue
				}
				key := header + "|" + label + "|" + fmt.Sprint(ci)
				if prior, ok := tables[key]; ok && prior.table != ti && math.Abs(prior.value-v) > .005 {
					add(p, "number.cross-table", "review", fmt.Sprintf("同名表头下的“%s”在另一表为 %s，此处为 %s。请确认时期与口径。", label, prior.raw, numericText(cells[ci])), "", "跨表同名指标核对；不自动改数")
				}
				if _, ok := tables[key]; !ok {
					tables[key] = metricValue{value: v, paragraph: p, raw: numericText(cells[ci]), table: ti}
				}
			}
		}
		if len(table.values) > 0 {
			unitTables = append(unitTables, table)
		}
	}
	seen := map[string]metricValue{}
	reported := map[string]bool{}
	for _, b := range m.Blocks {
		p := b.Paragraph
		if p == nil || headingLevel(p) > 0 {
			continue
		}
		for _, sentence := range strings.FieldsFunc(p.Text, func(r rune) bool { return strings.ContainsRune("。；！？", r) }) {
			for _, loc := range metricPattern.FindAllStringSubmatchIndex(sentence, -1) {
				match := sentence[loc[0]:loc[1]]
				if editableOccurrence(p.Text, match) < 0 {
					continue
				}
				raw := strings.TrimLeft(sentence[loc[2]:loc[3]], "年月日")
				if metricChange.MatchString(raw) || strings.ContainsAny(raw, "万亿元%％") {
					continue
				}
				core := metricTail.ReplaceAllString(raw, "")
				if len([]rune(core)) < 2 || vagueMetric.MatchString(core) {
					continue
				}
				before := sentence[:loc[0]]
				years := yearPattern.FindAllString(before, -1)
				period := ""
				if len(years) > 0 {
					period = noWhitespace(years[len(years)-1])
				}
				clauses := strings.FieldsFunc(before, func(r rune) bool { return strings.ContainsRune("，、：；（）", r) })
				clause := ""
				if len(clauses) > 0 {
					clause = clauses[len(clauses)-1]
				}
				for _, sep := range []string{"，", "、", "：", "；", "（", "）"} {
					if strings.HasSuffix(before, sep) {
						clause = ""
					}
				}
				label := noWhitespace(yearPattern.ReplaceAllString(clause, "")) + core
				number := sentence[loc[4]:loc[5]]
				unit := sentence[loc[6]:loc[7]]
				v, _, ok := parseNumber(number)
				if !ok {
					continue
				}
				value, normalizedUnit := unitValue(v, unit)
				key := label + "|" + normalizedUnit + "|" + period
				if prior, ok := seen[key]; ok && math.Abs(prior.value-value) > .005 {
					add(p, "number.repeated-metric", "review", fmt.Sprintf("“%s”%s在正文另一处为 %s，此处为 %s%s。请核对原始数据。", label, period, prior.raw, number, unit), "", "同主语、同年份与同单位的指标核对")
				}
				if _, ok := seen[key]; !ok {
					seen[key] = metricValue{value: value, paragraph: p, raw: number + unit}
				}
				for _, t := range unitTables {
					if period != "" && t.period != "" && period != t.period {
						continue
					}
					for tl, tv := range t.values {
						if len([]rune(tl)) < 2 || !strings.HasSuffix(label, tl) || !tableMetricPrefix.MatchString(strings.TrimSuffix(label, tl)) {
							continue
						}
						tableValue, tableUnit := unitValue(tv.value, t.unit)
						if tableUnit != normalizedUnit {
							continue
						}
						rk := p.ID + "|" + tl + "|" + tv.raw
						if math.Abs(value-tableValue) > math.Max(.02, .005*math.Abs(tableValue)) && !reported[rk] {
							add(p, "number.text-table", "review", fmt.Sprintf("“%s”正文为 %s%s，表格为 %s%s。请核对年份、范围与原始数字。", tl, number, unit, tv.raw, t.unit), "", "正文与单值列、明确单位的同名表格指标核对，仅提示")
							reported[rk] = true
						}
					}
				}
			}
		}
	}
}
