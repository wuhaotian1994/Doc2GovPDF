package webengine

import (
	"doc2govpdf/internal/office"
	"encoding/json"
	"strings"
	"testing"
)

func invoke(t *testing.T, method string, args ...any) Reply {
	t.Helper()
	b, _ := json.Marshal(map[string]any{"method": method, "args": args})
	var r Reply
	if e := json.Unmarshal([]byte(Call(string(b))), &r); e != nil {
		t.Fatal(e)
	}
	return r
}
func TestBrowserBoundary(t *testing.T) {
	m, e := office.NewDocument(office.Fields{Kind: "notice", Title: "网页出稿", Body: "请核对材料。", Agency: "示例单位", Letterhead: true, Date: "2026年10月18日"})
	if e != nil {
		t.Fatal(e)
	}
	for _, method := range []string{"InspectDocument", "PreviewDocument", "NormalizeDocument"} {
		r := invoke(t, method, m)
		if r.Error != "" {
			t.Fatal(method, r.Error)
		}
	}
	bad := office.Plain("数字核对\n营业收入为100万元。营业收入为120万元。")
	r := invoke(t, "ExportDocument", bad, "pdf", false, nil)
	if !strings.Contains(r.Error, "核对") {
		t.Fatal("unconfirmed values exported", r)
	}
	if r := invoke(t, "Import", "bad.txt", []byte{0xff}); r.Error == "" {
		t.Fatal("invalid text accepted")
	}
	if r := invoke(t, "Import", "bad.docx", []byte("bad")); r.Error == "" {
		t.Fatal("invalid DOCX accepted")
	}
	if r := invoke(t, "SetParagraphRole", m, "missing", "body"); r.Error == "" {
		t.Fatal("invalid paragraph accepted")
	}
}
