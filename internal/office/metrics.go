package office

import (
	"fmt"
	"math"
	"regexp"
	"strings"
)

var metricPattern = regexp.MustCompile(`([\p{Han}]{2,18})(?:为|达到|达|共|约为)\s*([0-9][0-9,.]*)\s*(亿元|万元|元|万人|人|个|项|台|%|％)`)
var yearPattern = regexp.MustCompile(`(?:19|20)\d{2}年`)

type metricValue struct {
	value     float64
	paragraph *Paragraph
	unit      string
	raw       string
}

func unitValue(value float64, unit string) (float64, string) {
	switch unit {
	case "万元":
		return value * 10000, "元"
	case "亿元":
		return value * 100000000, "元"
	case "万人":
		return value * 10000, "人"
	case "％":
		return value, "%"
	}
	return value, unit
}
func crossMetrics(m Model, add addFinding) {
	seen := map[string]metricValue{}
	for _, block := range m.Blocks {
		if block.Paragraph == nil || block.Paragraph.Protected {
			continue
		}
		p := block.Paragraph
		for _, sentence := range strings.FieldsFunc(p.Text, func(r rune) bool { return r == '。' || r == '；' || r == ';' }) {
			years := yearPattern.FindAllString(sentence, -1)
			if len(years) > 1 {
				continue
			}
			period := ""
			if len(years) == 1 {
				period = years[0]
			}
			for _, match := range metricPattern.FindAllStringSubmatch(sentence, -1) {
				if editableOccurrence(p.Text, match[0]) < 0 {
					continue
				}
				v, _, ok := parseNumber(match[2])
				if !ok {
					continue
				}
				v, unit := unitValue(v, match[3])
				key := match[1] + "|" + unit + "|" + period
				if previous, ok := seen[key]; ok && math.Abs(previous.value-v) > .005 {
					add(p, "number.repeated-metric", "review", fmt.Sprintf("“%s”在正文另一处为 %s，此处为 %s%s。请核对时间和统计口径。", match[1], previous.raw, match[2], match[3]), "", "同名指标匹配，仅提示，不自动修改")
				}
				seen[key] = metricValue{v, p, unit, match[2] + match[3]}
			}
		}
	}
	tables := map[string]metricValue{}
	for _, block := range m.Blocks {
		if block.Table == nil || len(block.Table.Rows) < 2 {
			continue
		}
		rows := block.Table.Rows
		head := rows[0]
		if !head.Header {
			continue
		}
		header := []string{}
		for _, c := range head.Cells {
			header = append(header, cellText(c))
		}
		for _, row := range rows[1:] {
			if len(row.Cells) != len(head.Cells) || len(row.Cells) < 2 {
				continue
			}
			label := cellText(row.Cells[0])
			if label == "" || totalLabel(label) {
				continue
			}
			for ci := 1; ci < len(row.Cells); ci++ {
				cell := row.Cells[ci]
				if cell.Span != 1 || cell.Merge != "" || len(cell.Paragraphs) == 0 {
					continue
				}
				v, _, ok := parseNumber(cellText(cell))
				if !ok {
					continue
				}
				key := strings.Join(header, "|") + "|" + label + "|" + fmt.Sprint(ci)
				if prior, ok := tables[key]; ok && math.Abs(v-prior.value) > .005 {
					add(&cell.Paragraphs[0], "number.cross-table", "review", fmt.Sprintf("同名表头下的“%s”在另一表为 %s，此处为 %s。请确认是否属于同一时期、同一口径。", label, prior.raw, cellText(cell)), "", "跨表标签匹配，仅提示，不自动修改")
				}
				tables[key] = metricValue{value: v, paragraph: &cell.Paragraphs[0], raw: cellText(cell)}
			}
		}
	}
}
