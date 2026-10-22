package office

import (
	"bytes"
	"encoding/json"
	"github.com/beevik/etree"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func readVisibleParagraph(p *etree.Element) string {
	var out strings.Builder
	var walk func(*etree.Element)
	walk = func(n *etree.Element) {
		if n.NamespaceURI() != W {
			return
		}
		switch n.Tag {
		case "pPr", "rPr", "del", "moveFrom", "drawing", "pict", "object":
			return
		case "t":
			out.WriteString(n.Text())
			return
		case "tab":
			out.WriteByte('\t')
			return
		case "br", "cr":
			if attr(n, "type") != "page" {
				out.WriteByte('\n')
			}
			return
		}
		for _, c := range n.ChildElements() {
			walk(c)
		}
	}
	walk(p)
	return out.String()
}

func TestUpstreamMessyDocumentRepairRoundTrip(t *testing.T) {
	root, fixtures := upstreamFixtures(t)
	var raw []byte
	for _, f := range fixtures.Files {
		if f.Name == "messy.docx" {
			raw, _ = os.ReadFile(filepath.Join(root, f.Path))
			break
		}
	}
	if len(raw) == 0 {
		t.Fatal("missing upstream messy fixture")
	}
	source, e := Open(raw)
	if e != nil {
		t.Fatal(e)
	}
	m := NormalizeLayout(source.Model)
	for _, p := range source.Model.Paragraphs() {
		if strings.Contains(p.Text, "筹画") || strings.Contains(p.Text, "分包专业") {
			t.Logf("protected=%v locked=%v text=%s XML=%s", p.Protected, p.FormatLocked, p.Text, source.elements[p.ID].FullTag())
		}
	}
	for step := 0; step < 100; step++ {
		inspection, e := Inspect(m)
		if e != nil {
			t.Fatal(e)
		}
		changed := false
		for _, f := range inspection.Issues {
			if f.Replacement != "" {
				m, e = ApplyFinding(m, f.ID)
				if e != nil {
					t.Fatal(e)
				}
				changed = true
				break
			}
		}
		if !changed {
			break
		}
	}
	out, e := source.Export(m, true)
	if e != nil {
		t.Fatal(e)
	}
	fixed, e := Open(out)
	if e != nil {
		t.Fatal(e)
	}
	assertValidOwnRevisionMarkup(t, fixed)
	for _, want := range []string{"×发改〔2026〕12号", "各县（市、区）发展改革局：", "筹划项目，于2026年5月8日前报送", "（详见附件）。", "100 kWh", "2026年10月13日", "分包专业：装饰工程"} {
		if !strings.Contains(fixed.Model.Text(), want) {
			t.Errorf("missing repaired content %s; got %s", want, fixed.Model.Text())
		}
	}
	if !bytes.Contains(fixed.Parts["word/document.xml"], []byte(`w:author="审核人"`)) {
		t.Fatal("existing revisions removed")
	}
	if !bytes.Contains(fixed.Parts["word/document.xml"], []byte("rIdLink")) {
		t.Fatal("hyperlink removed")
	}
	rejectOwnChanges(fixed.XML)
	for i, p := range bodyParagraphElements(child(fixed.XML.Root(), "body")) {
		if got := readVisibleParagraph(p); got != source.Model.Paragraphs()[i].Text {
			t.Errorf("reject changed paragraph %d: %q != %q", i, got, source.Model.Paragraphs()[i].Text)
		}
	}
	r, e := Inspect(m)
	if e != nil {
		t.Fatal(e)
	}
	var comments []ReviewComment
	for _, f := range r.Issues {
		if strings.HasPrefix(f.Rule, "number.") && f.ParagraphID != "" {
			comments = append(comments, ReviewComment{f.ParagraphID, f.Message})
		}
	}
	out, e = AddReviewComments(out, m, comments)
	if e != nil {
		t.Fatal(e)
	}
	withComments, e := Open(out)
	if e != nil {
		t.Fatal(e)
	}
	if !bytes.Contains(withComments.Parts["word/comments.xml"], []byte("合计")) {
		t.Fatal("numeric finding not in Word comment")
	}
	output := "../../build/qa/upstream-parity"
	os.MkdirAll(output, 0700)
	os.WriteFile(filepath.Join(output, "go-messy-reviewed.docx"), out, 0600)
}

type parityFixtures struct {
	TextCases [][]string `json:"textCases"`
	Files     []struct {
		Name string `json:"name"`
		Path string `json:"path"`
	} `json:"files"`
}

func upstreamFixtures(t *testing.T) (string, parityFixtures) {
	t.Helper()
	root := "../../testdata/upstream/parity"
	b, e := os.ReadFile(filepath.Join(root, "manifest.json"))
	if e != nil {
		t.Fatal(e)
	}
	var f parityFixtures
	if e = json.Unmarshal(b, &f); e != nil {
		t.Fatal(e)
	}
	return root, f
}
func TestUpstreamNegativeAndPositiveFixtures(t *testing.T) {
	root, f := upstreamFixtures(t)
	want := map[string]string{"版心错": "format.margin", "序数错": "format.heading-sequence", "日期错": "date.chinese-year", "虚位错": "date.inline-padding", "文号错": "reference.format", "括号错": "punctuation.half", "异形词": "word.variant", "半角标点": "punctuation.half", "合计错": "number.table-total", "多段小计错": "number.table-total", "手写表合计错": "number.table-total", "单项合计错": "number.table-total", "计数标题": "number.enumeration", "计数行内": "number.enumeration", "正文异值": "number.repeated-metric", "正文表格异值": "number.text-table", "千分位": "number.repeated-metric"}
	for _, file := range f.Files {
		if !strings.HasPrefix(file.Path, "negative/") {
			continue
		}
		t.Run(file.Name, func(t *testing.T) {
			b, e := os.ReadFile(filepath.Join(root, file.Path))
			if e != nil {
				t.Fatal(e)
			}
			p, e := Open(b)
			if e != nil {
				t.Fatal(e)
			}
			r, e := Inspect(p.Model)
			if e != nil {
				t.Fatal(e)
			}
			name := strings.TrimSuffix(file.Name, ".docx")
			rule := want[name]
			found := false
			for _, issue := range r.Issues {
				if issue.Rule == rule {
					found = true
				}
				if rule == "" && strings.HasPrefix(issue.Rule, "number.") {
					t.Errorf("upstream passing fixture has numeric false positive: %+v", issue)
				}
			}
			if rule != "" && !found {
				t.Fatalf("missing %s: %+v", rule, r.Issues)
			}
		})
	}
}
func TestUpstreamTextFixPairs(t *testing.T) {
	_, f := upstreamFixtures(t)
	for _, c := range f.TextCases {
		t.Run(c[0], func(t *testing.T) {
			m := Plain("标题\n" + c[1])
			for step := 0; step < 30; step++ {
				r, e := Inspect(m)
				if e != nil {
					t.Fatal(e)
				}
				changed := false
				for _, issue := range r.Issues {
					if issue.ParagraphID == "p1" && issue.Replacement != "" {
						m, e = ApplyFinding(m, issue.ID)
						if e != nil {
							t.Fatal(e)
						}
						changed = true
						break
					}
				}
				if !changed {
					break
				}
			}
			if got := m.Blocks[1].Paragraph.Text; got != c[2] {
				t.Fatalf("got %q; want %q", got, c[2])
			}
		})
	}
}

// Sparse upstream defaults used to be silently treated as gongwen formatting.
// Preserve the original on plain export; explicitly requested normalization may
// now repair that uncertainty, while all authored text must remain intact.
func TestUpstreamDocumentsPreserveOriginalAndNormalizeWithoutTextLoss(t *testing.T) {
	root, f := upstreamFixtures(t)
	for _, file := range f.Files {
		if strings.HasPrefix(file.Path, "negative/") || strings.Contains(file.Name, "修订") || file.Name == "messy.docx" || file.Name == "accepted.docx" {
			continue
		}
		t.Run(file.Name, func(t *testing.T) {
			b, e := os.ReadFile(filepath.Join(root, file.Path))
			if e != nil {
				t.Fatal(e)
			}
			p, e := Open(b)
			if e != nil {
				t.Fatal(e)
			}
			plain, err := p.Export(p.Model, false)
			if err != nil || !bytes.Equal(b, plain) {
				t.Fatal("plain export changed original", err)
			}
			m := NormalizeLayout(p.Model)
			out, e := p.Export(m, true)
			if e != nil {
				t.Fatal(e)
			}
			if !strings.Contains(strings.Join(p.Model.Warnings, " "), "未明确声明") && !bytes.Equal(b, out) {
				t.Fatal("fully declared compliant input modified")
			}
			after, err := Open(out)
			if err != nil {
				t.Fatal(err)
			}
			for i, para := range p.Model.Paragraphs() {
				if after.Model.Paragraphs()[i].Text != para.Text {
					t.Fatalf("normalization changed authored paragraph %d", i)
				}
			}

		})
	}
}
