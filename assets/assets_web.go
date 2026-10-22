//go:build js && wasm

package assets

// Browser fonts are versioned resources, loaded locally only when a document
// needs them. Native builds keep the complete embedded fallback faces.
var FallbackFont []byte
var FallbackBlackFont []byte
