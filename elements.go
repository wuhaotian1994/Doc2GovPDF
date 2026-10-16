package main

import "doc2govpdf/internal/office"

func (a *App) UpdateDocumentElements(m office.Model, fields office.Fields) (office.Model, error) {
	return office.UpdateElements(m, fields)
}

func (a *App) PreviewSafeRepairs(m office.Model, ignored []string) (office.RepairPlan, error) {
	inspection, e := office.Inspect(m)
	if e != nil {
		return office.RepairPlan{}, e
	}
	ids := map[string]bool{}
	for _, id := range ignored {
		ids[id] = true
	}
	skip := map[string]bool{}
	for _, f := range inspection.Issues {
		if ids[f.ID] && f.Replacement != "" {
			skip[f.ParagraphID] = true
		}
	}
	return office.PlanSafeRepairsSkipping(m, skip)
}
