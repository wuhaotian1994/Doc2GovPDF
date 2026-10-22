package office

import (
	"strings"
	"unicode"
	"unicode/utf8"

	"golang.org/x/image/font/sfnt"
)

var documentFontRoles = []string{"仿宋", "黑体", "楷体", "宋体", "方正小标宋简体"}

// Legacy family (name ID 1) is the Word declaration. Typographic family ID 16
// can combine distinct legacy families such as Regular and Black. This names a
// family only; it does not promise a selected style/weight on another machine.
func legacyWordFamily(key string) (string, bool) {
	face := fontMaps[key]
	if face == nil {
		return "", false
	}
	name, err := face.Name(nil, sfnt.NameIDFamily)
	if err != nil || !safeWordFamily(name) {
		return "", false
	}
	return name, true
}

func safeWordFamily(name string) bool {
	if !utf8.ValidString(name) || strings.TrimSpace(name) == "" || utf8.RuneCountInString(name) > 300 {
		return false
	}
	for _, r := range name {
		if unicode.IsControl(r) || r == unicode.ReplacementChar || r == 0xfffe || r == 0xffff {
			return false
		}
	}
	return true
}

// No persistent name cache or font copy: inspect the already validated faces.
// Multiple purpose aliases of the same immutable face are one candidate;
// independently registered same-family faces are not selected arbitrarily.
func registeredWordFamily(name string) (fontData, bool, bool) {
	var selected fontData
	selectedKey := ""
	for _, role := range documentFontRoles {
		face, ok := fonts[role]
		family, valid := legacyWordFamily(role)
		if !ok || len(face.data) == 0 || !valid || !strings.EqualFold(family, name) {
			continue
		}
		if selectedKey == "" {
			selected = face
			selectedKey = role
			continue
		}
		sameParsed := fontMaps[selectedKey] == fontMaps[role]
		sameBytes := len(selected.data) == len(face.data) && len(face.data) > 0 && &selected.data[0] == &face.data[0]
		if !sameParsed && !sameBytes {
			return fontData{}, false, true
		}
	}
	return selected, selectedKey != "", false
}

// Only explicit role requests and existing standard aliases are fallback
// requests. An unknown source family is preserved, not renamed to an OFL face.
func wordRoleRequest(name string) bool {
	for _, role := range documentFontRoles {
		if name == role {
			return true
		}
	}
	switch strings.ToLower(name) {
	case "fangsong", "simhei", "kaiti", "simsun":
		return true
	}
	return false
}

func wordFontDeclaration(declared string) (string, fontData, bool) {
	// Preserve role intent before resolving family aliases. In particular, a
	// user-selected font named Noto must retain its original role provenance.
	if face, ok := fonts[declared]; ok && !fallbackName(face.name) {
		if name, valid := legacyWordFamily(declared); valid {
			return name, face, false
		}
		return declared, face, false
	}
	if face, ok, ambiguous := registeredWordFamily(declared); ok {
		name, _ := legacyWordFamily(face.name)
		return name, face, false
	} else if ambiguous {
		return declared, fontData{}, false
	}
	if !wordRoleRequest(declared) && !fallbackName(declared) {
		return declared, fontData{}, false
	}
	face := resolveFont(declared)
	if fallbackName(face.name) {
		return face.name, face, true
	}
	if name, valid := legacyWordFamily(face.name); valid {
		return name, face, false
	}
	return declared, face, false
}
