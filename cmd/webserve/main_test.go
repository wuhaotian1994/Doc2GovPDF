package main

import (
	"mime"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
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

func TestWorkerUpdateNeverUsesTimestampOnlyValidation(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "sw.js")
	if err := os.WriteFile(path, []byte("const revision = 2;"), 0600); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/sw.js", nil)
	request.Header.Set("If-Modified-Since", info.ModTime().UTC().Format(time.RFC1123))
	response := httptest.NewRecorder()
	staticHandler(root).ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "revision = 2") || response.Header().Get("Last-Modified") != "" || response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("worker update lost: status=%d headers=%v body=%s", response.Code, response.Header(), response.Body.String())
	}
}

func TestEntryAndModulesCannotReuseSameSecondOldBytes(t *testing.T) {
	root := t.TempDir()
	for _, name := range []string{"index.html", "write.js"} {
		if err := os.WriteFile(filepath.Join(root, name), []byte("new content"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	for _, path := range []string{"/", "/write.js"} {
		request := httptest.NewRequest(http.MethodGet, path, nil)
		request.Header.Set("If-Modified-Since", time.Now().Add(time.Minute).UTC().Format(http.TimeFormat))
		response := httptest.NewRecorder()
		staticHandler(root).ServeHTTP(response, request)
		if response.Code != http.StatusOK || response.Body.String() != "new content" {
			t.Fatalf("%s: %d %s", path, response.Code, response.Body.String())
		}
	}
}
