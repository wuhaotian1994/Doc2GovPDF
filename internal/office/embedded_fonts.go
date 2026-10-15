package office

import (
	"crypto/sha256"
	"fmt"
	"sort"
	"strings"
)

// Only the OFL fallback faces are embedded. Installed system fonts are not
// redistributed; a missing face is explicitly named as a fallback in the file.
func addFallbackFonts(parts map[string]string) map[string][]byte {
	used := map[string]fontData{}
	for name, xml := range parts {
		if !strings.HasSuffix(name, ".xml") || name == "[Content_Types].xml" {
			continue
		}
		d, e := parseXML([]byte(xml))
		if e != nil {
			continue
		}
		for _, fontsElement := range d.FindElements("//w:rFonts") {
			for _, key := range []string{"ascii", "hAnsi", "eastAsia", "cs"} {
				declared := attr(fontsElement, key)
				if declared == "" {
					continue
				}
				face := resolveFont(declared)
				if strings.HasPrefix(face.name, "Noto Serif SC") {
					fontsElement.RemoveAttr("w:" + key)
					fontsElement.CreateAttr("w:"+key, face.name)
					used[face.name] = face
				}
			}
		}
		if data, e := d.WriteToString(); e == nil {
			parts[name] = data
		}
	}
	files := map[string][]byte{}
	if len(used) == 0 {
		return files
	}
	names := []string{}
	for name := range used {
		names = append(names, name)
	}
	sort.Strings(names)
	var table, rels strings.Builder
	table.WriteString(`<w:fonts xmlns:w="` + W + `" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`)
	rels.WriteString(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`)
	for i, name := range names {
		face := used[name]
		sum := sha256.Sum256(face.data)
		key := fmt.Sprintf("{%X-%X-%X-%X-%X}", sum[:4], sum[4:6], sum[6:8], sum[8:10], sum[10:16])
		data := append([]byte{}, face.data...)
		for n := 0; n < 32; n++ {
			data[n] ^= sum[15-n%16]
		}
		file := fmt.Sprintf("font%d.odttf", i+1)
		id := fmt.Sprintf("font%d", i+1)
		files["word/fonts/"+file] = data
		fmt.Fprintf(&table, `<w:font w:name="%s"><w:family w:val="roman"/><w:pitch w:val="variable"/><w:embedRegular r:id="%s" w:fontKey="%s"/></w:font>`, xmlText(name), id, key)
		fmt.Fprintf(&rels, `<Relationship Id="%s" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="fonts/%s"/>`, id, file)
	}
	table.WriteString(`</w:fonts>`)
	rels.WriteString(`</Relationships>`)
	parts["word/fontTable.xml"] = table.String()
	parts["word/_rels/fontTable.xml.rels"] = rels.String()
	parts["word/settings.xml"] = strings.Replace(parts["word/settings.xml"], "</w:settings>", `<w:embedTrueTypeFonts/><w:doNotEmbedSystemFonts/><w:saveSubsetFonts w:val="0"/></w:settings>`, 1)
	parts["[Content_Types].xml"] = strings.Replace(parts["[Content_Types].xml"], "</Types>", `<Default Extension="odttf" ContentType="application/vnd.openxmlformats-officedocument.obfuscatedFont"/><Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/></Types>`, 1)
	parts["word/_rels/document.xml.rels"] = strings.Replace(parts["word/_rels/document.xml.rels"], "</Relationships>", `<Relationship Id="fonts" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/></Relationships>`, 1)
	return files
}
