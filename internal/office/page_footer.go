package office

func pageFooterXML(align string) string {
	return `<w:ftr xmlns:w="` + W + `"><w:p><w:pPr><w:ind w:left="280" w:right="280" w:firstLine="0"/><w:spacing w:before="0" w:after="0" w:line="280" w:lineRule="exact"/><w:jc w:val="` + align + `"/></w:pPr><w:r><w:rPr><w:snapToGrid w:val="0"/><w:spacing w:val="0"/><w:rFonts w:ascii="SimSun" w:hAnsi="SimSun" w:eastAsia="宋体"/><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">— </w:t></w:r><w:fldSimple w:instr="PAGE"><w:r><w:rPr><w:snapToGrid w:val="0"/><w:spacing w:val="0"/><w:rFonts w:ascii="SimSun" w:hAnsi="SimSun" w:eastAsia="宋体"/><w:sz w:val="28"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple><w:r><w:rPr><w:snapToGrid w:val="0"/><w:spacing w:val="0"/><w:rFonts w:ascii="SimSun" w:hAnsi="SimSun" w:eastAsia="宋体"/><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve"> —</w:t></w:r></w:p></w:ftr>`
}
