package office

import (
	"context"
	"testing"
)

func TestManualPageBreakRetainsBothSides(t *testing.T) {
	m := Plain("标题\n第一页正文第二页正文")
	p := m.Blocks[1].Paragraph
	p.BreakOffsets = []int{len("第一页正文")}
	p.Protected = true
	r, e := RenderPDF(context.Background(), m)
	if e != nil {
		t.Fatal(e)
	}
	if r.Pages != 2 {
		t.Fatalf("manual page break ignored: %d", r.Pages)
	}
}
