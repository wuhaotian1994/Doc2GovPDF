package office

import (
	"bytes"
	"context"
	"doc2govpdf/assets"
	"os"
	"path/filepath"
	"testing"

	"golang.org/x/image/font/sfnt"
)

func browserFontState(t *testing.T) {
	t.Helper()
	fontCatalog()
	savedFonts, savedMaps, savedComplete := fonts, fontMaps, fallbackComplete
	fonts = map[string]fontData{
		"Noto Serif SC":       {"Noto Serif SC", nil},
		"Noto Serif SC Black": {"Noto Serif SC Black", nil},
	}
	fontMaps = map[string]*sfnt.Font{}
	fallbackComplete = map[string]bool{}
	t.Cleanup(func() { fonts, fontMaps, fallbackComplete = savedFonts, savedMaps, savedComplete })
}

func loadCoreTestFonts(t *testing.T) {
	t.Helper()
	for name, file := range map[string]string{"Noto Serif SC": "NotoSerifSC.ttf", "Noto Serif SC Black": "NotoSerifSC-Black.ttf"} {
		data, err := os.ReadFile(filepath.Join("../../assets/fonts/web", file))
		if err != nil {
			t.Fatal(err)
		}
		if err = RegisterFallbackFont(name, data, false); err != nil {
			t.Fatal(err)
		}
	}
}

func resourceModel(t *testing.T) Model {
	t.Helper()
	m, err := NewDocument(Fields{Kind: "plain", Title: "关于资料整理的通知", Body: "请各部门核对工作记录。\n一、工作要求\n保留原始资料，完成后及时归档。", Agency: "办公室", Date: "2026-10-22"})
	if err != nil {
		t.Fatal(err)
	}
	return m
}

func TestCommonPreviewDoesNotRequireCompleteFontsButWordDoes(t *testing.T) {
	browserFontState(t)
	m := resourceModel(t)
	if len(RequiredFallbackFonts(m, false)) != 2 {
		t.Fatal("missing browser fonts must be requested")
	}
	loadCoreTestFonts(t)
	if needs := RequiredFallbackFonts(m, false); len(needs) != 0 {
		t.Fatalf("common text needs no full font: %+v", needs)
	}
	if _, err := RenderPDF(context.Background(), m); err != nil {
		t.Fatal(err)
	}
	if needs := RequiredFallbackFonts(m, true); len(needs) != 2 || !needs[0].Complete || !needs[1].Complete {
		t.Fatalf("Word must retain full font embedding: %+v", needs)
	}
	if _, err := CreateDOCX(m); err == nil {
		t.Fatal("must not silently embed incomplete fonts in editable Word")
	}
	if err := RegisterFallbackFont("Noto Serif SC", assets.FallbackFont, true); err != nil {
		t.Fatal(err)
	}
	if err := RegisterFallbackFont("Noto Serif SC Black", assets.FallbackBlackFont, true); err != nil {
		t.Fatal(err)
	}
	if _, err := CreateDOCX(m); err != nil {
		t.Fatal(err)
	}
	loadCoreTestFonts(t)
	if !bytes.Equal(fonts["Noto Serif SC"].data, assets.FallbackFont) {
		t.Fatal("complete fonts must never be downgraded by a late common-font response")
	}
}

func TestRareTitleLoadsTheSameCompleteFaceWithoutChangingContent(t *testing.T) {
	browserFontState(t)
	loadCoreTestFonts(t)
	m := resourceModel(t)
	m.Blocks[0].Paragraph.Text = "龘字核对"
	before := m.Text()
	needs := RequiredFallbackFonts(m, false)
	if len(needs) != 1 || needs[0].Name != "Noto Serif SC Black" || !needs[0].Complete {
		t.Fatalf("rare title must keep its real weight: %+v", needs)
	}
	if _, err := RenderPDF(context.Background(), m); err == nil {
		t.Fatal("unprepared rare glyph must not be replaced silently")
	}
	if err := RegisterFallbackFont(needs[0].Name, assets.FallbackBlackFont, true); err != nil {
		t.Fatal(err)
	}
	if _, err := RenderPDF(context.Background(), m); err != nil {
		t.Fatal(err)
	}
	if m.Text() != before {
		t.Fatal("loading fonts changed author text")
	}
}

func TestAuthorizedFontsSkipAllFallbackResourcesAndBadDataKeepsOldFace(t *testing.T) {
	browserFontState(t)
	for _, role := range []string{"仿宋", "楷体", "黑体", "宋体", "方正小标宋简体"} {
		if err := RegisterFont(role, assets.FallbackFont); err != nil {
			t.Fatal(err)
		}
	}
	m := resourceModel(t)
	if needs := RequiredFallbackFonts(m, false); len(needs) != 0 {
		t.Fatalf("authorized complete faces must avoid fallback requests: %+v", needs)
	}
	if needs := RequiredFallbackFonts(m, true); len(needs) != 0 {
		t.Fatalf("unused roles must not force fallback Word downloads: %+v", needs)
	}
	loadCoreTestFonts(t)
	before := fonts["Noto Serif SC"].data
	if err := RegisterFallbackFont("Noto Serif SC", []byte("broken"), true); err == nil {
		t.Fatal("broken font accepted")
	}
	if !bytes.Equal(before, fonts["Noto Serif SC"].data) || fallbackComplete["Noto Serif SC"] {
		t.Fatal("bad replacement changed prior font")
	}
}

func TestCommonFontRenderingMatchesCompleteFontLayout(t *testing.T) {
	browserFontState(t)
	m := resourceModel(t)
	for name, data := range map[string][]byte{"Noto Serif SC": assets.FallbackFont, "Noto Serif SC Black": assets.FallbackBlackFont} {
		if err := RegisterFallbackFont(name, data, true); err != nil {
			t.Fatal(err)
		}
	}
	full, err := RenderPDF(context.Background(), m)
	if err != nil {
		t.Fatal(err)
	}
	fallbackComplete = map[string]bool{}
	loadCoreTestFonts(t)
	core, err := RenderPDF(context.Background(), m)
	if err != nil {
		t.Fatal(err)
	}
	if core.Pages != full.Pages {
		t.Fatal("common subset changed page count")
	}
	if directory := os.Getenv("DOC2GOV_FONT_EVIDENCE"); directory != "" {
		if err := os.MkdirAll(directory, 0700); err != nil {
			t.Fatal(err)
		}
		for name, data := range map[string][]byte{"full.pdf": full.Data, "core.pdf": core.Data} {
			if err := os.WriteFile(filepath.Join(directory, name), data, 0600); err != nil {
				t.Fatal(err)
			}
		}
	}
}
