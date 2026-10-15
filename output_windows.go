//go:build windows

package main

import (
	"fmt"
	"golang.org/x/sys/windows"
	"os"
	"path/filepath"
)

var launchResult = shellOpenResult

func (a *App) OpenResult(path string, folder bool) error {
	a.mu.Lock()
	allowed := false
	for _, p := range a.lastOutputs {
		if p == path {
			allowed = true
		}
	}
	a.mu.Unlock()
	if !allowed {
		return fmt.Errorf("只能打开本次导出的文件")
	}
	if _, e := os.Stat(path); e != nil {
		return e
	}
	if folder {
		path = filepath.Dir(path)
	}
	return launchResult(path)
}
func shellOpenResult(path string) error {
	p, e := windows.UTF16PtrFromString(path)
	if e != nil {
		return e
	}
	verb, _ := windows.UTF16PtrFromString("open")
	return windows.ShellExecute(0, verb, p, nil, nil, windows.SW_SHOWNORMAL)
}
