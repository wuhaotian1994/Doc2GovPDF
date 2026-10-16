package main

import (
	"crypto/sha256"
	"embed"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend
var assets embed.FS

func main() {
	if len(os.Args) == 2 && os.Args[1] == "--inspect-pdf-worker" {
		pdfInspectionWorker()
		return
	}
	app := NewApp()
	webviewData := ""
	if dir := os.Getenv("DOC2GOVPDF_DATA_DIR"); dir != "" {
		webviewData = filepath.Join(dir, "webview")
	}
	if webviewData == "" {
		if dir, e := os.UserConfigDir(); e == nil {
			webviewData = filepath.Join(dir, "Doc2GovPDF", "webview")
		}
	}
	instanceID := fmt.Sprintf("Doc2GovPDF-%x", sha256.Sum256([]byte(webviewData)))
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
		SingleInstanceLock: &options.SingleInstanceLock{UniqueId: instanceID, OnSecondInstanceLaunch: func(options.SecondInstanceData) {
			if app.ctx != nil {
				wruntime.WindowShow(app.ctx)
				wruntime.WindowUnminimise(app.ctx)
			}
		}},
	}); err != nil {
		log.Fatal(err)
	}
}
