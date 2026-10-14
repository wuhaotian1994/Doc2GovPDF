//go:build upgradeprobe

package main

import (
	"context"
	"os"
	"path/filepath"
)

// Deliberate test-only startup failure after the real upgrade snapshot.
func (a *App) domReady(context.Context) {}

func (a *App) startupProbe() {
	if os.Getenv("DOC2GOVPDF_TEST_MODE") != "1" {
		return
	}
	_ = os.WriteFile(filepath.Join(a.draftDir, "workspace.json"), []byte(`{"schema":99,"name":"incompatible test data"}`), 0600)
	os.Exit(17)
}
