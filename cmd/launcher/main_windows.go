//go:build windows

package main

import (
	"crypto/rand"
	"crypto/sha256"
	"doc2govpdf/internal/install"
	"encoding/hex"
	"fmt"
	"golang.org/x/sys/windows"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"syscall"
	"time"
)

func main() {
	exe, e := os.Executable()
	if e != nil {
		return
	}
	dir := filepath.Dir(exe)
	app := filepath.Join(dir, "Doc2GovPDF.exe")
	if _, e = os.Stat(filepath.Join(dir, ".pending-health")); os.IsNotExist(e) {
		cmd := exec.Command(app)
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
		_ = cmd.Start()
		return
	}
	token := make([]byte, 32)
	mutexName, _ := windows.UTF16PtrFromString(fmt.Sprintf("Doc2GovPDF-upgrade-%x", sha256.Sum256([]byte(dir))))
	mutex, e := windows.CreateMutex(nil, true, mutexName)
	if e == windows.ERROR_ALREADY_EXISTS {
		if mutex != 0 {
			windows.CloseHandle(mutex)
		}
		return
	}
	if e != nil {
		return
	}
	defer windows.CloseHandle(mutex)
	defer windows.ReleaseMutex(mutex)
	if _, e = rand.Read(token); e != nil {
		return
	}
	nonce := hex.EncodeToString(token)
	_ = os.Remove(filepath.Join(dir, ".health"))
	cmd := exec.Command(app)
	cmd.Env = append(os.Environ(), "DOC2GOVPDF_HEALTH_TOKEN="+nonce)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	if e = cmd.Start(); e != nil {
		rollback(dir, app)
		return
	}
	exited := make(chan error, 1)
	go func() { exited <- cmd.Wait() }()
	timer := time.NewTimer(30 * time.Second)
	defer timer.Stop()
	tick := time.NewTicker(100 * time.Millisecond)
	defer tick.Stop()
	for {
		select {
		case <-tick.C:
			if b, e := os.ReadFile(filepath.Join(dir, ".health")); e == nil && string(b) == nonce {
				_ = os.Remove(filepath.Join(dir, ".pending-health"))
				return
			}
		case <-exited:
			rollback(dir, app)
			return
		case <-timer.C:
			_ = cmd.Process.Kill()
			<-exited
			rollback(dir, app)
			return
		}
	}
}
func rollback(dir, app string) {
	if state, e := install.ReadState(dir); e == nil {
		_ = os.WriteFile(filepath.Join(dir, ".failed-version"), []byte(state.Version), 0600)
	}
	cmd := exec.Command(filepath.Join(dir, "Doc2GovPDF-maintenance.exe"), "--rollback", "--silent", "--target", dir, "--caller", strconv.Itoa(os.Getpid()))
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	_ = cmd.Start()
}
