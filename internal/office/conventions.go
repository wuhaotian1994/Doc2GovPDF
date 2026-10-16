package office

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

type convention struct{ id, pattern, message, basis, severity string }

var conventions = []convention{
	{"number.unit-space", `[0-9](?:mAh/g|GWh|kWh|MWh|kg|kW|MW|mm|cm|km|ppm|t/h|g/cm|Wh)`, "数值与物理单位之间通常应留空格，请核对是否属于型号或代码。", "数字与计量单位书写规范", "review"},
	{"number.range-unit", `[0-9]+(?:\.[0-9]+)?\s*[~～—–－-]\s*[0-9]+(?:\.[0-9]+)?\s*(?:%|％|万元|亿元|万|亿)`, "范围前一数值可能缺少单位，例如 15%～30%。请核对语义后修改。", "GB/T 15835—2011 5.1.3", "review"},
	{"number.bare-decimal", `(?:^|[^0-9A-Za-z_.])\.[0-9]+`, "纯小数的小数点前应有 0；留空待填或编号请保留。", "GB/T 15835—2011 5.1.2", "review"},
	{"number.short-year", `[0-9]{2}\s*年(?:初|中|底|末|上半年|下半年)`, "这里可能使用了两位年份，请核对是否需要写完整年份。", "GB/T 15835—2011 5.1.4", "review"},
	{"number.fullwidth", `[０-９]+`, "这里使用了全角数字，请确认是否应改为半角数字。", "GB/T 15835—2011 5.1.7.1", "review"},
	{"number.mixed-place", `[0-9]+\s*[十百千]\s*[万亿零]`, "阿拉伯数字与汉字数位混用，请核对后使用一致写法。", "GB/T 15835—2011 5.3", "review"},
	{"date.incomplete", `[0-9]{4}-[0-9]{1,2}`, "只写年月时建议使用“年、月”，请核对这里是日期还是编号。", "GB/T 15835—2011 5.1.4", "review"},
	{"date.comma", `[0-9]{4}\s*、\s*[0-9]{1,2}\s*、\s*[0-9]{1,2}`, "日期不宜用顿号分隔，请改为完整年月日或规范日期格式。", "GB/T 15834—2011", "review"},
	{"date.chinese-year", `[一二三四五六七八九〇]*〇[一二三四五六七八九〇]*\s*年`, "若这是成文日期，年份应使用阿拉伯数字；引用原文请保留。", "GB/T 9704—2012 7.3.5", "review"},
	{"date.inline-padding", `年\s*0[0-9]\s*月|月\s*0[0-9]\s*日`, "若这里采用中文成文日期写法，月、日不补零。", "GB/T 9704—2012 7.3.5", "review"},
	{"style.self-reference", `我司|贵司`, "正式机关行文中的单位称呼请结合行文关系核对，不自动替换。", "公文用语建议", "suggestion"},
	{"style.modal-stack", `(?:可能|也许|或许|大概|似乎|恐怕|应该|应当)[、]?(?:可能|也许|或许|大概|似乎|恐怕|应该|应当)`, "连续使用了多个情态词，可考虑保留最准确的一个。", "文风建议，不作强制判断", "suggestion"},
	{"style.latin", `(?i)\be\.g\.|\bi\.e\.|\betc\.|\bet al\.`, "中文行文中的拉丁缩写可考虑改成中文，专业引文除外。", "文风建议", "suggestion"},
	{"style.tool-marker", `turn[0-9]+search[0-9]+|oai_citation|oaicite|contentReference`, "发现工具引用占位符，请核对并替换为可读的真实出处。", "出稿清理建议", "suggestion"},
	{"style.nominalization", `(?:进行|予以|加以)(?:了|一个|一场|一次|一番)?[^，。；：！？、,.:;!?()（）「」\n]{0,8}(?:调整|修改|优化|处理|检查|确认|评估|分析|核实|更新|变更|操作|梳理|排查|整理|验证|说明|补充|升级|改造|讨论|盘点|清理|迁移|部署|发布|采集|统计|核算)`, "这处表达可考虑直接使用动作词，以使句子更简洁。", "文风建议", "suggestion"},
}
var conventionRegex = func() []*regexp.Regexp {
	out := make([]*regexp.Regexp, len(conventions))
	for i, r := range conventions {
		out[i] = regexp.MustCompile(r.pattern)
	}
	return out
}()
var dottedHeading = regexp.MustCompile(`^[0-9]+\.[0-9]+`)
var actualUnit = regexp.MustCompile(`^\s*(?:亿元|万元|亿|万|元|吨|亩|人|户|个|年|月|日|%|km|kg|mm|m)`)
var inlineDate = regexp.MustCompile(`([0-9]{4})\s*年\s*([0-9]{1,2})\s*月\s*([0-9]{1,2})\s*日`)

func checkTextConventions(m Model, tables map[string]bool, add addFinding) {
	negatives := []*Paragraph{}
	for _, p := range m.Paragraphs() {
		if p.Protected || strings.TrimSpace(p.Text) == "" {
			continue
		}
		if !dateStandalone(p.Text) {
			for _, match := range inlineDate.FindAllStringSubmatch(p.Text, -1) {
				if editableOccurrence(p.Text, match[0]) < 0 {
					continue
				}
				year, _ := strconv.Atoi(match[1])
				month, _ := strconv.Atoi(match[2])
				day, _ := strconv.Atoi(match[3])
				date := time.Date(year, time.Month(month), day, 0, 0, 0, 0, time.UTC)
				if year == 0 || date.Year() != year || int(date.Month()) != month || date.Day() != day {
					add(p, "date.invalid-inline", "error", "“"+match[0]+"”不是有效日期，请依据原始材料核对。", "", "日期有效性校验")
				}
			}
		}
		for i, rule := range conventions {
			for _, where := range conventionRegex[i].FindAllStringIndex(p.Text, -1) {
				hit := p.Text[where[0]:where[1]]
				if editableOccurrence(p.Text, hit) < 0 {
					continue
				}
				if rule.id == "date.incomplete" && where[1] < len(p.Text) && (p.Text[where[1]] == '-' || p.Text[where[1]] >= '0' && p.Text[where[1]] <= '9') {
					continue
				}
				if rule.id == "date.inline-padding" && dateStandalone(p.Text) {
					continue
				}
				if rule.id == "number.short-year" {
					prefix := strings.TrimSpace(p.Text[:where[0]])
					if len(prefix) > 0 {
						r, _ := utf8.DecodeLastRuneInString(prefix)
						if strings.ContainsRune("0123456789第满近共达约", r) {
							continue
						}
					}
				}
				if rule.id == "number.unit-space" && where[0] > 0 {
					b := p.Text[where[0]-1]
					if b >= 'A' && b <= 'Z' || b >= 'a' && b <= 'z' {
						continue
					}
				}
				add(p, rule.id, rule.severity, "“"+strings.TrimSpace(hit)+"”："+rule.message, "", rule.basis)
				break
			}
		}
		if !tables[p.ID] {
			if match := dottedHeading.FindStringIndex(strings.TrimSpace(p.Text)); match != nil {
				rest := strings.TrimSpace(p.Text)[match[1]:]
				if !actualUnit.MatchString(rest) {
					add(p, "format.heading-sequence", "review", "这里可能使用了 1.1 式层次编号；公文通常采用一、（一）1.（1）的层级。", "", "GB/T 9704—2012 7.3.3")
				}
			}
		}
		if p.Prefix != "" && strings.HasPrefix(strings.TrimSpace(p.Text), p.Prefix) {
			add(p, "format.duplicate-number", "review", "这段同时存在自动编号和重复的手写编号，请确认后移除重复部分。", strings.TrimPrefix(p.Text, p.Prefix), "段落结构校验")
		}
		for _, hit := range regexp.MustCompile(`(?:不是|并非)[^。！？\n]{0,30}而是`).FindAllString(p.Text, -1) {
			if editableOccurrence(p.Text, hit) >= 0 {
				negatives = append(negatives, p)
			}
		}
	}
	if len(negatives) >= 3 {
		add(negatives[0], "style.parallel-negation", "suggestion", fmt.Sprintf("全文识别到 %d 处“不是…而是”类表达，请核对是否需要简化。", len(negatives)), "", "文风建议")
	}
	if m.Page.LinePitch != 579 {
		add(nil, "format.grid", "review", "当前文档网格与每页 22 行的常用公文设置不同，可用“统一格式”调整。", "", "GB/T 9704—2012 行字数设置")
	}
	for _, block := range m.Blocks {
		if block.Table == nil || len(block.Table.Rows) < 2 || !block.Table.Rows[0].Header {
			continue
		}
		for ri, row := range block.Table.Rows {
			for _, cell := range row.Cells {
				if cell.Merge == "continue" || len(cell.Paragraphs) == 0 {
					continue
				}
				p := &cell.Paragraphs[0]
				text := cellText(cell)
				if text == "同上" || text == "同左" || text == "同前" {
					add(p, "table.repeated-placeholder", "suggestion", "表格中建议写清具体内容，便于独立阅读；合并单元格可按实际需要保留。", "", "表格可读性建议")
				}
				if ri > 0 && text == "" {
					add(p, "table.empty-cell", "suggestion", "这个单元格没有内容，请确认是缺数据，还是应填写“—”。", "", "表格完整性提示，不把空值当成 0")
				}
				if strings.HasSuffix(text, "。") {
					add(p, "table.punctuation", "suggestion", "简短表格词条的句末句号可考虑省略；完整叙述句应按语境保留。", "", "表格文字体例建议")
				}
			}
		}
	}
}
func dateStandalone(text string) bool {
	return regexp.MustCompile(`^\s*[0-9]{4}年[0-9]{1,2}月[0-9]{1,2}日\s*$`).MatchString(text)
}
