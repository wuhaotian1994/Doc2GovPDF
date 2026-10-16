package office

import (
	"fmt"
	"github.com/beevik/etree"
	"path"
	"strings"
)

func normalizedFooterParts(parts map[string][]byte, doc *etree.Document) (map[string][]byte, error) {
	overrides := map[string][]byte{}
	rels, e := parseXML(parts["word/_rels/document.xml.rels"])
	if e != nil || rels.Root() == nil {
		rels = etree.NewDocument()
		rels.CreateElement("Relationships").CreateAttr("xmlns", "http://schemas.openxmlformats.org/package/2006/relationships")
	}
	targets := map[string]string{}
	ids := map[string]bool{}
	for _, r := range rels.Root().ChildElements() {
		targets[attr(r, "Id")] = path.Join("word", attr(r, "Target"))
		ids[attr(r, "Id")] = true
	}
	good := func(id string) bool {
		data := string(parts[targets[id]])
		return strings.Contains(data, "PAGE") && (strings.Contains(data, "SimSun") || strings.Contains(data, "宋体")) && strings.Contains(data, `w:val="28"`)
	}
	var sections []*etree.Element
	for _, section := range descendants(child(doc.Root(), "body"), "sectPr") {
		if section.Parent() != nil && section.Parent().Tag == "sectPrChange" {
			continue
		}
		def, even := "", ""
		for _, r := range childElements(section, "footerReference") {
			if attr(r, "type") == "default" {
				def = attr(r, "id")
			}
			if attr(r, "type") == "even" {
				even = attr(r, "id")
			}
		}
		if !good(def) || !good(even) {
			sections = append(sections, section)
		}
	}
	if len(sections) == 0 {
		return overrides, nil
	}
	types, e := parseXML(parts["[Content_Types].xml"])
	if e != nil || types.Root() == nil {
		return nil, fmt.Errorf("文档部件类型声明无效")
	}
	refs := map[string]string{}
	for _, kind := range []string{"default", "even"} {
		file := "word/footer-doc2govpdf-" + kind + ".xml"
		for len(parts[file]) > 0 {
			file = strings.TrimSuffix(file, ".xml") + "x.xml"
		}
		id := "pageFooter-" + kind
		for ids[id] {
			id += "x"
		}
		refs[kind] = id
		align := "right"
		if kind == "even" {
			align = "left"
		}
		overrides[file] = []byte(pageFooterXML(align))
		r := rels.Root().CreateElement("Relationship")
		r.CreateAttr("Id", id)
		r.CreateAttr("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer")
		r.CreateAttr("Target", strings.TrimPrefix(file, "word/"))
		c := types.Root().CreateElement("Override")
		c.CreateAttr("PartName", "/"+file)
		c.CreateAttr("ContentType", "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml")
	}
	for _, section := range sections {
		for _, r := range childElements(section, "footerReference") {
			if attr(r, "type") != "first" {
				section.RemoveChild(r)
			}
		}
		hasEvenHeader := false
		var defaultHeader *etree.Element
		for _, r := range childElements(section, "headerReference") {
			if attr(r, "type") == "default" {
				defaultHeader = r
			}
			if attr(r, "type") == "even" {
				hasEvenHeader = true
			}
		}
		if defaultHeader != nil && !hasEvenHeader {
			copy := defaultHeader.Copy()
			copy.CreateAttr("w:type", "even")
			section.InsertChildAt(defaultHeader.Index()+1, copy)
		}
		at := 0
		for _, r := range section.ChildElements() {
			if r.Tag == "headerReference" {
				at = r.Index() + 1
			}
		}
		for _, kind := range []string{"default", "even"} {
			r := etree.NewElement("w:footerReference")
			r.CreateAttr("w:type", kind)
			r.CreateAttr("r:id", refs[kind])
			section.InsertChildAt(at, r)
			at++
		}
	}
	doc.Root().CreateAttr("xmlns:r", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")
	settings, e := parseXML(parts["word/settings.xml"])
	if e != nil || settings.Root() == nil {
		settings = etree.NewDocument()
		settings.CreateElement("w:settings").CreateAttr("xmlns:w", W)
		r := rels.Root().CreateElement("Relationship")
		r.CreateAttr("Id", "repairSettings")
		r.CreateAttr("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings")
		r.CreateAttr("Target", "settings.xml")
		c := types.Root().CreateElement("Override")
		c.CreateAttr("PartName", "/word/settings.xml")
		c.CreateAttr("ContentType", "application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml")
	}
	if child(settings.Root(), "evenAndOddHeaders") == nil {
		settings.Root().CreateElement("w:evenAndOddHeaders")
	}
	if child(settings.Root(), "characterSpacingControl") == nil {
		settings.Root().CreateElement("w:characterSpacingControl").CreateAttr("w:val", "compressPunctuation")
	}
	for name, d := range map[string]*etree.Document{"word/_rels/document.xml.rels": rels, "[Content_Types].xml": types, "word/settings.xml": settings} {
		b, e := d.WriteToBytes()
		if e != nil {
			return nil, e
		}
		overrides[name] = b
	}
	return overrides, nil
}
