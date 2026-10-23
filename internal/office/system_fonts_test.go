package office

import (
	"bytes"
	"doc2govpdf/assets"
	"strings"
	"testing"
)

func TestLicensedSystemFontEmbeddingDoesNotMutateSourceOrLeakToUserFonts(t *testing.T) {
	browserFontState(t)
	beforeHashes := systemFontHashes
	systemFontHashes = map[string][32]byte{}
	t.Cleanup(func() { systemFontHashes = beforeHashes })
	if err := RegisterSystemFont("仿宋", assets.FallbackFont); err != nil {
		t.Fatal(err)
	}
	before := append([]byte(nil), fonts["仿宋"].data...)
	parts := func() map[string]string {
		return map[string]string{
			"word/document.xml":            `<w:document xmlns:w="` + W + `"><w:body><w:p><w:r><w:rPr><w:rFonts w:eastAsia="仿宋"/></w:rPr><w:t>测试</w:t></w:r></w:p></w:body></w:document>`,
			"word/settings.xml":            `<w:settings xmlns:w="` + W + `"></w:settings>`,
			"[Content_Types].xml":          `<Types></Types>`,
			"word/_rels/document.xml.rels": `<Relationships></Relationships>`,
		}
	}
	p := parts()
	files, err := addFallbackFonts(p)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 1 || !strings.Contains(p["word/fontTable.xml"], "embedRegular") {
		t.Fatal("licensed font was not embedded")
	}
	if !bytes.Equal(before, fonts["仿宋"].data) {
		t.Fatal("embedding mutated registered font")
	}
	if strings.Contains(p["word/document.xml"], "Doc2GovPDF Serif") {
		t.Fatal("licensed identity renamed as fallback")
	}
	if err := RegisterFont("仿宋", assets.FallbackFont); err != nil {
		t.Fatal(err)
	}
	files, err = addFallbackFonts(parts())
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 0 {
		t.Fatal("ordinary selected font inherited deployment provenance")
	}
}
