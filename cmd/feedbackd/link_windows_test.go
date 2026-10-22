//go:build windows

package main

import (
	"os"
	"os/exec"
	"syscall"
)

func linkDirectory(source, target string) error {
	if e := os.Symlink(source, target); e == nil {
		return nil
	}
	cmd := exec.Command("cmd.exe", "/c", "mklink", "/J", target, source)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return cmd.Run()
}
