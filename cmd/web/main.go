//go:build js && wasm

package main

import (
	"doc2govpdf/internal/office"
	"doc2govpdf/internal/webengine"
	"syscall/js"
)

func main() {
	js.Global().Set("documentRegisterFont", js.FuncOf(func(this js.Value, args []js.Value) any {
		if len(args) != 2 || args[0].Type() != js.TypeString || !args[1].InstanceOf(js.Global().Get("Uint8Array")) {
			return "字体数据无效"
		}
		size := args[1].Get("byteLength").Int()
		if size <= 0 || size > 32<<20 {
			return "字体数据无效或超过32 MB"
		}
		data := make([]byte, size)
		js.CopyBytesToGo(data, args[1])
		if err := office.RegisterFont(args[0].String(), data); err != nil {
			return err.Error()
		}
		return ""
	}))
	js.Global().Set("documentEngine", js.FuncOf(func(this js.Value, args []js.Value) any { return webengine.Call(args[0].String()) }))
	js.Global().Call("engineReady")
	select {}
}
