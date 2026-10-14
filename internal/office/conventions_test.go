package office

import "testing"

func TestConventionRulesAndQuotedCounterexamples(t *testing.T) {
	cases := map[string]string{"number.unit-space": "设备容量为100kWh。", "number.range-unit": "比例为15~30%。", "number.bare-decimal": "厚度.5毫米。", "number.short-year": "26年底完成。", "number.fullwidth": "共１２个项目。", "number.mixed-place": "总数为3百万。", "date.incomplete": "计划在2026-10完成。", "date.comma": "日期为2026、10、14。", "date.chinese-year": "成文日期为二〇二六年。", "date.inline-padding": "拟于2026年01月02日开展工作。", "style.self-reference": "我司提交材料。", "style.modal-stack": "可能也许需要调整。", "style.latin": "例如 e.g. 的写法。", "style.tool-marker": "请参见 turn1search2。", "style.nominalization": "进行检查。"}
	for rule, text := range cases {
		t.Run(rule, func(t *testing.T) {
			r, e := Inspect(Plain("标题\n" + text))
			if e != nil {
				t.Fatal(e)
			}
			found := false
			for _, f := range r.Issues {
				if f.Rule == rule {
					found = true
				}
			}
			if !found {
				t.Fatalf("not detected: %s", text)
			}
			r, _ = Inspect(Plain("标题\n引用“" + text + "”"))
			for _, f := range r.Issues {
				if f.Rule == rule {
					t.Fatal("quoted text flagged")
				}
			}
		})
	}
}
func TestValidCompleteDatesAndNumericRanges(t *testing.T) {
	r, e := Inspect(Plain("标题\n2026-10-14\n运营20年，满20年底到期。\n1.2亿元\n比例为15%～30%。"))
	if e != nil {
		t.Fatal(e)
	}
	for _, f := range r.Issues {
		if f.Rule == "date.incomplete" || f.Rule == "number.short-year" || f.Rule == "number.range-unit" || f.Rule == "format.heading-sequence" {
			t.Fatalf("false positive: %+v", f)
		}
	}
}

func TestInlineInvalidDateAndQuotation(t *testing.T) {
	r, _ := Inspect(Plain("标题\n计划于2026 年 2 月 30 日开展工作。"))
	found := false
	for _, f := range r.Issues {
		if f.Rule == "date.invalid-inline" {
			found = true
		}
	}
	if !found {
		t.Fatal("inline invalid date missing")
	}
	r, _ = Inspect(Plain("标题\n“2026年2月30日”是一个无效日期示例。"))
	for _, f := range r.Issues {
		if f.Rule == "date.invalid-inline" {
			t.Fatal("quotation rewritten")
		}
	}
}
