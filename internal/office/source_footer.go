package office

import (
	"fmt"
	"github.com/beevik/etree"
	"path"
	"strings"
)

// Package metadata and Word settings may bind their namespace to a prefix
// rather than the default. New children follow their root's qualified namespace.
func sourceFooterNamespacedChild(root *etree.Element, name string) *etree.Element {
	if root.Space != "" {
		name = root.Space + ":" + name
	}
	return root.CreateElement(name)
}

// Add a private footer style only when replacement footers are required.
// Never enable an orphan styles part or assign a meaning to an existing dangling
// source style reference. Existing styles/defaults are retained, not normalized.
func normalizedFooterStyle(parts map[string][]byte, doc, rels, types *etree.Document, ids map[string]bool) (string, string, []byte, error) {
	const styleRel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"
	const styleType = "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"
	var relationships []*etree.Element
	for _, rel := range rels.Root().ChildElements() {
		if attr(rel, "Type") == styleRel {
			relationships = append(relationships, rel)
		}
	}
	if len(relationships) > 1 {
		return "", "", nil, fmt.Errorf("原Word有多个样式关系，未生成规范化副本；原件保留")
	}
	part := ""
	var styles *etree.Document
	if len(relationships) == 1 {
		rel := relationships[0]
		target := attr(rel, "Target")
		if target == "" || attr(rel, "TargetMode") != "" && attr(rel, "TargetMode") != "Internal" || strings.ContainsAny(target, "\\:?#%") {
			return "", "", nil, fmt.Errorf("原Word样式关系不是可解析的内部部件，未生成规范化副本；原件保留")
		}
		if strings.HasPrefix(target, "/") {
			part = path.Clean(strings.TrimPrefix(target, "/"))
		} else {
			part = path.Clean(path.Join("word", target))
		}
		if part == "." || part == ".." || strings.HasPrefix(part, "../") {
			return "", "", nil, fmt.Errorf("原Word样式部件路径无效，未生成规范化副本；原件保留")
		}
		if strings.EqualFold(part, "word/settings.xml") {
			return "", "", nil, fmt.Errorf("原Word样式部件与设置部件路径冲突，未生成规范化副本；原件保留")
		}
		var err error
		styles, err = parseXML(parts[part])
		if err != nil || styles.Root() == nil || styles.Root().Tag != "styles" || styles.Root().NamespaceURI() != W {
			return "", "", nil, fmt.Errorf("原Word样式部件缺失或无效，未生成规范化副本；原件保留")
		}
	} else {
		// An unreferenced word/styles.xml was not active in the receiving app.
		// Keep it untouched and create a new minimal, named-style-only part.
		part = "word/styles-doc2govpdf.xml"
		occupied := map[string]bool{}
		for name := range parts {
			occupied[name] = true
		}
		for _, item := range types.Root().ChildElements() {
			occupied[strings.TrimPrefix(attr(item, "PartName"), "/")] = true
		}
		for occupied[part] {
			part = strings.TrimSuffix(part, ".xml") + "x.xml"
		}
		styles = etree.NewDocument()
		styles.CreateElement("w:styles").CreateAttr("xmlns:w", W)
		rid := "pageFooterStyles"
		for ids[rid] {
			rid += "x"
		}
		ids[rid] = true
		rel := sourceFooterNamespacedChild(rels.Root(), "Relationship")
		rel.CreateAttr("Id", rid)
		rel.CreateAttr("Type", styleRel)
		rel.CreateAttr("Target", strings.TrimPrefix(part, "word/"))
	}
	blocked := map[string]bool{}
	collect := func(root *etree.Element) {
		for _, item := range descendants(root, "style") {
			blocked[attr(item, "styleId")] = true
		}
		for _, name := range []string{"pStyle", "rStyle", "tblStyle", "basedOn", "next", "link", "numStyleLink", "styleLink"} {
			for _, item := range descendants(root, name) {
				blocked[attr(item, "val")] = true
			}
		}
	}
	collect(styles.Root())
	collect(doc.Root())
	for name, raw := range parts {
		if strings.HasSuffix(name, ".xml") {
			if parsed, err := parseXML(raw); err == nil && parsed.Root() != nil {
				collect(parsed.Root())
			}
		}
	}
	id := pageFooterStyleID
	for blocked[id] {
		id += "x"
	}
	// A local namespace binding keeps arbitrary source prefixes untouched.
	markup := strings.Replace(pageFooterStyleXMLForID(id), `<w:style `, `<w:style xmlns:w="`+W+`" `, 1)
	addition, err := parseXML([]byte(markup))
	if err != nil {
		return "", "", nil, err
	}
	styles.Root().AddChild(addition.Root().Copy())
	found := 0
	for _, item := range types.Root().ChildElements() {
		if attr(item, "PartName") == "/"+part {
			found++
			if attr(item, "ContentType") != styleType {
				return "", "", nil, fmt.Errorf("原Word样式类型声明无效，未生成规范化副本；原件保留")
			}
		}
	}
	if found > 1 {
		return "", "", nil, fmt.Errorf("原Word样式类型声明重复，未生成规范化副本；原件保留")
	}
	if found == 0 {
		item := sourceFooterNamespacedChild(types.Root(), "Override")
		item.CreateAttr("PartName", "/"+part)
		item.CreateAttr("ContentType", styleType)
	}
	data, err := styles.WriteToBytes()
	return id, part, data, err
}

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
	if e != nil || types.Root() == nil || types.Root().Tag != "Types" || types.Root().NamespaceURI() != "http://schemas.openxmlformats.org/package/2006/content-types" {
		return nil, fmt.Errorf("文档部件类型声明无效")
	}
	styleID, stylePart, styleData, e := normalizedFooterStyle(parts, doc, rels, types, ids)
	if e != nil {
		return nil, e
	}
	overrides[stylePart] = styleData
	refs := map[string]string{}
	occupiedParts := map[string]bool{}
	for name := range parts {
		occupiedParts[name] = true
	}
	for _, item := range types.Root().ChildElements() {
		occupiedParts[strings.TrimPrefix(attr(item, "PartName"), "/")] = true
	}
	for _, kind := range []string{"default", "even"} {
		file := "word/footer-doc2govpdf-" + kind + ".xml"
		for occupiedParts[file] {
			file = strings.TrimSuffix(file, ".xml") + "x.xml"
		}
		occupiedParts[file] = true
		id := "pageFooter-" + kind
		for ids[id] {
			id += "x"
		}
		refs[kind] = id
		align := "right"
		if kind == "even" {
			align = "left"
		}
		overrides[file] = []byte(pageFooterXMLWithStyle(align, styleID))
		r := sourceFooterNamespacedChild(rels.Root(), "Relationship")
		r.CreateAttr("Id", id)
		r.CreateAttr("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer")
		r.CreateAttr("Target", strings.TrimPrefix(file, "word/"))
		c := sourceFooterNamespacedChild(types.Root(), "Override")
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
		r := sourceFooterNamespacedChild(rels.Root(), "Relationship")
		r.CreateAttr("Id", "repairSettings")
		r.CreateAttr("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings")
		r.CreateAttr("Target", "settings.xml")
		c := sourceFooterNamespacedChild(types.Root(), "Override")
		c.CreateAttr("PartName", "/word/settings.xml")
		c.CreateAttr("ContentType", "application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml")
	}
	if child(settings.Root(), "evenAndOddHeaders") == nil {
		sourceFooterNamespacedChild(settings.Root(), "evenAndOddHeaders")
	}
	if child(settings.Root(), "characterSpacingControl") == nil {
		control := sourceFooterNamespacedChild(settings.Root(), "characterSpacingControl")
		prefix := settings.Root().Space
		if prefix == "" {
			// Default namespaces do not apply to attributes. Bind the value's
			// Word prefix on the new child without altering the source root.
			prefix = "w"
			control.CreateAttr("xmlns:w", W)
		}
		control.CreateAttr(prefix+":val", "compressPunctuation")
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
