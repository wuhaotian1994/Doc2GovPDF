// Static assets only. Documents never enter this server.
package main

import (
	"flag"
	"log"
	"net"
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
	listener, e := net.Listen("tcp", *address)
	if e != nil {
		log.Fatal(e)
	}
	server := http.Server{Handler: staticHandler(root), ReadHeaderTimeout: 5 * time.Second}
	log.Printf("Browser app: http://%s", listener.Addr())
	log.Fatal(server.Serve(listener))
}

func staticHandler(root string) http.Handler {
	files := http.FileServer(http.Dir(root))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" && r.Method != "HEAD" {
			http.Error(w, "Method not allowed", 405)
			return
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		// The service worker owns versioned offline caching. Timestamp-only HTTP
		// revalidation can reuse old HTML/scripts during a same-second replacement.
		w.Header().Set("Cache-Control", "no-store")
		r = r.Clone(r.Context())
		r.Header.Del("If-Modified-Since")
		// Windows registry associations must not determine executable web MIME types.
		// In particular .mjs can otherwise be served as text/plain with nosniff.
		switch strings.ToLower(filepath.Ext(r.URL.Path)) {
		case ".js", ".mjs":
			w.Header().Set("Content-Type", "application/javascript")
		case ".wasm":
			w.Header().Set("Content-Type", "application/wasm")
		case ".ttf":
			w.Header().Set("Content-Type", "font/ttf")
		case ".css":
			w.Header().Set("Content-Type", "text/css; charset=utf-8")
		case ".html":
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
		case ".svg":
			w.Header().Set("Content-Type", "image/svg+xml")
		}
		// Updates can replace sw.js within the same filesystem timestamp second.
		// Always revalidate its bytes rather than sending a false Last-Modified 304.
		if r.URL.Path == "/sw.js" {
			worker, err := os.Open(filepath.Join(root, "sw.js"))
			if err != nil {
				http.NotFound(w, r)
				return
			}
			defer worker.Close()
			w.Header().Set("Cache-Control", "no-store")
			http.ServeContent(w, r, "sw.js", time.Time{}, worker)
			return
		}
		if serveCompressed(w, r, root) {
			return
		}
		files.ServeHTTP(w, r)
	})
}
