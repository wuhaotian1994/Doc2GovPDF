package office

import "testing"

func explicitAnnexModel(t *testing.T) Model {
	t.Helper()
	m, e := NewDocument(Fields{Kind: "plain", Title: "模拟通知", Body: "正文事项。", Attachments: []string{"模拟清单"}, AnnexPages: true})
	if e != nil {
		t.Fatal(e)
	}
	for _, p := range m.Paragraphs() {
		if p.PageBreak {
			p.Role = "attachment-label"
		}
		if p.Role == "attachment-body" {
			p.Text = "待核对事项。"
		}
	}
	return m
}
func annexRules(t *testing.T, m Model) map[string]bool {
	t.Helper()
	r, e := Inspect(m)
	if e != nil {
		t.Fatal(e)
	}
	out := map[string]bool{}
	for _, i := range r.Issues {
		if len(i.Rule) > 6 && i.Rule[:6] == "annex." {
			out[i.Rule] = true
		}
	}
	return out
}
func TestDeclaredAnnexChecksMatchDescriptionWithoutInventingFacts(t *testing.T) {
	m := explicitAnnexModel(t)
	if r := annexRules(t, m); len(r) != 0 {
		t.Fatal(r)
	}
	for _, p := range m.Paragraphs() {
		if p.Role == "attachment-title" {
			p.Text = "其他清单"
		}
	}
	if !annexRules(t, m)["annex.link"] {
		t.Fatal("title mismatch accepted")
	}
}
func TestDeclaredAnnexPageAndTitleLayoutAreExportRequirements(t *testing.T) {
	m := explicitAnnexModel(t)
	for _, p := range m.Paragraphs() {
		if p.Role == "attachment-label" {
			p.PageBreak = false
		}
		if p.Role == "attachment-title" {
			p.Align = "left"
		}
	}
	r := annexRules(t, m)
	if !r["annex.page"] || !r["annex.title-layout"] {
		t.Fatal(r)
	}
}
func TestOriginalProtectionIsNotForcedThroughDeclaredAnnexNormalization(t *testing.T) {
	m := explicitAnnexModel(t)
	m.SourceID = "original-source"
	for _, p := range m.Paragraphs() {
		if p.Role == "attachment-title" {
			p.Text = "不同标题"
		}
	}
	if r := annexRules(t, m); len(r) != 0 {
		t.Fatal(r)
	}
}
func TestMultipleAnnexesRequireDistinctExplicitNumbers(t *testing.T) {
	m := explicitAnnexModel(t)
	tail := m.Blocks[len(m.Blocks)-3:]
	cloned := m.Clone()
	for _, b := range tail {
		copy := b
		if b.Paragraph != nil {
			p := *b.Paragraph
			p.ID += "-second"
			copy.Paragraph = &p
		}
		cloned.Blocks = append(cloned.Blocks, copy)
	}
	if !annexRules(t, cloned)["annex.number"] {
		t.Fatal("multiple unnumbered annexes accepted")
	}
}

func TestDeclaredAnnexCannotExportAnEmptyAttachment(t *testing.T) {
	m := explicitAnnexModel(t)
	for _, p := range m.Paragraphs() {
		if p.Role == "attachment-body" {
			p.Text = ""
		}
	}
	if !annexRules(t, m)["annex.empty"] {
		t.Fatal("empty actual annex accepted")
	}
}
func TestDistinctExplicitMultipleAnnexesKeepTheirCorrespondingDescriptions(t *testing.T) {
	m, e := NewDocument(Fields{Kind: "plain", Title: "通知", Body: "正文。", Attachments: []string{"第一清单", "第二清单"}, AnnexPages: true})
	if e != nil {
		t.Fatal(e)
	}
	for _, p := range m.Paragraphs() {
		if p.PageBreak {
			p.Role = "attachment-label"
		}
		if p.Role == "attachment-body" {
			p.Text = "有待核对的实际内容。"
		}
	}
	if r := annexRules(t, m); len(r) != 0 {
		t.Fatal(r)
	}
}
