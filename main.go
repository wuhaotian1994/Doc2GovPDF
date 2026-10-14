package main

import (
	"embed"
	"log"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend
var assets embed.FS

func main() {
	app := NewApp()
	webviewData := ""
	if dir := os.Getenv("DOC2GOVPDF_DATA_DIR"); dir != "" {
		webviewData = filepath.Join(dir, "webview")
	}
	if err := wails.Run(&options.App{
		Title: "公文整理 · Doc2GovPDF", Width: 1120, Height: 780, MinWidth: 720, MinHeight: 520,
		StartHidden:      os.Getenv("DOC2GOVPDF_TEST_MODE") == "1",
		AssetServer:      &assetserver.Options{Assets: assets},
		BackgroundColour: options.NewRGB(246, 247, 249),
		OnStartup:        app.startup, OnBeforeClose: app.beforeClose, OnDomReady: app.domReady,
		EnableDefaultContextMenu: true,
		DragAndDrop:              &options.DragAndDrop{EnableFileDrop: true, DisableWebViewDrop: true},
		Windows:                  &windows.Options{Theme: windows.Light, IsZoomControlEnabled: true, WebviewUserDataPath: webviewData},
		Bind:                     []interface{}{app},
	}); err != nil {
		log.Fatal(err)
	}
}
