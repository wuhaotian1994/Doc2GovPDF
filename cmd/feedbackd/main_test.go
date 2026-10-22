package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestStaticRootCannotEscapeThroughLink(t *testing.T) {
	root := t.TempDir()
	private := t.TempDir()
	if e := os.WriteFile(filepath.Join(root, "index.html"), []byte("safe"), 0600); e != nil {
		t.Fatal(e)
	}
	if e := os.WriteFile(filepath.Join(private, "secret"), []byte("not-public"), 0600); e != nil {
		t.Fatal(e)
	}
	if e := linkDirectory(private, filepath.Join(root, "private-link")); e != nil {
		t.Skip("OS did not permit test link creation")
	}
	bounded, e := os.OpenRoot(root)
	if e != nil {
		t.Fatal(e)
	}
	defer bounded.Close()
	fs := boundedFiles{bounded}
	if f, e := fs.Open("/private-link/secret"); e == nil {
		f.Close()
		t.Fatal("private symlink escaped static root")
	}
	f, e := fs.Open("/index.html")
	if e != nil {
		t.Fatal(e)
	}
	f.Close()
}

func TestPrivatePathTwoDotNamesAreNotOutside(t *testing.T) {
	root := t.TempDir()
	for _, name := range []string{"..private", "..attachments", "normal"} {
		private := filepath.Join(root, name)
		if e := os.Mkdir(private, 0700); e != nil {
			t.Fatal(e)
		}
		resolved, e := filepath.EvalSymlinks(private)
		if e != nil {
			t.Fatal(e)
		}
		rel, e := filepath.Rel(root, resolved)
		if e != nil || !relativeInside(rel) {
			t.Fatalf("private directory %s was considered outside static root", name)
		}
	}
	if relativeInside("..") || relativeInside(filepath.Join("..", "outside")) {
		t.Fatal("legitimate outside parent path considered inside")
	}
}
