//go:build uitest

package main

import (
	"context"
	_ "embed"
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed scripts/smoke-browser.js
var smokeScript string

//go:embed scripts/journey-browser.js
var journeyScript string

func (a *App) startupProbe() {}

// This test hook is excluded from the distributed executable.
func (a *App) domReady(ctx context.Context) {
	if os.Getenv("DOC2GOVPDF_TEST_MODE") != "1" {
		return
	}
	if os.Getenv("DOC2GOVPDF_QA_JOURNEYS") == "1" {
		config, e := a.qaFixtures()
		if e != nil {
			panic(e)
		}
		encoded, _ := json.Marshal(config)
		runtime.EventsOnce(ctx, "qa:journey", func(values ...interface{}) {
			data, _ := json.Marshal(values)
			_ = os.WriteFile(filepath.Join(a.draftDir, "journey-"+os.Getenv("DOC2GOVPDF_QA_PHASE")+".json"), data, 0600)
			runtime.Quit(ctx)
		})
		runtime.WindowExecJS(ctx, "window.__qa="+string(encoded)+";"+journeyScript)
		return
	}
	runtime.EventsOnce(ctx, "qa:result", func(values ...interface{}) {
		data, err := json.Marshal(values)
		if err == nil {
			_ = os.MkdirAll(a.draftDir, 0700)
			_ = os.WriteFile(filepath.Join(a.draftDir, "result.json"), data, 0600)
		}
		a.Close()
	})
	runtime.WindowExecJS(ctx, smokeScript)
}
