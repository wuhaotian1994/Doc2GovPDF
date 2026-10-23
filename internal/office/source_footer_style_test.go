package office

import (
	"bytes"
	"encoding/json"
	"github.com/beevik/etree"
	"strings"
	"testing"
)

const sourceFooterStyleRel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"
const sourceFooterStyleType = "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"

func sourceFooterPartsFixture() (map[string][]byte, *etree.Document) {
	parts := map[string][]byte{
		"word/styles.xml":              []byte(`<w:styles xmlns:w="` + W + `"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:eastAsia="Original Family"/><w:sz w:val="32"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Existing Normal"/><w:rPr><w:sz w:val="32"/></w:rPr></w:style></w:styles>`),
		"word/_rels/document.xml.rels": []byte(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="originalStyles" Type="` + sourceFooterStyleRel + `" Target="styles.xml"/><Relationship Id="first" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="first.xml"/></Relationships>`),
		"[Content_Types].xml":          []byte(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/styles.xml" ContentType="` + sourceFooterStyleType + `"/></Types>`),
		"word/settings.xml":            []byte(`<w:settings xmlns:w="` + W + `"/>`),
		"word/first.xml":               []byte(`<w:ftr xmlns:w="` + W + `"><w:p><w:r><w:t>Existing first footer</w:t></w:r></w:p></w:ftr>`),
	}
	doc, _ := parseXML([]byte(`<w:document xmlns:w="` + W + `" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p><w:r><w:t>Original12.50</w:t></w:r></w:p><w:sectPr><w:footerReference w:type="first" r:id="first"/></w:sectPr></w:body></w:document>`))
	return parts, doc
}
func sourceFooterBoundStyle(t *testing.T, overrides map[string][]byte, doc *etree.Document) (string, string, *etree.Document) {
	t.Helper()
	rels, e := parseXML(overrides["word/_rels/document.xml.rels"])
	if e != nil {
		t.Fatal(e)
	}
	stylePart := ""
	targetByID := map[string]string{}
	for _, r := range rels.Root().ChildElements() {
		targetByID[attr(r, "Id")] = attr(r, "Target")
		if attr(r, "Type") == sourceFooterStyleRel {
			if stylePart != "" {
				t.Fatal("duplicate styles relationships")
			}
			stylePart = "word/" + attr(r, "Target")
		}
	}
	if stylePart == "" {
		t.Fatal("style relation missing")
	}
	styles, e := parseXML(overrides[stylePart])
	if e != nil {
		t.Fatal(e)
	}
	ids := map[string]bool{}
	for _, s := range childElements(styles.Root(), "style") {
		ids[attr(s, "styleId")] = true
	}
	chosen := ""
	seen := 0
	for _, section := range descendants(doc.Root(), "sectPr") {
		for _, ref := range childElements(section, "footerReference") {
			if attr(ref, "type") == "first" {
				if attr(ref, "id") != "first" {
					t.Fatal("first footer changed")
				}
				continue
			}
			file := "word/" + targetByID[attr(ref, "id")]
			footer, e := parseXML(overrides[file])
			if e != nil {
				t.Fatal(e)
			}
			pp := child(footer.FindElement("//w:p"), "pPr")
			id := attr(child(pp, "pStyle"), "val")
			if id == "" || !ids[id] || chosen != "" && id != chosen {
				t.Fatal("dangling/inconsistent footer style")
			}
			chosen = id
			seen++
			field := footer.FindElement("//w:fldSimple")
			if attr(field, "instr") != "PAGE" {
				t.Fatal("source replacement added field workaround")
			}
		}
	}
	if seen != 2 {
		t.Fatal("replacement odd/even count changed", seen)
	}
	var selected *etree.Element
	for _, s := range childElements(styles.Root(), "style") {
		if attr(s, "styleId") == chosen {
			selected = s
		}
	}
	rp := child(selected, "rPr")
	if attr(child(rp, "sz"), "val") != "28" || child(rp, "szCs") != nil || attr(child(rp, "rFonts"), "eastAsia") != "宋体" || attr(child(rp, "rFonts"), "cs") != "" {
		t.Fatal("source replacement does not declare bounded14pt宋体 purpose")
	}
	types, e := parseXML(overrides["[Content_Types].xml"])
	if e != nil {
		t.Fatal(e)
	}
	declared := 0
	for _, item := range types.Root().ChildElements() {
		if attr(item, "PartName") == "/"+stylePart {
			if attr(item, "ContentType") != sourceFooterStyleType {
				t.Fatal("wrong styles content type")
			}
			declared++
		}
	}
	if declared != 1 {
		t.Fatal("missing/duplicate styles content type")
	}
	return chosen, stylePart, styles
}

func sourceFooterElementXML(element *etree.Element) string {
	d := etree.NewDocument()
	d.SetRoot(element.Copy())
	text, _ := d.WriteToString()
	return text
}

func TestSourceFooterStylePreservesExistingDefaultsFirstFooterAndUnrelatedStyles(t *testing.T) {
	parts, doc := sourceFooterPartsFixture()
	before, _ := json.Marshal(parts)
	old, e := parseXML(parts["word/styles.xml"])
	if e != nil {
		t.Fatal(e)
	}
	oldDefaults := child(old.Root(), "docDefaults").Copy()
	oldNormal := child(old.Root(), "style").Copy()
	overrides, e := normalizedFooterParts(parts, doc)
	if e != nil {
		t.Fatal(e)
	}
	id, part, styles := sourceFooterBoundStyle(t, overrides, doc)
	if id != pageFooterStyleID || part != "word/styles.xml" {
		t.Fatal("unexpected private style target")
	}
	a := sourceFooterElementXML(oldDefaults)
	b := sourceFooterElementXML(child(styles.Root(), "docDefaults"))
	if a != b {
		t.Fatal("body defaults changed")
	}
	a = sourceFooterElementXML(oldNormal)
	b = sourceFooterElementXML(child(styles.Root(), "style"))
	if a != b {
		t.Fatal("Normal changed")
	}
	if _, changed := overrides["word/first.xml"]; changed {
		t.Fatal("first footer rewritten")
	}
	after, _ := json.Marshal(parts)
	if !bytes.Equal(before, after) {
		t.Fatal("source parts mutated")
	}
}

func TestSourceFooterStyleAvoidsDefinitionsDanglingReferencesAndZeroByteParts(t *testing.T) {
	parts, doc := sourceFooterPartsFixture()
	parts["word/styles.xml"] = bytes.Replace(parts["word/styles.xml"], []byte(`</w:styles>`), []byte(`<w:style w:type="paragraph" w:styleId="`+pageFooterStyleID+`"><w:rPr><w:sz w:val="72"/></w:rPr></w:style></w:styles>`), 1)
	p := doc.FindElement("//w:p")
	pp := p.CreateElement("w:pPr")
	pp.CreateElement("w:pStyle").CreateAttr("w:val", pageFooterStyleID+"x")
	p.CreateElement("w:r").CreateElement("w:rPr").CreateElement("w:rStyle").CreateAttr("w:val", pageFooterStyleID+"xx")
	parts["word/other.xml"] = []byte(`<w:document xmlns:w="` + W + `"><w:tblPr><w:tblStyle w:val="` + pageFooterStyleID + `xxx"/></w:tblPr></w:document>`)
	parts["word/footer-doc2govpdf-default.xml"] = nil
	overrides, e := normalizedFooterParts(parts, doc)
	if e != nil {
		t.Fatal(e)
	}
	id, _, styles := sourceFooterBoundStyle(t, overrides, doc)
	if id != pageFooterStyleID+"xxxx" {
		t.Fatal("source style ID/reference collision not avoided", id)
	}
	if _, exists := overrides["word/footer-doc2govpdf-default.xml"]; exists {
		t.Fatal("zero-byte source part overwritten")
	}
	for _, s := range childElements(styles.Root(), "style") {
		if attr(s, "styleId") == pageFooterStyleID && attr(child(child(s, "rPr"), "sz"), "val") != "72" {
			t.Fatal("existing same-ID style replaced")
		}
	}
}

func TestSourceFooterStyleMissingRelationshipCreatesPrivatePartWithoutEnablingOrphan(t *testing.T) {
	parts, doc := sourceFooterPartsFixture()
	parts["word/_rels/document.xml.rels"] = []byte(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="first" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="first.xml"/><Relationship Id="pageFooterStyles" Type="urn:unrelated" Target="untouched.xml"/></Relationships>`)
	parts["word/styles-doc2govpdf.xml"] = nil
	originalStyles := append([]byte(nil), parts["word/styles.xml"]...)
	overrides, e := normalizedFooterParts(parts, doc)
	if e != nil {
		t.Fatal(e)
	}
	_, part, styles := sourceFooterBoundStyle(t, overrides, doc)
	if part != "word/styles-doc2govpdfx.xml" {
		t.Fatal("occupied zero-length styles part not avoided", part)
	}
	if len(childElements(styles.Root(), "style")) != 1 || child(styles.Root(), "docDefaults") != nil {
		t.Fatal("orphan/default styles were activated")
	}
	if _, changed := overrides["word/styles.xml"]; changed || !bytes.Equal(originalStyles, parts["word/styles.xml"]) {
		t.Fatal("orphan styles changed/enabled")
	}
	rels, _ := parseXML(overrides["word/_rels/document.xml.rels"])
	found := false
	for _, r := range rels.Root().ChildElements() {
		if attr(r, "Type") == sourceFooterStyleRel {
			found = true
			if attr(r, "Id") == "pageFooterStyles" {
				t.Fatal("relationship ID overwritten")
			}
		}
	}
	if !found {
		t.Fatal("style relationship absent")
	}
}

func TestSourceFooterStyleExistingCustomTargetAndPrefixRemainUsable(t *testing.T) {
	parts, doc := sourceFooterPartsFixture()
	parts["word/custom-style.xml"] = []byte(`<s:styles xmlns:s="` + W + `"><s:style s:type="paragraph" s:styleId="Original"><s:rPr><s:sz s:val="32"/></s:rPr></s:style></s:styles>`)
	delete(parts, "word/styles.xml")
	parts["word/_rels/document.xml.rels"] = bytes.Replace(parts["word/_rels/document.xml.rels"], []byte(`Target="styles.xml"`), []byte(`Target="custom-style.xml"`), 1)
	parts["[Content_Types].xml"] = bytes.Replace(parts["[Content_Types].xml"], []byte(`/word/styles.xml`), []byte(`/word/custom-style.xml`), 1)
	overrides, e := normalizedFooterParts(parts, doc)
	if e != nil {
		t.Fatal(e)
	}
	_, part, styles := sourceFooterBoundStyle(t, overrides, doc)
	if part != "word/custom-style.xml" || len(childElements(styles.Root(), "style")) != 2 {
		t.Fatal("custom styles target replaced")
	}
}

func TestSourceFooterStyleInvalidDeclaredStylesFailWithoutMutatingParts(t *testing.T) {
	for _, name := range []string{"missing", "malformed", "wrong-root", "empty-target", "external", "multiple", "wrong-content-type", "duplicate-content-type"} {
		t.Run(name, func(t *testing.T) {
			parts, doc := sourceFooterPartsFixture()
			switch name {
			case "missing":
				delete(parts, "word/styles.xml")
			case "malformed":
				parts["word/styles.xml"] = []byte(`<w:styles`)
			case "wrong-root":
				parts["word/styles.xml"] = []byte(`<w:document xmlns:w="` + W + `"/>`)
			case "empty-target":
				parts["word/_rels/document.xml.rels"] = bytes.Replace(parts["word/_rels/document.xml.rels"], []byte(`Target="styles.xml"`), []byte(`Target=""`), 1)
			case "external":
				parts["word/_rels/document.xml.rels"] = bytes.Replace(parts["word/_rels/document.xml.rels"], []byte(`Target="styles.xml"`), []byte(`Target="https://invalid.example/styles.xml" TargetMode="External"`), 1)
			case "multiple":
				parts["word/_rels/document.xml.rels"] = bytes.Replace(parts["word/_rels/document.xml.rels"], []byte(`</Relationships>`), []byte(`<Relationship Id="secondStyles" Type="`+sourceFooterStyleRel+`" Target="styles.xml"/></Relationships>`), 1)
			case "wrong-content-type":
				parts["[Content_Types].xml"] = bytes.Replace(parts["[Content_Types].xml"], []byte(sourceFooterStyleType), []byte("urn:wrong"), 1)
			case "duplicate-content-type":
				parts["[Content_Types].xml"] = bytes.Replace(parts["[Content_Types].xml"], []byte(`</Types>`), []byte(`<Override PartName="/word/styles.xml" ContentType="`+sourceFooterStyleType+`"/></Types>`), 1)
			}
			before, _ := json.Marshal(parts)
			if _, e := normalizedFooterParts(parts, doc); e == nil {
				t.Fatal("invalid declared style accepted")
			}
			after, _ := json.Marshal(parts)
			if !bytes.Equal(before, after) {
				t.Fatal("failed repair changed source parts")
			}
		})
	}
}

func TestSourceFooterStyleAlreadyAcceptedFootersAreNotUpgraded(t *testing.T) {
	parts, doc := sourceFooterPartsFixture()
	rels, _ := parseXML(parts["word/_rels/document.xml.rels"])
	for _, kind := range []string{"default", "even"} {
		id := "existing-" + kind
		file := kind + ".xml"
		rel := rels.Root().CreateElement("Relationship")
		rel.CreateAttr("Id", id)
		rel.CreateAttr("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer")
		rel.CreateAttr("Target", file)
		parts["word/"+file] = []byte(pageFooterXML("left"))
		ref := doc.FindElement("//w:sectPr").CreateElement("w:footerReference")
		ref.CreateAttr("w:type", kind)
		ref.CreateAttr("r:id", id)
	}
	parts["word/_rels/document.xml.rels"], _ = rels.WriteToBytes()
	// Existing good behavior stays deliberately unchanged, even with styles not
	// parseable for replacement. This is not a claim to inspect every custom field.
	parts["word/styles.xml"] = []byte("not valid XML")
	overrides, e := normalizedFooterParts(parts, doc)
	if e != nil || len(overrides) != 0 {
		t.Fatal("already accepted raw footer was upgraded", e)
	}
	if strings.Contains(string(parts["word/default.xml"]), pageFooterStyleID) {
		t.Fatal("source fixture unexpectedly styled")
	}
}

func TestSourceFooterStyleAvoidsDanglingInheritanceAndNumberingReferences(t *testing.T) {
	for _, ref := range []string{"basedOn", "next", "link", "numStyleLink", "styleLink"} {
		t.Run(ref, func(t *testing.T) {
			parts, doc := sourceFooterPartsFixture()
			parts["word/style-references.xml"] = []byte(`<w:styles xmlns:w="` + W + `"><w:style w:type="paragraph" w:styleId="Other"><w:` + ref + ` w:val="` + pageFooterStyleID + `"/></w:style></w:styles>`)
			overrides, e := normalizedFooterParts(parts, doc)
			if e != nil {
				t.Fatal(e)
			}
			id, _, _ := sourceFooterBoundStyle(t, overrides, doc)
			if id != pageFooterStyleID+"x" {
				t.Fatal("dangling source style reference acquired footer meaning", ref, id)
			}
		})
	}
}

func TestSourceFooterStyleAvoidsContentTypeOnlyFooterPartNames(t *testing.T) {
	parts, doc := sourceFooterPartsFixture()
	parts["[Content_Types].xml"] = bytes.Replace(parts["[Content_Types].xml"], []byte(`</Types>`), []byte(`<Override PartName="/word/footer-doc2govpdf-default.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`), 1)
	overrides, e := normalizedFooterParts(parts, doc)
	if e != nil {
		t.Fatal(e)
	}
	if _, found := overrides["word/footer-doc2govpdf-default.xml"]; found {
		t.Fatal("declared source part name was reused")
	}
	if _, found := overrides["word/footer-doc2govpdf-defaultx.xml"]; !found {
		t.Fatal("replacement footer did not select a free part name")
	}
}

func TestSourceFooterStyleRejectsSettingsAliasBeforeCreatingDanglingReference(t *testing.T) {
	parts, doc := sourceFooterPartsFixture()
	parts["word/settings.xml"] = parts["word/styles.xml"]
	parts["word/_rels/document.xml.rels"] = bytes.Replace(parts["word/_rels/document.xml.rels"], []byte(`Target="styles.xml"`), []byte(`Target="settings.xml"`), 1)
	parts["[Content_Types].xml"] = bytes.Replace(parts["[Content_Types].xml"], []byte(`/word/styles.xml`), []byte(`/word/settings.xml`), 1)
	before, _ := json.Marshal(parts)
	if _, e := normalizedFooterParts(parts, doc); e == nil || !strings.Contains(e.Error(), "路径冲突") {
		t.Fatal("settings alias not explicitly refused", e)
	}
	after, _ := json.Marshal(parts)
	if !bytes.Equal(before, after) {
		t.Fatal("refusal changed original parts")
	}
}

func TestSourceFooterStyleKeepsPrefixedOPCMetadataInTheCorrectNamespace(t *testing.T) {
	for _, existing := range []bool{false, true} {
		t.Run(map[bool]string{false: "new-styles", true: "existing-styles"}[existing], func(t *testing.T) {
			parts, doc := sourceFooterPartsFixture()
			rels := `<op:Relationships xmlns:op="http://schemas.openxmlformats.org/package/2006/relationships"><op:Relationship Id="first" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="first.xml"/>`
			if existing {
				rels += `<op:Relationship Id="originalStyles" Type="` + sourceFooterStyleRel + `" Target="styles.xml"/>`
			}
			rels += `</op:Relationships>`
			parts["word/_rels/document.xml.rels"] = []byte(rels)
			parts["[Content_Types].xml"] = []byte(`<ct:Types xmlns:ct="http://schemas.openxmlformats.org/package/2006/content-types"><ct:Override PartName="/word/styles.xml" ContentType="` + sourceFooterStyleType + `"/></ct:Types>`)
			overrides, e := normalizedFooterParts(parts, doc)
			if e != nil {
				t.Fatal(e)
			}
			sourceFooterBoundStyle(t, overrides, doc)
			for name, ns := range map[string]string{"word/_rels/document.xml.rels": "http://schemas.openxmlformats.org/package/2006/relationships", "[Content_Types].xml": "http://schemas.openxmlformats.org/package/2006/content-types"} {
				d, e := parseXML(overrides[name])
				if e != nil {
					t.Fatal(e)
				}
				for _, item := range d.Root().ChildElements() {
					if item.NamespaceURI() != ns {
						t.Fatal("new OPC metadata escaped its source namespace", name, item.Tag, item.NamespaceURI())
					}
				}
			}
		})
	}
}

func TestSourceFooterStyleKeepsSettingsElementAndAttributeNamespaces(t *testing.T) {
	for _, test := range []struct{ name, markup string }{
		{"prefixed", `<s:settings xmlns:s="` + W + `" untouched="yes"><s:zoom s:percent="120"/></s:settings>`},
		{"default", `<settings xmlns="` + W + `" untouched="yes"><zoom xmlns:s="` + W + `" s:percent="120"/></settings>`},
	} {
		t.Run(test.name, func(t *testing.T) {
			parts, doc := sourceFooterPartsFixture()
			parts["word/settings.xml"] = []byte(test.markup)
			old, e := parseXML(parts["word/settings.xml"])
			if e != nil {
				t.Fatal(e)
			}
			oldAttrs := append([]etree.Attr(nil), old.Root().Attr...)
			oldChild := sourceFooterElementXML(child(old.Root(), "zoom"))
			overrides, e := normalizedFooterParts(parts, doc)
			if e != nil {
				t.Fatal(e)
			}
			settings, e := parseXML(overrides["word/settings.xml"])
			if e != nil {
				t.Fatal(e)
			}
			if len(settings.Root().Attr) != len(oldAttrs) {
				t.Fatal("source settings root attributes changed")
			}
			for i, a := range settings.Root().Attr {
				if a.Space != oldAttrs[i].Space || a.Key != oldAttrs[i].Key || a.Value != oldAttrs[i].Value {
					t.Fatal("source settings root rewritten")
				}
			}
			if sourceFooterElementXML(child(settings.Root(), "zoom")) != oldChild {
				t.Fatal("existing settings child changed")
			}
			even, spacing := child(settings.Root(), "evenAndOddHeaders"), child(settings.Root(), "characterSpacingControl")
			if even == nil || spacing == nil || even.NamespaceURI() != W || spacing.NamespaceURI() != W {
				t.Fatal("new settings element outside Word namespace")
			}
			found := false
			for _, a := range spacing.Attr {
				if a.Key == "val" {
					found = true
					if a.NamespaceURI() != W || a.Value != "compressPunctuation" {
						t.Fatal("settings value attribute not in Word namespace", a.NamespaceURI())
					}
				}
			}
			if !found {
				t.Fatal("settings value absent")
			}
		})
	}
}
