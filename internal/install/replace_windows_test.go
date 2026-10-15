package install

import (
	"os"
	"path/filepath"
	"syscall"
	"testing"
	"time"
)

func TestReplacementWaitsForWindowsFileHandleRelease(t *testing.T) {
	dir := t.TempDir()
	src, dst := filepath.Join(dir, "new.exe"), filepath.Join(dir, "app.exe")
	if e := os.WriteFile(src, []byte("new application"), 0600); e != nil {
		t.Fatal(e)
	}
	if e := os.WriteFile(dst, []byte("old application"), 0600); e != nil {
		t.Fatal(e)
	}
	path, e := syscall.UTF16PtrFromString(dst)
	if e != nil {
		t.Fatal(e)
	}
	h, e := syscall.CreateFile(path, syscall.GENERIC_READ, syscall.FILE_SHARE_READ, nil, syscall.OPEN_EXISTING, syscall.FILE_ATTRIBUTE_NORMAL, 0)
	if e != nil {
		t.Fatal(e)
	}
	closed := make(chan struct{})
	go func() { time.Sleep(250 * time.Millisecond); syscall.CloseHandle(h); close(closed) }()
	if e := replaceInstalledFile(src, dst); e != nil {
		t.Fatal(e)
	}
	<-closed
	data, e := os.ReadFile(dst)
	if e != nil || string(data) != "new application" {
		t.Fatal("replacement failed", e)
	}
}
