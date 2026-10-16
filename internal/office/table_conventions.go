package office

import (
	"fmt"
	"regexp"
	"strings"
)

var modelCode = regexp.MustCompile(`\b[A-Z]{1,5}-?\d[\w-]*`)
var upperWord = regexp.MustCompile(`[A-Z]{2,}`)
var numericCellWord = regexp.MustCompile(`[0-9]`)

func checkTableConventions(m Model, add addFinding) {
	for _, b := range m.Blocks {
		if b.Table == nil || len(b.Table.Rows) < 2 || !b.Table.Rows[0].Header {
			continue
		}
		rows := b.Table.Rows
		head := expandedCells(rows[0])
		for _, c := range head {
			if upperWord.MatchString(modelCode.ReplaceAllString(numericText(c), "")) {
				add(cellFinding(c), "table.header-language", "review", "表头含英文词，请确认是否应使用中文名称；型号、专业符号可按要求保留。", "", "对应上游表头语言检查，不自动改动专业术语")
			}
		}
		for ci := range head {
			first := expandedCells(rows[1])
			if ci >= len(first) || first[ci] == nil || len(first[ci].Paragraphs) == 0 || first[ci].Paragraphs[0].Align != "right" {
				continue
			}
			total, prose := 0, 0
			var example *Paragraph
			for _, r := range rows[1:] {
				cells := expandedCells(r)
				if ci >= len(cells) {
					continue
				}
				text := numericText(cells[ci])
				if text == "" {
					continue
				}
				total++
				if !numericCellWord.MatchString(text) || strings.ContainsAny(text, "，、；。") {
					prose++
					example = cellFinding(cells[ci])
				}
			}
			if total > 0 && prose*2 > total {
				add(example, "table.numeric-alignment", "review", fmt.Sprintf("右对齐的第 %d 列有 %d/%d 格是叙述文字，请确认是否误选了数值列。", ci+1, prose, total), "", "上游数值列口径检查")
			}
		}
	}
	for _, p := range m.Paragraphs() {
		if regexp.MustCompile(`utm_source=(chatgpt|copilot)\.com`).MatchString(p.Text) {
			add(p, "style.tool-tracking", "suggestion", "链接带有工具来源跟踪参数，请核对是否需要在正式文件中保留。", "", "上游工具指纹检查，仅提示，不自动改写网址")
		}
	}
}
