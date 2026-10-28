package office

import (
	"bytes"
	"doc2govpdf/assets"
	"os"
	"runtime"
	"testing"

	"golang.org/x/image/font/sfnt"
)

// An isolated-process probe models a decoded browser font argument. It does
// not reproduce any user's manuscript or infer a renderer-crash root cause.
func TestFallbackRegistrationRetainedMemory(t *testing.T) {
	browserFontState(t)
	runtime.GC()
	var before, after runtime.MemStats
	runtime.ReadMemStats(&before)
	func() {
		decoded := append([]byte(nil), assets.FallbackFont...)
		if err := RegisterFallbackFont("Noto Serif SC", decoded, true); err != nil {
			t.Fatal(err)
		}
	}()
	runtime.GC()
	runtime.ReadMemStats(&after)
	retained := int64(after.HeapAlloc) - int64(before.HeapAlloc)
	t.Logf("font_bytes=%d retained_heap_bytes=%d retained_ratio=%.3f", len(assets.FallbackFont), retained, float64(retained)/float64(len(assets.FallbackFont)))
	if os.Getenv("FONT_MEMORY_BASELINE") != "1" && retained > int64(len(assets.FallbackFont))*3/2 {
		t.Fatalf("font retains more than one owned byte buffer plus parser overhead: %d", retained)
	}
}

func TestFallbackRegistrationOwnsTheBytesUsedByItsParsedFace(t *testing.T) {
	browserFontState(t)
	decoded := append([]byte(nil), assets.FallbackFont...)
	if err := RegisterFallbackFont("Noto Serif SC", decoded, true); err != nil {
		t.Fatal(err)
	}
	family, err := fontMaps["Noto Serif SC"].Name(nil, sfnt.NameIDFamily)
	if err != nil {
		t.Fatal(err)
	}
	for i := range decoded {
		decoded[i] = 0
	}
	after, err := fontMaps["Noto Serif SC"].Name(nil, sfnt.NameIDFamily)
	if err != nil || after != family {
		t.Fatal("caller mutation changed registered parsed face", err)
	}
	if !bytes.Equal(fonts["Noto Serif SC"].data, assets.FallbackFont) {
		t.Fatal("caller mutation changed registered font bytes")
	}
}

func TestIdenticalFallbackRegistrationKeepsItsOwnedFaceAndUpgradeState(t *testing.T) {
	browserFontState(t)
	if err := RegisterFallbackFont("Noto Serif SC", assets.FallbackFont, true); err != nil {
		t.Fatal(err)
	}
	previous := fontMaps["Noto Serif SC"]
	data := fonts["Noto Serif SC"].data
	if err := RegisterFallbackFont("Noto Serif SC", assets.FallbackFont, true); err != nil {
		t.Fatal(err)
	}
	if fontMaps["Noto Serif SC"] != previous || &fonts["Noto Serif SC"].data[0] != &data[0] {
		t.Fatal("identical completed registration reparsed or recopied bytes")
	}
	if !fallbackComplete["Noto Serif SC"] {
		t.Fatal("full registration lost its upgrade state")
	}
}
