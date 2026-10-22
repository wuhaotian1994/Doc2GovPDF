//go:build !js || !wasm

package assets

import _ "embed"

//go:embed fonts/NotoSerifSC.ttf
var FallbackFont []byte

//go:embed fonts/NotoSerifSC-Black.ttf
var FallbackBlackFont []byte
