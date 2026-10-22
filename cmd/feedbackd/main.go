// feedbackd is a separately started, loopback-only feedback development service.
// Production collection is disabled unless a complete operator policy is supplied.
package main

import (
	"context"
	"doc2govpdf/internal/feedback"
	"encoding/json"
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path"
	"path/filepath"
	"strings"
	"time"
)

func main() {
	if e := run(); e != nil {
		log.Print("feedback service could not start; verify local configuration")
		os.Exit(1)
	}
}
func run() error {
	addr := os.Getenv("FEEDBACK_ADDR")
	if addr == "" {
		addr = "127.0.0.1:4187"
	}
	host, _, e := net.SplitHostPort(addr)
	if e != nil || net.ParseIP(host) == nil || !net.ParseIP(host).IsLoopback() {
		return errors.New("loopback address required")
	}
	cfg := feedback.Config{AttachmentDir: os.Getenv("FEEDBACK_ATTACHMENT_DIR"), AdminToken: os.Getenv("FEEDBACK_ADMIN_TOKEN")}
	if path := os.Getenv("FEEDBACK_POLICY_FILE"); path != "" {
		b, e := os.ReadFile(path)
		if e != nil {
			return e
		}
		if e = json.Unmarshal(b, &cfg); e != nil {
			return e
		}
	}
	if os.Getenv("FEEDBACK_DEVELOPMENT") == "1" {
		cfg.Enabled = true
		cfg.Development = true
		cfg.Operator = "本机虚构材料开发测试"
		cfg.Purpose = "仅验证虚构反馈闭环，不接收真实材料"
		cfg.AccessScope = "本机测试操作人员"
		cfg.RetentionDays = 1
		cfg.BackupRetentionDays = 0
		cfg.DeletionContact = "凭私密回执删除；测试集群不配置应用备份"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	api, e := feedback.Open(ctx, os.Getenv("FEEDBACK_DATABASE_URL"), cfg)
	if e != nil {
		return e
	}
	defer api.Close()
	root := os.Getenv("FEEDBACK_STATIC_DIR")
	if root != "" {
		root, e = filepath.Abs(root)
		if e != nil {
			return e
		}
		if info, err := os.Stat(filepath.Join(root, "index.html")); err != nil || info.IsDir() {
			return errors.New("static directory must be a built web artifact containing index.html")
		}
		root, e = filepath.EvalSymlinks(root)
		if e != nil {
			return e
		}
		private, e := filepath.EvalSymlinks(cfg.AttachmentDir)
		if e != nil {
			return e
		}
		rel, err := filepath.Rel(root, private)
		if err != nil {
			return err
		}
		if relativeInside(rel) {
			return errors.New("private files cannot be inside static root")
		}
	}
	mux := http.NewServeMux()
	mux.Handle("/api/feedback/", api)
	if root != "" {
		bounded, e := os.OpenRoot(root)
		if e != nil {
			return e
		}
		defer bounded.Close()
		fs := http.FileServer(boundedFiles{bounded})
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			if r.Method != "GET" && r.Method != "HEAD" {
				http.Error(w, "method not allowed", 405)
				return
			}
			w.Header().Set("Referrer-Policy", "no-referrer")
			fs.ServeHTTP(w, r)
		})
	}
	server := &http.Server{Addr: addr, Handler: mux, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 20 * time.Second, WriteTimeout: 20 * time.Second, IdleTimeout: 30 * time.Second, MaxHeaderBytes: 16 << 10}
	stopped, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-stopped.Done():
				c, x := context.WithTimeout(context.Background(), 5*time.Second)
				server.Shutdown(c)
				x()
				return
			case <-ticker.C:
				c, x := context.WithTimeout(context.Background(), 30*time.Second)
				if api.Sweep(c) != nil {
					log.Print("feedback retention cleanup pending")
				}
				x()
			}
		}
	}()
	if e = api.Sweep(context.Background()); e != nil {
		return e
	}
	log.Print("feedback loopback service ready; request bodies and credentials are not logged")
	e = server.ListenAndServe()
	if e == http.ErrServerClosed {
		return nil
	}
	return e
}

// os.Root prevents static tree symlinks/junctions from escaping the built artifact.
type boundedFiles struct{ root *os.Root }

func (f boundedFiles) Open(name string) (http.File, error) {
	name = strings.TrimPrefix(path.Clean("/"+name), "/")
	if name == "" {
		name = "."
	}
	return f.root.Open(name)
}

// A name beginning with two dots is still inside; only a complete parent segment escapes.
func relativeInside(rel string) bool {
	return !filepath.IsAbs(rel) && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}
