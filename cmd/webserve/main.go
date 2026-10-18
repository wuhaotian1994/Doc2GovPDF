// Static assets only. Documents never enter this server.
package main

import (
	"flag"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func main() {
	address := flag.String("listen", "127.0.0.1:37841", "listen address")
	folder := flag.String("dir", "dist/web", "static assets")
	flag.Parse()
	root, e := filepath.Abs(*folder)
	if e != nil {
		log.Fatal(e)
	}
	files := http.FileServer(http.Dir(root))
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" && r.Method != "HEAD" {
			http.Error(w, "Method not allowed", 405)
			return
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Cache-Control", "no-cache")
		if r.URL.Path == "/document-engine.wasm" && strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
			p := filepath.Join(root, "document-engine.wasm.gz")
			if _, e := os.Stat(p); e == nil {
				w.Header().Set("Content-Encoding", "gzip")
				w.Header().Set("Content-Type", "application/wasm")
				w.Header().Set("Vary", "Accept-Encoding")
				http.ServeFile(w, r, p)
				return
			}
		}
		files.ServeHTTP(w, r)
	})
	server := http.Server{Addr: *address, Handler: handler, ReadHeaderTimeout: 5 * time.Second}
	log.Printf("Browser app: http://%s", *address)
	log.Fatal(server.ListenAndServe())
}
