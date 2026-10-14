package document

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"io"
	"strings"
	"testing"
)

func TestCheckAndApply(t *testing.T) {
	text := "通知\n办发【2026】第012号\n2026年10月08日\n金额 １２元，引用“2026年01月01日”不修改。"
	r, err := Check(text)
	if err != nil {
		t.Fatal(err)
	}
	if len(r.Issues) != 2 {
		t.Fatalf("wanted 2 issues, got %+v", r.Issues)
	}
	for len(r.Issues) > 0 {
		text, err = Apply(text, r.Issues[0].ID)
		if err != nil {
			t.Fatal(err)
		}
		r, _ = Check(text)
	}
	want := "通知\n办发〔2026〕12号\n2026年10月8日\n金额 １２元，引用“2026年01月01日”不修改。"
	if text != want {
		t.Fatalf("unexpected text: %q", text)
	}
	if len(r.Unchecked) == 0 {
		t.Fatal("must not imply full compliance")
	}
}

func TestCheckProtectsUncertainContexts(t *testing.T) {
	text := "标题\n2024年2月29日\n办发〔2026〕12号\n“2026年01月02日”\n会议日期为2026年01月02日。\nhttps://example.com/2026/01\n[2026]不是发文字号\n共１２个项目"
	r, err := Check(text)
	if err != nil {
		t.Fatal(err)
	}
	if len(r.Issues) != 0 {
		t.Fatalf("false positives: %+v", r.Issues)
	}
}

func TestInvalidDateAndStaleFix(t *testing.T) {
	r, _ := Check("2025年2月29日")
	if len(r.Issues) != 1 || r.Issues[0].Replacement != "" {
		t.Fatal("invalid date must require manual edit")
	}
	if _, err := Apply("2025年2月29日", r.Issues[0].ID); err == nil {
		t.Fatal("must not auto-fix a factual date")
	}
	r, _ = Check("2026年01月02日")
	if _, err := Apply("2026年01月03日", r.Issues[0].ID); err == nil {
		t.Fatal("stale issue accepted")
	}
}

func TestDOCXRoundTripAndXML(t *testing.T) {
	text := "  测试标题 & <一>\n\n主送机关：\n  正文含有 <标签>、& 和 emoji 😀。\n2026年10月14日\n"
	data, err := DOCX(text)
	if err != nil {
		t.Fatal(err)
	}
	actual, err := ReadDOCX(data)
	if err != nil {
		t.Fatal(err)
	}
	if actual != text {
		t.Fatalf("text changed: %q", actual)
	}
	z, _ := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	for _, f := range z.File {
		r, err := f.Open()
		if err != nil {
			t.Fatal(err)
		}
		d := xml.NewDecoder(r)
		for {
			_, err = d.Token()
			if err == io.EOF {
				break
			}
			if err != nil {
				t.Fatalf("%s: %v", f.Name, err)
			}
		}
		r.Close()
	}
}

func packageXML(t *testing.T, content string) []byte {
	t.Helper()
	var b bytes.Buffer
	z := zip.NewWriter(&b)
	f, _ := z.Create("word/document.xml")
	_, _ = io.WriteString(f, content)
	_ = z.Close()
	return b.Bytes()
}

func TestDOCXRejectsLossyStructures(t *testing.T) {
	for _, tag := range []string{"tbl", "drawing", "ins", "del", "fldSimple", "hyperlink", "numPr", "headerReference", "footerReference", "sdt", "rPrChange", "sym"} {
		t.Run(tag, func(t *testing.T) {
			data := packageXML(t, `<w:document xmlns:w="`+wordNS+`"><w:body><w:p><w:r><w:t>正文</w:t></w:r><w:`+tag+`/></w:p></w:body></w:document>`)
			if _, err := ReadDOCX(data); err == nil {
				t.Fatal("unsupported content accepted")
			}
		})
	}
	if _, err := ReadDOCX([]byte("invalid zip")); err == nil {
		t.Fatal("bad zip accepted")
	}
	if _, err := ReadDOCX(packageXML(t, `<w:document xmlns:w="`+wordNS+`"><w:body><w:p>`)); err == nil {
		t.Fatal("broken XML accepted")
	}
}

func TestInputLimits(t *testing.T) {
	for _, text := range []string{"", " \n\t", "text\x00", string([]byte{0xff}), strings.Repeat("a", MaxTextBytes+1)} {
		if _, err := Check(text); err == nil {
			t.Fatal("invalid text accepted")
		}
		if _, err := DOCX(text); err == nil {
			t.Fatal("invalid export accepted")
		}
	}
}
