package office

import (
	"context"
	"testing"
)

func TestNewLetterheadKeepsDividerWithoutReference(t *testing.T) {
	for _, reference := range []string{"", "办发〔2026〕12号"} {
		m, err := NewDocument(Fields{Kind: "notice", Letterhead: true, Agency: "示例单位办公室", Title: "关于开展工作的通知", Body: "各部门按要求落实。", Reference: reference})
		if err != nil {
			t.Fatal(err)
		}
		var divider *Paragraph
		for _, p := range m.Paragraphs() {
			if p.Role == "letterhead-divider" {
				divider = p
			}
		}
		if divider == nil || !divider.BorderBottom || divider.BorderColor != "FF0000" || divider.After != 20.42 {
			t.Fatal("redhead divider or title gap missing")
		}
		if _, err = RenderPDF(context.Background(), m); err != nil {
			t.Fatal(err)
		}
	}
}
