package office

import "strings"

const pageFooterStyleID = "Doc2GovPDFPageNumber"

const pageFooterRunPropertiesXML = `<w:rPr><w:snapToGrid w:val="0"/><w:spacing w:val="0"/><w:rFonts w:ascii="SimSun" w:hAnsi="SimSun" w:eastAsia="宋体"/><w:sz w:val="28"/></w:rPr>`

// Keep dynamic PAGE results in the footer's own 14pt purpose, including after
// a receiving application regenerates the cached result from paragraph style.
func pageFooterStyleXML() string {
	return `<w:style w:type="paragraph" w:styleId="` + pageFooterStyleID + `"><w:name w:val="Doc2GovPDF Page Number"/>` + pageFooterRunPropertiesXML + `</w:style>`
}

func pageFooterXML(align string) string {
	return `<w:ftr xmlns:w="` + W + `"><w:p><w:pPr><w:ind w:left="280" w:right="280" w:firstLine="0"/><w:spacing w:before="0" w:after="0" w:line="280" w:lineRule="exact"/><w:jc w:val="` + align + `"/></w:pPr><w:r>` + pageFooterRunPropertiesXML + `<w:t xml:space="preserve">— </w:t></w:r><w:fldSimple w:instr="PAGE"><w:r>` + pageFooterRunPropertiesXML + `<w:t>1</w:t></w:r></w:fldSimple><w:r>` + pageFooterRunPropertiesXML + `<w:t xml:space="preserve"> —</w:t></w:r></w:p></w:ftr>`
}

// Only new generated documents declare this local style in styles.xml. Source
// normalization keeps pageFooterXML's original shape and cannot reference it.
func generatedPageFooterXML(align string) string {
	return strings.Replace(pageFooterXML(align), `<w:pPr>`, `<w:pPr><w:pStyle w:val="`+pageFooterStyleID+`"/>`, 1)
}
