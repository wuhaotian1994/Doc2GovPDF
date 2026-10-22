package office

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math"
	"reflect"
	"strings"
	"testing"

	"doc2govpdf/assets"
	readpdf "github.com/ledongthuc/pdf"
)

func jointFixture(names []string) Fields {
	first := ""
	if len(names) > 0 {
		first = names[0]
	}
	return Fields{Kind: "plain", Title: "多人签发机制核对", Body: "正文数字12.50保持。", Reference: "RAW-X17", Signer: first, Signers: names}
}
func jointParagraphs(m Model) []*Paragraph {
	var out []*Paragraph
	for _, b := range m.Blocks {
		if b.Paragraph != nil && b.Paragraph.Role == "signer" {
			out = append(out, b.Paragraph)
		}
	}
	return out
}
func jointPDFFirst(t *testing.T, m Model, starts ...string) map[string]readpdf.Text {
	t.Helper()
	result, err := RenderPDF(context.Background(), m)
	if err != nil {
		t.Fatal(err)
	}
	pdf, err := readpdf.NewReader(bytes.NewReader(result.Data), int64(len(result.Data)))
	if err != nil {
		t.Fatal(err)
	}
	points := map[string]readpdf.Text{}
	for page := 1; page <= pdf.NumPage(); page++ {
		for _, run := range pdf.Page(page).Content().Text {
			for _, start := range starts {
				if strings.HasPrefix(run.S, start) {
					if _, exists := points[start]; !exists {
						points[start] = run
					}
				}
			}
		}
	}
	for _, start := range starts {
		if _, exists := points[start]; !exists {
			t.Fatal("missing actual PDF text", start)
		}
	}
	return points
}

func TestJointSignersPreserveOrderedRepeatsWithoutChangingAgencyCleanup(t *testing.T) {
	loadFullFallbackTestFonts(t)
	f := jointFixture([]string{"甲明", "乙", "甲明"})
	f.Agencies = []string{"同机关", "同机关"}
	original, _ := json.Marshal(f)
	clean, err := validateExtraFields(f)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(clean.Signers, f.Signers) || len(clean.Agencies) != 1 {
		t.Fatal("signers deduplicated or agency rule changed", clean.Signers, clean.Agencies)
	}
	m, err := NewDocument(f)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Count(m.Text(), "甲明") != 2 {
		t.Fatal("ordered repeated names lost")
	}
	after, _ := json.Marshal(f)
	if !bytes.Equal(original, after) {
		t.Fatal("input mutated")
	}
	word, err := CreateDOCX(m)
	if err != nil {
		t.Fatal(err)
	}
	p, err := Open(word)
	if err != nil || strings.Count(p.Model.Text(), "甲明") != 2 {
		t.Fatal("actual Word lost repeated name", err)
	}
	same, err := p.Export(p.Model, false)
	if err != nil || !bytes.Equal(same, word) {
		t.Fatal("unmodified imported Word changed", err)
	}
}

func TestJointSignersUseThreeFixedTabsAndRowMajorOrderAtSixteenPoints(t *testing.T) {
	loadFullFallbackTestFonts(t)
	names := []string{"甲", "乙乙", "丙丙丙", "丁丁丁丁", "戊"}
	m, err := NewDocument(jointFixture(names))
	if err != nil {
		t.Fatal(err)
	}
	ps := jointParagraphs(m)
	if len(ps) != 3 {
		t.Fatal(len(ps))
	}
	expected := []string{"\t签发人：\t甲\t乙乙", "\t\t丙丙丙\t丁丁丁丁", "RAW-X17\t\t戊"}
	for i, p := range ps {
		if p.Text != expected[i] || p.Size != 16 || p.Font != "楷体" || p.LeftIndent != 0 || p.Indent != 5.64 || len(p.Tabs) != 3 {
			t.Fatal("row shape", i, p)
		}
		if !reflect.DeepEqual(ps[0].Tabs, p.Tabs) || strings.Contains(p.Text, "　") {
			t.Fatal("column drift or padding facts", i)
		}
		if !(p.Tabs[0].Position < p.Tabs[1].Position && p.Tabs[1].Position < p.Tabs[2].Position) {
			t.Fatal("invalid ordered tabs")
		}
	}
	title := -1
	last := -1
	for i, b := range m.Blocks {
		if b.Paragraph == nil {
			continue
		}
		if b.Paragraph.Role == "title" {
			title = i
		}
		if b.Paragraph.Role == "signer" {
			last = i
		}
	}
	if last >= title {
		t.Fatal("joint signer rows are not before plain title")
	}
}

func TestJointSignersActualWordTabsAndDistinctRoleRunsMatchPDFColumns(t *testing.T) {
	loadFullFallbackTestFonts(t)
	// Distinct controlled OFL faces prove role separation. These aliases do not
	// claim the assets are the national-standard FangSong or KaiTi typefaces.
	if err := RegisterFont("仿宋", assets.FallbackFont); err != nil {
		t.Fatal(err)
	}
	if err := RegisterFont("楷体", assets.FallbackBlackFont); err != nil {
		t.Fatal(err)
	}
	m, err := NewDocument(jointFixture([]string{"甲", "乙乙", "丙丙丙", "丁丁丁丁", "戊"}))
	if err != nil {
		t.Fatal(err)
	}
	word, err := CreateDOCX(m)
	if err != nil {
		t.Fatal(err)
	}
	package_, err := Open(word)
	if err != nil {
		t.Fatal(err)
	}
	doc, err := parseXML(package_.Parts["word/document.xml"])
	if err != nil {
		t.Fatal(err)
	}
	count := 0
	for _, paragraph := range doc.FindElements("//w:body/w:p") {
		var text strings.Builder
		for _, node := range descendants(paragraph, "t") {
			text.WriteString(node.Text())
		}
		if !strings.ContainsAny(text.String(), "甲乙丙丁戊") {
			continue
		}
		modelp := jointParagraphs(m)[count]
		count++
		tabs := child(child(paragraph, "pPr"), "tabs")
		if tabs == nil || len(tabs.ChildElements()) != 3 {
			t.Fatal("Word did not preserve all three tab positions")
		}
		for i, tab := range tabs.ChildElements() {
			if attr(tab, "val") != "left" || attr(tab, "pos") != fmtInt(twips(modelp.Tabs[i].Position)) {
				t.Fatal("Word tab differs from model")
			}
		}
		for _, run := range descendants(paragraph, "r") {
			font := attr(child(child(run, "rPr"), "rFonts"), "eastAsia")
			if attr(child(child(run, "rPr"), "sz"), "val") != "32" {
				t.Fatal("Word shrank run")
			}
			var runText strings.Builder
			for _, node := range descendants(run, "t") {
				runText.WriteString(node.Text())
			}
			if strings.Contains(runText.String(), "RAW-X17") || strings.Contains(runText.String(), "签发人：") {
				if font != "Noto Serif SC" {
					t.Fatal("reference/label not FangSong role face", font)
				}
			}
			if strings.ContainsAny(runText.String(), "甲乙丙丁戊") && font != "Noto Serif SC Black" {
				t.Fatal("names not KaiTi role face", font)
			}
		}
	}
	if count != 3 {
		t.Fatal("Word joint row count", count)
	}
	points := jointPDFFirst(t, m, "甲", "乙", "丙", "丁", "戊", "R", "签", "多")
	close := func(a, b float64) bool { return math.Abs(a-b) < .1 }
	if !close(points["甲"].X, points["丙"].X) || !close(points["甲"].X, points["戊"].X) || !close(points["乙"].X, points["丁"].X) {
		t.Fatal("actual PDF columns drift", points)
	}
	if !close(points["甲"].Y, points["乙"].Y) || !close(points["丙"].Y, points["丁"].Y) || !close(points["R"].Y, points["戊"].Y) || !close(points["签"].Y, points["甲"].Y) {
		t.Fatal("actual PDF baselines differ", points)
	}
	if points["甲"].Font == points["R"].Font || points["R"].Font != points["签"].Font {
		t.Fatal("PDF reference/label/name role font identity lost", points)
	}
	if points["戊"].Y <= points["多"].Y {
		t.Fatal("title no longer follows signer group")
	}
	t.Logf("actual PDF columns in points first=%.2f second=%.2f; final reference/name baseline=%.2f/%.2f", points["甲"].X, points["乙"].X, points["R"].Y, points["戊"].Y)
}

func TestJointSignersRejectUnfittableFactsWithoutMutatingOrTruncating(t *testing.T) {
	loadFullFallbackTestFonts(t)
	cases := []Fields{jointFixture(append(make([]string, 0), strings.Repeat("甲", 61), "乙")), jointFixture([]string{strings.Repeat("甲", 24), strings.Repeat("乙", 24)}), jointFixture([]string{"甲", "乙"}), jointFixture([]string{"甲\t", "乙"}), jointFixture([]string{"甲\n乙", "丙"}), jointFixture([]string{"甲\x01", "乙"})}
	cases[2].Reference = strings.Repeat("文", 40)
	repeated := jointFixture([]string{})
	repeated.Signers = make([]string, 13)
	for i := range repeated.Signers {
		repeated.Signers[i] = "同名"
	}
	repeated.Signer = "同名"
	cases = append(cases, repeated)
	total := jointFixture([]string{})
	for i := 0; i < 12; i++ {
		total.Signers = append(total.Signers, strings.Repeat("i", 21))
	}
	total.Signer = total.Signers[0]
	cases = append(cases, total)
	multilineRef := jointFixture([]string{"甲", "乙"})
	multilineRef.Reference = "原号\t17"
	cases = append(cases, multilineRef)
	for i, f := range cases {
		before, _ := json.Marshal(f)
		if _, err := NewDocument(f); err == nil {
			t.Fatal("unfittable or invalid input accepted", i)
		}
		after, _ := json.Marshal(f)
		if !bytes.Equal(before, after) {
			t.Fatal("input changed", i)
		}
	}
}

func TestJointSignersTwelveRepeatedNamesAndBlankReferenceStayIntact(t *testing.T) {
	loadFullFallbackTestFonts(t)
	names := make([]string, 12)
	for i := range names {
		names[i] = "同名"
	}
	f := jointFixture(names)
	f.Reference = ""
	m, err := NewDocument(f)
	if err != nil {
		t.Fatal(err)
	}
	if len(jointParagraphs(m)) != 6 || strings.Count(m.Text(), "同名") != 12 {
		t.Fatal("repeats or rows lost")
	}
	if _, err := RenderPDF(context.Background(), m); err != nil {
		t.Fatal("empty reference did not consume tab index", err)
	}
	if _, err := CreateDOCX(m); err != nil {
		t.Fatal(err)
	}
}

func TestJointSignersSingleAndEmptyKeepExistingModelPaths(t *testing.T) {
	loadFullFallbackTestFonts(t)
	for _, name := range []string{"", "单签发"} {
		f := jointFixture(nil)
		f.Signer = name
		old, err := NewDocument(f)
		if err != nil {
			t.Fatal(err)
		}
		if len(jointParagraphs(old)) != 0 {
			t.Fatal("single signer path changed role")
		}
		if name == "" {
			f.Signers = []string{" ", ""}
		} else {
			f.Signers = []string{name}
		}
		compatible, err := NewDocument(f)
		if err != nil {
			t.Fatal(err)
		}
		left, _ := json.Marshal(old)
		right, _ := json.Marshal(compatible)
		if !bytes.Equal(left, right) {
			t.Fatal("single/empty optional list changed output")
		}
	}
}

func TestJointSignersNonstandardReferenceAndNameSpellingDoNotSelectFonts(t *testing.T) {
	loadFullFallbackTestFonts(t)
	if err := RegisterFont("仿宋", assets.FallbackFont); err != nil {
		t.Fatal(err)
	}
	if err := RegisterFont("楷体", assets.FallbackBlackFont); err != nil {
		t.Fatal(err)
	}
	f := jointFixture([]string{"甲〔原〕号", "乙"})
	m, err := NewDocument(f)
	if err != nil {
		t.Fatal(err)
	}
	points := jointPDFFirst(t, m, "R", "甲", "乙", "签")
	if points["甲"].Font != points["乙"].Font || points["R"].Font != points["签"].Font || points["R"].Font == points["甲"].Font {
		t.Fatal("spelling heuristics overrode explicit role", points)
	}
}

func fmtInt(value int) string { return fmt.Sprint(value) }

func TestJointSignersLabelTabHasPositiveFullWidthClearance(t *testing.T) {
	loadFullFallbackTestFonts(t)
	f := jointFixture([]string{"甲甲甲", "乙乙乙", "丙丙丙"})
	f.Reference = ""
	stops, err := jointSignerTabStops(f)
	if err != nil {
		t.Fatal(err)
	}
	fullLabel := 4 * 16 * 25.4 / 72
	if stops[1].Position-stops[0].Position < fullLabel+.29 {
		t.Fatal("label can end exactly on or beyond the first-name stop")
	}
	if twips(stops[1].Position)-twips(stops[0].Position) <= twips(fullLabel) {
		t.Fatal("clearance lost to DOCX twip rounding")
	}
	// Only reserve the label gap: both measured name columns retain their prior positions.
	second := 150.36 - jointSignerAdvance(f.Signers[1], "楷体")
	first := second - 2*16*25.4/72 - jointSignerAdvance(f.Signers[0], "楷体")
	if math.Abs(stops[1].Position-first) > .000001 || math.Abs(stops[2].Position-second) > .000001 {
		t.Fatal("name columns moved")
	}
}

func TestJointSignersContinuationReferenceMustReachTheLabelStopBeforeNameStops(t *testing.T) {
	loadFullFallbackTestFonts(t)
	f := jointFixture([]string{"甲", "乙乙", "丙丙丙"})
	f.Reference = ""
	stops, err := jointSignerTabStops(f)
	if err != nil {
		t.Fatal(err)
	}
	between := ""
	for count := 1; count <= 60; count++ {
		candidate := strings.Repeat("文", count)
		end := 5.64 + jointSignerAdvance(candidate, "仿宋")
		if end > stops[0].Position && end < stops[1].Position-.3 {
			between = candidate
			break
		}
	}
	if between == "" {
		t.Fatal("no controlled between-stop fixture")
	}
	f.Reference = between
	before, _ := json.Marshal(f)
	if _, err := NewDocument(f); err == nil || !strings.Contains(err.Error(), "文号过长") {
		t.Fatal("reference would consume the wrong physical tab", err)
	}
	after, _ := json.Marshal(f)
	if !bytes.Equal(before, after) {
		t.Fatal("rejected source changed")
	}
	f.Reference = "RAW-X17"
	if _, err := NewDocument(f); err != nil {
		t.Fatal("short original reference rejected", err)
	}
}
