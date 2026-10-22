package main

import (
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
)

func encodingQuality(header, name string) float64 {
	quality, wildcard := -1.0, 0.0
	for _, part := range strings.Split(header, ",") {
		fields := strings.Split(part, ";")
		encoding := strings.ToLower(strings.TrimSpace(fields[0]))
		q := 1.0
		for _, field := range fields[1:] {
			key, value, found := strings.Cut(strings.TrimSpace(field), "=")
			if found && strings.EqualFold(key, "q") {
				parsed, err := strconv.ParseFloat(strings.TrimSpace(value), 64)
				if err != nil || parsed < 0 || parsed > 1 {
					q = 0
				} else {
					q = parsed
				}
			}
		}
		if encoding == name {
			quality = q
		}
		if encoding == "*" {
			wildcard = q
		}
	}
	if quality >= 0 {
		return quality
	}
	return wildcard
}

func serveCompressed(w http.ResponseWriter, r *http.Request, root string) bool {
	if strings.HasSuffix(r.URL.Path, "/index.html") {
		return false
	}
	name := path.Clean("/" + r.URL.Path)
	if name == "/" {
		name = "/index.html"
	}
	contentType := map[string]string{
		".wasm": "application/wasm", ".ttf": "font/ttf",
		".js": "application/javascript", ".mjs": "application/javascript",
		".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8",
	}[strings.ToLower(path.Ext(name))]
	if contentType == "" {
		return false
	}
	w.Header().Set("Vary", "Accept-Encoding")
	encodings := []string{"br", "gzip"}
	if encodingQuality(r.Header.Get("Accept-Encoding"), "gzip") > encodingQuality(r.Header.Get("Accept-Encoding"), "br") {
		encodings[0], encodings[1] = encodings[1], encodings[0]
	}
	for _, encoding := range encodings {
		if encodingQuality(r.Header.Get("Accept-Encoding"), encoding) <= 0 {
			continue
		}
		suffix := ".br"
		if encoding == "gzip" {
			suffix = ".gz"
		}
		file := filepath.Join(root, filepath.FromSlash(strings.TrimPrefix(name, "/"))) + suffix
		if info, err := os.Stat(file); err == nil && !info.IsDir() {
			w.Header().Set("Content-Encoding", encoding)
			w.Header().Set("Content-Type", contentType)
			http.ServeFile(w, r, file)
			return true
		}
	}
	return false
}
