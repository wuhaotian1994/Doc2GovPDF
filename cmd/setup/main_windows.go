//go:build windows

package main

import (
	"doc2govpdf/internal/desktopintegration"
	"doc2govpdf/internal/install"
	"doc2govpdf/internal/release"
	"embed"
	"flag"
	"fmt"
	"github.com/wailsapp/go-webview2/webviewloader"
	"golang.org/x/sys/windows"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"unsafe"
)

//go:embed payload/*
var payload embed.FS
var user32 = windows.NewLazySystemDLL("user32.dll")

func message(text string, flags uintptr) int {
	title, _ := windows.UTF16PtrFromString("公文整理安装程序")
	msg, _ := windows.UTF16PtrFromString(text)
	r, _, _ := user32.NewProc("MessageBoxW").Call(0, uintptr(unsafe.Pointer(msg)), uintptr(unsafe.Pointer(title)), flags)
	return int(r)
}
func main() {
	target := flag.String("target", "", "installation directory")
	silent := flag.Bool("silent", false, "silent install")
	noRegister := flag.Bool("no-register", false, "isolated file installation test")
	waitPID := flag.Int("wait", 0, "wait for process exit")
	expectedVersion := flag.String("expected-version", "", "signed manifest version")
	flag.Parse()
	if *expectedVersion != "" && *expectedVersion != release.Version {
		fail("安装包版本与签名清单不一致，未执行更新。", *silent)
	}
	if *target == "" {
		*target = filepath.Join(os.Getenv("LOCALAPPDATA"), "Programs", "Doc2GovPDF")
	}
	if *waitPID > 0 {
		if h, e := windows.OpenProcess(windows.SYNCHRONIZE, false, uint32(*waitPID)); e == nil {
			result, _ := windows.WaitForSingleObject(h, 60000)
			windows.CloseHandle(h)
			if result != windows.WAIT_OBJECT_0 {
				fail("更新进程仍在运行，稍后重试。", *silent)
			}
		}
	}
	if !*silent {
		updateNotice := "自动更新会在后台下载，退出后安装，可在设置中关闭。"
		if release.Channel == "local" {
			updateNotice = "这是本地安装版，不连接网络更新服务。"
		}
		if message("安装公文整理到当前用户账户？\n\n文件在本机处理。"+updateNotice+"\n\n"+*target, 4|32) != 6 {
			return
		}
	}
	data, e := payload.ReadFile("payload/app.zip")
	if e != nil {
		fail("安装包不完整。", *silent)
	}
	runtimeVersion, runtimeErr := webviewloader.GetAvailableCoreWebView2BrowserVersionString("")
	runtimeMajor, _ := strconv.Atoi(strings.Split(runtimeVersion, ".")[0])
	if runtimeErr != nil || runtimeMajor < 109 {
		runtimeBytes, re := payload.ReadFile("payload/MicrosoftEdgeWebView2RuntimeInstallerX64.exe")
		if re != nil {
			fail("安装包缺少离线运行组件。", *silent)
		}
		f, re := os.CreateTemp("", "Doc2GovPDF-WebView2-*.exe")
		if re != nil {
			fail(re.Error(), *silent)
		}
		name := f.Name()
		if _, re = f.Write(runtimeBytes); re != nil {
			f.Close()
			fail(re.Error(), *silent)
		}
		f.Close()
		cmd := exec.Command(name, "/silent", "/install")
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
		re = cmd.Run()
		_ = os.Remove(name)
		if re != nil {
			fail("运行组件安装失败，请检查系统策略或磁盘空间。", *silent)
		}
	}
	if e = install.Install(data, *target, release.Version); e != nil {
		fail(e.Error(), *silent)
	}
	if *expectedVersion == "" {
		_ = os.Remove(filepath.Join(*target, ".failed-version"))
	}
	if !*noRegister {
		if e = desktopintegration.Register(*target, release.Version, "Doc2GovPDF"); e != nil {
			fail("程序已写入，但系统登记失败："+e.Error(), *silent)
		}
	}
	if !*silent {
		message("安装完成。请从开始菜单打开“公文整理”。", 64)
	}
}
func fail(text string, silent bool) {
	if silent {
		fmt.Fprintln(os.Stderr, text)
	} else {
		message(text, 16)
	}
	os.Exit(1)
}
