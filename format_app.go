package main

import "doc2govpdf/internal/office"

func(a *App)SetParagraphRole(m office.Model,id,role string)(office.Model,error){return office.SetRole(m,id,role)}

func (a *App) NormalizeDocument(m office.Model) (office.Model, error) {
	if e := m.Validate(); e != nil {
		return m, e
	}
	return office.NormalizeLayout(m), nil
}
