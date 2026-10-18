//go:build js && wasm

package main

import (
	"doc2govpdf/internal/webengine"
	"syscall/js"
)

func main() {
	js.Global().Set("documentEngine", js.FuncOf(func(this js.Value, args []js.Value) any { return webengine.Call(args[0].String()) }))
	js.Global().Call("engineReady")
	select {}
}
