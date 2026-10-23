package office

import (
	"bytes"
	"doc2govpdf/assets"
	"testing"
)

func TestRegisteredFontAliasIsValidatedAndIndependentAfterReplacement(t *testing.T) {
	browserFontState(t)
	if err := AliasRegisteredFont("宋体", "仿宋"); err == nil {
		t.Fatal("missing source accepted")
	}
	source := append([]byte(nil), assets.FallbackFont...)
	if err := RegisterFont("仿宋", source); err != nil {
		t.Fatal(err)
	}
	if err := AliasRegisteredFont("宋体", "仿宋"); err != nil {
		t.Fatal(err)
	}
	if &fonts["仿宋"].data[0] != &fonts["宋体"].data[0] || fontMaps["仿宋"] != fontMaps["宋体"] {
		t.Fatal("identical face was copied or reparsed")
	}
	source[0] ^= 255
	if !bytes.Equal(fonts["宋体"].data, assets.FallbackFont) {
		t.Fatal("caller mutated registered face")
	}
	if err := RegisterFont("仿宋", assets.FallbackBlackFont); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(fonts["宋体"].data, assets.FallbackFont) {
		t.Fatal("alias changed with later source replacement")
	}
	if err := AliasRegisteredFont("宋体", "Noto Serif SC"); err == nil {
		t.Fatal("unselected fallback source accepted")
	}
	if err := AliasRegisteredFont("unknown", "仿宋"); err == nil {
		t.Fatal("unknown role accepted")
	}
}
