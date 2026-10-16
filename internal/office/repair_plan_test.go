package office

import (
	"strings"
	"testing"
)

func TestSafeRepairPlanRetainsFactsAndAllowsReview(t *testing.T) {
	m := Plain("核对通知\n筹画项目，于2026年05月08日前报送。\n营业收入为100万元。营业收入为120万元。\n引用“筹画”与 https://a.b/c,d 保留。")
	plan, e := PlanSafeRepairs(m)
	if e != nil {
		t.Fatal(e)
	}
	if len(plan.Changes) != 1 {
		t.Fatal("unexpected changes", plan.Changes)
	}
	if !strings.Contains(plan.Document.Text(), "筹划项目，于2026年5月8日前报送。") || !strings.Contains(m.Text(), "筹画项目") {
		t.Fatal("repair not previewed without mutation")
	}
	if !strings.Contains(plan.Document.Text(), "100万元。营业收入为120万元") || !strings.Contains(plan.Document.Text(), "引用“筹画”与 https://a.b/c,d") {
		t.Fatal("facts or protected quotes changed")
	}
}

func TestQuoteProtectionAcrossOpaqueRunBoundary(t *testing.T) {
	p := Paragraph{Text: "“筹画申报系统”之外筹画项目", Protected: true, EditableRanges: []TextRange{{0, len("“筹画")}, {len("“筹画申报系统"), len("“筹画申报系统”之外筹画项目")}}}
	if got := TextCorrections(p)["word.variant"]; got != "“筹画申报系统”之外筹划项目" {
		t.Fatal("quoted text crossed protection boundary", got)
	}
}
