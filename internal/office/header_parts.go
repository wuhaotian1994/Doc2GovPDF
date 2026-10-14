package office

import "strings"

func addFirstPageParts(parts map[string]string, m Model) {
	for _, kind := range []string{"header", "footer"} {
		ps := m.FirstHeader
		tag := "hdr"
		id := "headerFirst"
		if kind == "footer" {
			ps = m.FirstFooter
			tag = "ftr"
			id = "footerFirst"
		}
		if len(ps) == 0 {
			continue
		}
		var body strings.Builder
		for _, p := range ps {
			body.WriteString(paragraphXML(p))
		}
		name := "word/" + kind + "-first.xml"
		parts[name] = `<w:` + tag + ` xmlns:w="` + W + `">` + body.String() + `</w:` + tag + `>`
		parts["[Content_Types].xml"] = strings.Replace(parts["[Content_Types].xml"], "</Types>", `<Override PartName="/`+name+`" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.`+kind+`+xml"/></Types>`, 1)
		parts["word/_rels/document.xml.rels"] = strings.Replace(parts["word/_rels/document.xml.rels"], "</Relationships>", `<Relationship Id="`+id+`" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/`+kind+`" Target="`+kind+`-first.xml"/></Relationships>`, 1)
	}
}
