package office

import (
	"archive/zip"
	"bytes"
	"context"
	"math"
	"regexp"
	"strings"
	"testing"
)

func sectionFixture(t *testing.T, kind string) []byte {
	t.Helper()
	var buf bytes.Buffer
	z := zip.NewWriter(&buf)
	parts := map[string]string{
		"[Content_Types].xml": `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
		"word/document.xml":   `<?xml version="1.0"?><w:document xmlns:w="` + W + `"><w:body><w:p><w:pPr><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:bottom="1440" w:left="1440" w:right="1440"/></w:sectPr></w:pPr><w:r><w:t>纵向正文及署名日期。</w:t></w:r></w:p><w:p><w:r><w:t>横向附件原表。</w:t></w:r></w:p><w:sectPr>` + kind + `<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="1440" w:bottom="1440" w:left="1440" w:right="1440"/></w:sectPr></w:body></w:document>`,
	}
	for name, data := range parts {
		f, e := z.Create(name)
		if e != nil {
			t.Fatal(e)
		}
		f.Write([]byte(data))
	}
	if e := z.Close(); e != nil {
		t.Fatal(e)
	}
	return buf.Bytes()
}

func TestImportedSectionsKeepWordAndPDFGeometry(t *testing.T) {
	source := sectionFixture(t, "")
	p, e := Open(source)
	if e != nil {
		t.Fatal(e)
	}
	m := p.Model
	if len(m.Blocks) != 2 || m.Blocks[0].Page == nil || m.Blocks[1].Page == nil || m.Blocks[0].Page.Width >= m.Blocks[0].Page.Height || m.Blocks[1].Page.Width <= m.Blocks[1].Page.Height {
		t.Fatalf("section geometry missing: %+v", m)
	}
	unchanged, e := p.Export(m, false)
	if e != nil || !bytes.Equal(source, unchanged) {
		t.Fatal("unchanged source rewritten", e)
	}
	m.Blocks[1].Paragraph.Text += "修订"
	edited, e := p.Export(m, false)
	if e != nil {
		t.Fatal(e)
	}
	q, e := Open(edited)
	if e != nil {
		t.Fatal(e)
	}
	if !strings.Contains(q.Model.Text(), "修订") || *q.Model.Blocks[0].Page != *m.Blocks[0].Page || *q.Model.Blocks[1].Page != *m.Blocks[1].Page {
		t.Fatal("text or original sections changed")
	}
	result, e := RenderPDF(context.Background(), q.Model)
	if e != nil || result.Pages != 2 {
		t.Fatal("mixed sections did not render", result.Pages, e)
	}
	boxes := regexp.MustCompile(`/MediaBox\s*\[0 0 ([0-9.]+) ([0-9.]+)\]`).FindAllSubmatch(result.Data, -1)
	portrait, landscape := false, false
	for _, box := range boxes {
		if string(box[1]) < string(box[2]) {
			portrait = true
		} else {
			landscape = true
		}
	}
	if len(boxes) != 2 || !portrait || !landscape {
		t.Fatalf("mixed page geometries missing: %s", boxes)
	}
}

func TestUnsupportedSectionCanStillKeepWord(t *testing.T) {
	for _, kind := range []string{"continuous", "oddPage", "evenPage"} {
		source := sectionFixture(t, `<w:type w:val="`+kind+`"/>`)
		p, e := Open(source)
		if e != nil {
			t.Fatal(e)
		}
		if !p.Model.PDFUnsupported {
			t.Fatal("unsupported section silently flattened", kind)
		}
		out, e := p.Export(p.Model, false)
		if e != nil || !bytes.Equal(source, out) {
			t.Fatal("Word boundary lost", e)
		}
		if _, e := RenderPDF(context.Background(), p.Model); e == nil {
			t.Fatal("unsupported PDF accepted")
		}
	}
}

func TestSectionGeometryValidated(t *testing.T) {
	p, e := Open(sectionFixture(t, ""))
	if e != nil {
		t.Fatal(e)
	}
	for _, bad := range []float64{-1, math.NaN(), math.Inf(1)} {
		m := p.Model.Clone()
		m.Blocks[0].Page.Width = bad
		if e := m.Validate(); e == nil {
			t.Fatal("invalid section dimensions accepted", bad)
		}
	}
}

func TestImportedCellEdgesAndShadingSurviveModel(t *testing.T) {
	source := sectionFixture(t, "")
	p, e := Open(source)
	if e != nil {
		t.Fatal(e)
	}
	doc, e := parseXML([]byte(`<w:tbl xmlns:w="` + W + `"><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/><w:tcBorders><w:top w:val="nil"/><w:bottom w:val="single" w:sz="4" w:color="DEE0E3"/></w:tcBorders><w:shd w:val="clear" w:fill="F2F3F5"/></w:tcPr><w:p><w:r><w:t>合并表头</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`))
	if e != nil {
		t.Fatal(e)
	}
	body := child(p.XML.Root(), "body")
	body.InsertChildAt(1, doc.Root().Copy())
	xml, e := p.XML.WriteToBytes()
	if e != nil {
		t.Fatal(e)
	}
	var data bytes.Buffer
	z := zip.NewWriter(&data)
	for name, part := range p.Parts {
		if name == "word/document.xml" {
			part = xml
		}
		f, e := z.Create(name)
		if e != nil {
			t.Fatal(e)
		}
		f.Write(part)
	}
	z.Close()
	q, e := Open(data.Bytes())
	if e != nil {
		t.Fatal(e)
	}
	cell := q.Model.Blocks[1].Table.Rows[0].Cells[0]
	if cell.Span != 2 || cell.Fill != "F2F3F5" || cell.Borders["top"].Style != "nil" || cell.Borders["bottom"].Color != "DEE0E3" || math.Abs(cell.Borders["bottom"].Width-25.4/72/2) > .0001 {
		t.Fatalf("lost original cell style: %+v", cell)
	}
	unchanged, e := q.Export(q.Model, false)
	if e != nil || !bytes.Equal(unchanged, data.Bytes()) {
		t.Fatal("cell metadata rewrote original", e)
	}
	if _, e = RenderPDF(context.Background(), q.Model); e != nil {
		t.Fatal(e)
	}
	invalid := q.Model.Clone()
	invalid.Blocks[1].Table.Rows[0].Cells[0].Borders["bottom"] = CellBorder{Style: "single", Width: math.NaN(), Color: "000000"}
	if e := invalid.Validate(); e == nil {
		t.Fatal("invalid border width accepted")
	}
	invalid = q.Model.Clone()
	invalid.Blocks[1].Table.Rows[0].Cells[0].Fill = "bad-color"
	if e := invalid.Validate(); e == nil {
		t.Fatal("invalid shading accepted")
	}
}
