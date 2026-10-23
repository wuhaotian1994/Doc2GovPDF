package office

import (
	"bytes"
	"context"
	"encoding/json"
	"math"
	"strings"
	"testing"

	readpdf "github.com/ledongthuc/pdf"
)

func explicitIssueFixture() Fields {
	return Fields{Kind: "plain", Title: "历史核阅用请示", Reference: "示办〔2024〕1号", Body: "正文保持完整，数字12.50不改。", Agency: "示例落款机关", Date: "2024年8月15日", Signer: "签发者甲", Issuer: "独立印发办公室", IssueDate: "2024年8月19日"}
}

func issueLine(m Model) *Paragraph {
	for _, b := range m.Blocks {
		if p := b.Paragraph; p != nil && p.Role == "imprint" && strings.Contains(p.Text, "\t") {
			return p
		}
	}
	return nil
}
func issueRole(m Model, role string) []*Paragraph {
	out := []*Paragraph{}
	for _, b := range m.Blocks {
		if b.Paragraph != nil && b.Paragraph.Role == role {
			out = append(out, b.Paragraph)
		}
	}
	return out
}

func TestExplicitPlainSignerAndIndependentImprintReachActualWordPDF(t *testing.T) {
	f := explicitIssueFixture()
	m, e := NewDocument(f)
	if e != nil {
		t.Fatal(e)
	}
	if m.Template != "plain" {
		t.Fatal("document kind was guessed")
	}
	line := issueLine(m)
	if line == nil || line.Text != f.Issuer+"\t"+f.IssueDate+"印发" || !line.AnchorBottom || line.Size != 14 {
		t.Fatal("independent imprint absent or borrowed", line)
	}
	if dates := issueRole(m, "date"); len(dates) != 1 || dates[0].Text != f.Date {
		t.Fatal("document date was replaced")
	}
	refs := issueRole(m, "reference")
	if len(refs) != 1 || !strings.Contains(refs[0].Text, "签发人："+f.Signer) || len(refs[0].Tabs) == 0 {
		t.Fatal("signer not in existing reference/tab layout")
	}
	word, e := CreateDOCX(m)
	if e != nil {
		t.Fatal(e)
	}
	opened, e := Open(word)
	if e != nil {
		t.Fatal(e)
	}
	for _, fact := range []string{f.Signer, f.Issuer, f.IssueDate, f.Date, "12.50"} {
		if !strings.Contains(opened.Model.Text(), fact) {
			t.Fatal("Word lost a fact", fact)
		}
	}
	d, e := parseXML(opened.Parts["word/document.xml"])
	if e != nil {
		t.Fatal(e)
	}
	anchored := false
	wordSigner, wordTitle := -1, -1
	paragraphIndex := 0
	for _, p := range d.FindElements("//w:p") {
		var text strings.Builder
		for _, v := range descendants(p, "t") {
			text.WriteString(v.Text())
		}
		if strings.Contains(text.String(), "签发人："+f.Signer) {
			wordSigner = paragraphIndex
		}
		if text.String() == f.Title {
			wordTitle = paragraphIndex
		}
		paragraphIndex++
		if strings.Contains(text.String(), f.Issuer) {
			anchored = attr(child(child(p, "pPr"), "framePr"), "yAlign") == "bottom"
		}
	}
	if wordSigner < 0 || wordTitle < 0 || wordSigner >= wordTitle {
		t.Fatal("Word explicit plain signer is not before the title", wordSigner, wordTitle)
	}
	if !anchored {
		t.Fatal("Word imprint is not bottom anchored")
	}
	for name := range opened.Parts {
		if strings.HasPrefix(name, "word/media/") {
			t.Fatal("unexpected seal or image", name)
		}
	}
	result, e := RenderPDF(context.Background(), m)
	if e != nil {
		t.Fatal(e)
	}
	reader, e := readpdf.NewReader(bytes.NewReader(result.Data), int64(len(result.Data)))
	if e != nil {
		t.Fatal(e)
	}
	var actual strings.Builder
	points := map[string]readpdf.Text{}
	for n := 1; n <= reader.NumPage(); n++ {
		for _, run := range reader.Page(n).Content().Text {
			actual.WriteString(run.S)
			if run.S == "独" || run.S == "正" || run.S == "甲" || run.S == "9" || run.S == "历" {
				if _, exists := points[run.S]; !exists {
					points[run.S] = run
				}
			}
		}
	}
	for _, fact := range []string{f.Signer, f.Issuer, f.IssueDate, f.Date, "12.50"} {
		if !strings.Contains(actual.String(), fact) {
			t.Fatal("PDF lost a fact", fact)
		}
	}
	imprint, ok := points["独"]
	body, okBody := points["正"]
	date, okDate := points["9"]
	signer, okSigner := points["甲"]
	title, okTitle := points["历"]
	// Extracted PDF coordinates start at the page bottom, so above means larger Y.
	if !okTitle || !okSigner || signer.Y <= title.Y {
		t.Fatal("PDF explicit plain signer is not above the title", signer, title)
	}
	if !ok || !okBody || !okDate || !okSigner || imprint.Y >= body.Y || date.X <= imprint.X || math.Abs(date.Y-imprint.Y) > 1 || signer.X <= body.X {
		t.Fatal("PDF signer/imprint positions did not follow existing layout", points)
	}
	t.Logf("PDF points: body=(%.2f,%.2f) signer=(%.2f,%.2f) issuer=(%.2f,%.2f) issue-day=(%.2f,%.2f)", body.X, body.Y, signer.X, signer.Y, imprint.X, imprint.Y, date.X, date.Y)
}

func TestIndependentImprintDoesNotRequireOrCreateClosingFacts(t *testing.T) {
	f := explicitIssueFixture()
	f.Reference = ""
	f.Agency = ""
	f.Date = ""
	m, e := NewDocument(f)
	if e != nil {
		t.Fatal(e)
	}
	if len(issueRole(m, "signature")) != 0 || len(issueRole(m, "date")) != 0 {
		t.Fatal("closing agency/date manufactured")
	}
	if line := issueLine(m); line == nil || line.Text != f.Issuer+"\t"+f.IssueDate+"印发" {
		t.Fatal("independent print facts were dropped")
	}
	refs := issueRole(m, "reference")
	if len(refs) != 1 || refs[0].Text != "\t签发人："+f.Signer {
		t.Fatal("signer-only line borrowed a reference", refs)
	}
	if _, e := RenderPDF(context.Background(), m); e != nil {
		t.Fatal(e)
	}
}

func TestExplicitIssuanceFitsPlainRedheadAndExistingUpwardTemplates(t *testing.T) {
	for _, kind := range []string{"plain", "request", "report"} {
		for _, redhead := range []bool{false, true} {
			f := explicitIssueFixture()
			f.Kind = kind
			f.Letterhead = redhead
			m, e := NewDocument(f)
			if e != nil {
				t.Fatal(kind, redhead, e)
			}
			line := issueLine(m)
			if line == nil || !strings.HasPrefix(line.Text, f.Issuer+"\t") {
				t.Fatal(kind, redhead, "imprint missing")
			}
			if _, e := CreateDOCX(m); e != nil {
				t.Fatal(e)
			}
			if _, e := RenderPDF(context.Background(), m); e != nil {
				t.Fatal(e)
			}
		}
	}
}

func TestPartialConflictingOrInvalidIssuanceNeverBorrowsOtherFacts(t *testing.T) {
	tests := []struct{ issuer, date, kind, match string }{{"独立机关", "", "plain", "不会使用成文日期"}, {"", "2024年8月19日", "plain", "不会使用落款单位"}, {" ", " ", "plain", "不会使用落款单位"}, {"独立机关", "2024年2月30日", "plain", "不是有效日期"}, {"独立机关", "2024年8月19日或2024年8月23日", "plain", "不会自动选取"}, {"独立\t机关", "2024年8月19日", "plain", "不能含换行或制表符"}, {"独立机关", "2024年8月19日", "letter", "函类版式暂不支持"}}
	for _, tc := range tests {
		f := explicitIssueFixture()
		f.Signer = ""
		f.Letterhead = true
		f.Issuer = tc.issuer
		f.IssueDate = tc.date
		f.Kind = tc.kind
		before, _ := json.Marshal(f)
		if _, e := NewDocument(f); e == nil || !strings.Contains(e.Error(), tc.match) {
			t.Fatal(tc, e)
		}
		after, _ := json.Marshal(f)
		if !bytes.Equal(before, after) {
			t.Fatal("invalid fields mutated")
		}
	}
}

func TestSignerScalarConflictRejectsWhileExistingListRemainsCompatible(t *testing.T) {
	f := explicitIssueFixture()
	f.Signers = []string{"另一签发人"}
	if _, e := NewDocument(f); e == nil || !strings.Contains(e.Error(), "不一致") {
		t.Fatal(e)
	}
	f.Signers = []string{f.Signer, "签发者乙"}
	m, e := NewDocument(f)
	if e != nil {
		t.Fatal(e)
	}
	if !strings.Contains(m.Text(), "签发者甲") || !strings.Contains(m.Text(), "签发者乙") {
		t.Fatal("existing multi-signer API lost facts")
	}
}

func TestAbsentExplicitIssuanceKeepsLegacyTemplateBehavior(t *testing.T) {
	f := explicitIssueFixture()
	f.Signer = ""
	f.Issuer = ""
	f.IssueDate = ""
	m, e := NewDocument(f)
	if e != nil {
		t.Fatal(e)
	}
	if line := issueLine(m); line != nil {
		t.Fatal("plain no-field output acquired an imprint")
	}
	if strings.Contains(m.Text(), "签发人：") {
		t.Fatal("signer manufactured")
	}
	f.Letterhead = true
	m, e = NewDocument(f)
	if e != nil {
		t.Fatal(e)
	}
	if line := issueLine(m); line == nil || line.Text != f.Agency+"\t"+f.Date+"印发" {
		t.Fatal("legacy zero-field template behavior changed", line)
	}
}

func TestIssuanceRebuildPreservesBodyTablesAndRejectsImportedOriginal(t *testing.T) {
	f := explicitIssueFixture()
	m, e := NewDocument(f)
	if e != nil {
		t.Fatal(e)
	}
	grid := Block{Table: &Table{Widths: []float64{156}, Rows: []Row{{Cells: []Cell{{Span: 1, Paragraphs: []Paragraph{{ID: "kept-issue-cell", Text: "原表12.50", Role: "body", Font: "仿宋", Size: 14, Line: 8}}}}}}}}
	m.Blocks = append(m.Blocks[:3], append([]Block{grid}, m.Blocks[3:]...)...)
	f.Signer = "签发者乙"
	f.IssueDate = "2024年8月23日"
	next, e := UpdateElements(m, f)
	if e != nil {
		t.Fatal(e)
	}
	if !strings.Contains(next.Text(), "原表12.50") || !strings.Contains(next.Text(), f.Signer) || !strings.Contains(issueLine(next).Text, f.IssueDate) {
		t.Fatal("rebuild lost authored structure or independent facts")
	}
	old, _ := json.Marshal(next)
	f.IssueDate = ""
	unchanged, e := UpdateElements(next, f)
	if e == nil {
		t.Fatal("partial rebuild accepted")
	}
	kept, _ := json.Marshal(unchanged)
	if !bytes.Equal(old, kept) {
		t.Fatal("invalid rebuild changed the model")
	}
	next.SourceID = "protected-original"
	same, e := UpdateElements(next, explicitIssueFixture())
	if e == nil || same.SourceID != next.SourceID {
		t.Fatal("imported original rebuilt")
	}
}

func TestPlainSignerTitleOrderLeavesUnsignedAndTypedTemplatesUnchanged(t *testing.T) {
	for _, kind := range []string{"plain", "request", "report"} {
		for _, signer := range []string{"", "签发者甲"} {
			f := explicitIssueFixture()
			f.Kind = kind
			f.Signer = signer
			m, e := NewDocument(f)
			if e != nil {
				t.Fatal(e)
			}
			title, reference := -1, -1
			for index, block := range m.Blocks {
				if block.Paragraph == nil {
					continue
				}
				if block.Paragraph.Role == "title" {
					title = index
				}
				if block.Paragraph.Role == "reference" {
					reference = index
				}
			}
			before := kind == "plain" && signer != ""
			if title < 0 || reference < 0 || (reference < title) != before {
				t.Fatal("unexpected title/reference order", kind, signer, title, reference)
			}
		}
	}
}
