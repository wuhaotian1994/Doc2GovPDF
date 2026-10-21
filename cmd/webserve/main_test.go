package main

import (
	"mime"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestExecutableTypesIgnoreHostFileAssociations(t *testing.T) {
	prior := mime.TypeByExtension(".mjs")
	if err := mime.AddExtensionType(".mjs", "text/plain"); err != nil {
		t.Fatal(err)
	}
	defer mime.AddExtensionType(".mjs", prior)
	root := t.TempDir()
	for _, name := range []string{"preview.mjs", "worker.mjs", "app.js", "engine.wasm"} {
		if err := os.WriteFile(filepath.Join(root, name), []byte("test asset"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	handler := staticHandler(root)
	for _, path := range []string{"/preview.mjs", "/worker.mjs?retry=2", "/app.js", "/engine.wasm"} {
		for _, method := range []string{http.MethodGet, http.MethodHead} {
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(method, path, nil))
			want := "application/javascript"
			if strings.Contains(path, ".wasm") {
				want = "application/wasm"
			}
			if response.Code != http.StatusOK || response.Header().Get("Content-Type") != want || response.Header().Get("X-Content-Type-Options") != "nosniff" {
				t.Fatalf("%s %s: status=%d headers=%v", method, path, response.Code, response.Header())
			}
		}
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/app.js", nil))
	if response.Code != http.StatusMethodNotAllowed {
		t.Fatal("server must remain read-only")
	}
}
