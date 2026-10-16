package office

import (
	"fmt"
	"sort"
)

type RepairChange struct {
	ParagraphID string `json:"paragraphId"`
	Before      string `json:"before"`
	After       string `json:"after"`
}
type RepairPlan struct {
	Document Model          `json:"document"`
	Changes  []RepairChange `json:"changes"`
}

// PlanSafeRepairs changes only deterministic written-form rules. Numeric
// comparisons, facts, style suggestions, protected spans and tables stay intact.
func PlanSafeRepairs(m Model) (RepairPlan, error) {
	return PlanSafeRepairsSkipping(m, nil)
}
func PlanSafeRepairsSkipping(m Model, skip map[string]bool) (RepairPlan, error) {
	result := RepairPlan{Document: m.Clone(), Changes: []RepairChange{}}
	if e := m.Validate(); e != nil {
		return result, e
	}
	tables := map[string]bool{}
	for _, b := range m.Blocks {
		if b.Table != nil {
			for _, r := range b.Table.Rows {
				for _, c := range r.Cells {
					for _, p := range c.Paragraphs {
						tables[p.ID] = true
					}
				}
			}
		}
	}
	for _, p := range result.Document.Paragraphs() {
		if skip[p.ID] || tables[p.ID] || p.Role == "agency" {
			continue
		}
		before := p.Text
		for step := 0; step < 512; step++ {
			corrections := TextCorrections(*p)
			if len(corrections) == 0 {
				break
			}
			keys := make([]string, 0, len(corrections))
			for key := range corrections {
				keys = append(keys, key)
			}
			sort.Strings(keys)
			next := corrections[keys[0]]
			if next == p.Text {
				break
			}
			if p.Protected {
				ranges, e := rebaseEditableRanges(*p, next)
				if e != nil {
					return result, e
				}
				p.EditableRanges = ranges
			}
			p.Text = next
			if step == 511 {
				return result, fmt.Errorf("单段待整理项过多，请分段后处理")
			}
		}
		if p.Text != before {
			result.Changes = append(result.Changes, RepairChange{p.ID, before, p.Text})
		}
	}
	return result, result.Document.Validate()
}
