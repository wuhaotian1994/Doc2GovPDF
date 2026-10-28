package office

import "crypto/sha256"

// Only the operator-provided deployment package may use this path. Ordinary
// selected fonts do not acquire redistribution or Word-embedding provenance.
var systemFontHashes = map[string][32]byte{}

func RegisterSystemFont(role string, data []byte) error {
	if err := RegisterFont(role, data); err != nil {
		return err
	}
	systemFontHashes[role] = sha256.Sum256(fonts[role].data)
	return nil
}

func isSystemFont(face fontData) bool {
	_, ok := systemFontHashes[face.name]
	registered, exists := fonts[face.name]
	return ok && exists && len(face.data) > 0 && len(face.data) == len(registered.data) && &face.data[0] == &registered.data[0]
}
