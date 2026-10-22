package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestCompressedAssetsNegotiateAndRespectRefusal(t *testing.T) {
	root := t.TempDir()
	for _, name := range []string{"document-engine.wasm", "font.ttf", "app.js", "index.html"} {
		for suffix, value := range map[string]string{"": "plain", ".br": "brotli", ".gz": "gzip"} {
			if err := os.WriteFile(filepath.Join(root, name+suffix), []byte(value), 0600); err != nil {
				t.Fatal(err)
			}
		}
	}
	for _, tc := range []struct{ path, accept, encoding, body, contentType string }{
		{"/document-engine.wasm", "gzip, br", "br", "brotli", "application/wasm"},
		{"/font.ttf", "gzip;q=1, br;q=0.2", "gzip", "gzip", "font/ttf"},
		{"/app.js", "br;q=0, gzip;q=0", "", "plain", "application/javascript"},
		{"/", "br", "br", "brotli", "text/html; charset=utf-8"},
	} {
		request := httptest.NewRequest(http.MethodGet, tc.path, nil)
		request.Header.Set("Accept-Encoding", tc.accept)
		response := httptest.NewRecorder()
		staticHandler(root).ServeHTTP(response, request)
		if response.Code != 200 || response.Header().Get("Content-Encoding") != tc.encoding || response.Body.String() != tc.body || response.Header().Get("Content-Type") != tc.contentType {
			t.Fatalf("%+v: %d %v %s", tc, response.Code, response.Header(), response.Body.String())
		}
		if response.Header().Get("Vary") != "Accept-Encoding" {
			t.Fatal("compressed response must vary by accepted encoding")
		}
	}
}
