package office

import (
	"bytes"
	"fmt"
	"sort"
	"strings"

	"golang.org/x/image/font/sfnt"
)

type FontResourceNeed struct {
	Name     string `json:"name"`
	Text     string `json:"text"`
	Complete bool   `json:"complete"`
}

var fallbackComplete map[string]bool

func fallbackName(name string) bool {
	return name == "Noto Serif SC" || name == "Noto Serif SC Black"
}

// RequiredFallbackFonts never substitutes a different outline or edits text.
// The browser uses this result to fetch a fixed public font asset, not to send
// characters or the document to a server.
func RequiredFallbackFonts(m Model, complete bool) []FontResourceNeed {
	fontCatalog()
	needs := map[string]*FontResourceNeed{}
	add := func(name, text string, full bool) {
		if fallbackComplete[name] {
			return
		}
		face := fonts[name]
		missing := len(face.data) == 0 || fontMaps[name] == nil
		if !missing && !full && missingGlyph(name, text) == 0 {
			return
		}
		need := needs[name]
		if need == nil {
			need = &FontResourceNeed{Name: name}
			needs[name] = need
		}
		need.Text += text
		need.Complete = need.Complete || full || !missing
	}
	checkFace := func(role, text string) {
		face := resolveFont(role)
		if fallbackName(face.name) {
			add(face.name, text, complete)
		} else if missingGlyph(face.name, text) != 0 {
			add("Noto Serif SC", text, false)
		}
	}
	check := func(p Paragraph) {
		checkFace(p.Font, p.Prefix+p.Text)
		if p.PrefixFont != "" {
			checkFace(p.PrefixFont, p.Prefix)
		}
		// Generated Word runs can use a role distinct from the paragraph face.
		if complete {
			switch p.Role {
			case "signer":
				checkFace("仿宋", p.Text)
				checkFace("楷体", p.Text)
			case "header-meta":
				checkFace("仿宋", p.Text)
			case "article", "roster":
				checkFace("黑体", p.Text)
				checkFace("仿宋", p.Text)
			}
			if len(p.Tabs) > 0 && strings.Contains(p.Text, "签发人：") {
				checkFace("仿宋", p.Text)
				checkFace("楷体", p.Text)
			}
		}
	}
	for _, p := range m.Paragraphs() {
		check(*p)
	}
	for _, block := range m.Blocks {
		if block.Table != nil {
			for _, row := range block.Table.Rows {
				for _, cell := range row.Cells {
					if len(cell.Paragraphs) == 0 {
						checkFace("仿宋", "")
					}
				}
			}
		}
	}
	for _, group := range [][]Paragraph{m.Header, m.FirstHeader, m.FirstFooter} {
		for _, p := range group {
			check(p)
		}
	}
	check(Paragraph{Font: "宋体", Text: "—0123456789"})
	if complete {
		// The default DOCX style references 仿宋 even in an empty table cell.
		// Other unused styles must not force unrelated fallback downloads.
		face := resolveFont("仿宋")
		if fallbackName(face.name) {
			add(face.name, "", true)
		}
	}
	result := make([]FontResourceNeed, 0, len(needs))
	for _, need := range needs {
		result = append(result, *need)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Name < result[j].Name })
	return result
}

func RegisterFallbackFont(name string, data []byte, complete bool) error {
	if !fallbackName(name) || len(data) > 32<<20 || !embeddingAllowed(data) {
		return fmt.Errorf("备用字体资源无效")
	}
	fontCatalog()
	if current := fonts[name]; len(current.data) > 0 && bytes.Equal(current.data, data) {
		// Repeated registration must not allocate another full face. An exact
		// match was already validated; completeness can only be upgraded.
		fallbackComplete[name] = fallbackComplete[name] || complete
		return nil
	}
	// sfnt retains its source slice. Copy once before parsing so the parsed
	// face and PDF/Word bytes share the same immutable owned allocation.
	owned := append([]byte(nil), data...)
	face, err := sfnt.Parse(owned)
	if err != nil {
		return fmt.Errorf("备用字体资源损坏")
	}
	family, err := face.Name(nil, sfnt.NameIDFamily)
	if err != nil || !strings.HasPrefix(family, "Noto Serif SC") {
		return fmt.Errorf("备用字体身份不匹配")
	}
	if fallbackComplete[name] && !complete {
		return nil
	}
	fonts[name] = fontData{name, owned}
	fontMaps[name] = face
	fallbackComplete[name] = complete
	return nil
}
