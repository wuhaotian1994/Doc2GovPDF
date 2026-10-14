//go:build windows

package main

import (
	"doc2govpdf/internal/desktopintegration"
	"doc2govpdf/internal/install"
	"doc2govpdf/internal/userdata"
	"flag"
	"fmt"
	"golang.org/x/sys/windows"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"syscall"
	"unsafe"
)

func main() {
	uninstall := flag.Bool("uninstall", false, "uninstall")
	rollback := flag.Bool("rollback", false, "rollback failed update")
	caller := flag.Int("caller", 0, "calling launcher")
	silent := flag.Bool("silent", false, "silent")
	target := flag.String("target", "", "target")
	worker := flag.Bool("worker", false, "cleanup worker")
	parent := flag.Int("parent", 0, "parent process")
	noRegister := flag.Bool("no-register", false, "isolated test")
	flag.Parse()
	if !*uninstall && !*rollback {
		return
	}
	exe, e := os.Executable()
	if e != nil {
		os.Exit(1)
	}
	if *target == "" {
		*target = filepath.Dir(exe)
	}
	if _, e = install.ReadState(*target); e != nil {
		os.Exit(1)
	}
	if !*worker {
		if !*silent && !*rollback {
			title, _ := windows.UTF16PtrFromString("卸载公文整理")
			text, _ := windows.UTF16PtrFromString("卸载程序？你的原始文件、导出成品和本地草稿将保留。")
			r, _, _ := windows.NewLazySystemDLL("user32.dll").NewProc("MessageBoxW").Call(0, uintptr(unsafe.Pointer(text)), uintptr(unsafe.Pointer(title)), 4|32)
			if r != 6 {
				return
			}
		}
		b, e := os.ReadFile(exe)
		if e != nil {
			os.Exit(1)
		}
		f, e := os.CreateTemp("", "Doc2GovPDF-uninstall-*.exe")
		if e != nil {
			os.Exit(1)
		}
		name := f.Name()
		_, e = f.Write(b)
		f.Close()
		if e != nil {
			os.Exit(1)
		}
		action := "--uninstall"
		if *rollback {
			action = "--rollback"
		}
		args := []string{action, "--worker", "--target", *target, "--parent", strconv.Itoa(os.Getpid()), "--caller", strconv.Itoa(*caller)}
		if *silent {
			args = append(args, "--silent")
		}
		if *noRegister {
			args = append(args, "--no-register")
		}
		cmd := exec.Command(name, args...)
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
		if e = cmd.Start(); e != nil {
			os.Exit(1)
		}
		return
	}
	if *parent > 0 {
		if h, e := windows.OpenProcess(windows.SYNCHRONIZE, false, uint32(*parent)); e == nil {
			windows.WaitForSingleObject(h, 30000)
			windows.CloseHandle(h)
		}
	}
	if *caller > 0 {
		if h, e := windows.OpenProcess(windows.SYNCHRONIZE, false, uint32(*caller)); e == nil {
			windows.WaitForSingleObject(h, 30000)
			windows.CloseHandle(h)
		}
	}
	if *rollback {
		pending, _ := os.ReadFile(filepath.Join(*target, ".pending-health"))
		if e = userdata.Restore(userdata.Dir(), userdata.Token(pending)); e != nil {
			fmt.Fprintln(os.Stderr, e)
			os.Exit(1)
		}
		if e = install.Rollback(*target); e != nil {
			os.Exit(1)
		}
		cmd := exec.Command(filepath.Join(*target, "Doc2GovPDF.exe"))
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
		_ = cmd.Start()
		return
	}
	if !*noRegister {
		if e = install.CheckRemovable(*target); e != nil {
			fmt.Fprintln(os.Stderr, e)
			os.Exit(1)
		}
		if e = desktopintegration.Unregister(*target, "Doc2GovPDF"); e != nil {
			fmt.Fprintln(os.Stderr, e)
			os.Exit(1)
		}
	}
	if e = install.Uninstall(*target); e != nil {
		fmt.Fprintln(os.Stderr, e)
		os.Exit(1)
	}
}
