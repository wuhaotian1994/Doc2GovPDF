//go:build windows

package desktopintegration

import (
	"fmt"
	"github.com/go-ole/go-ole"
	"github.com/go-ole/go-ole/oleutil"
	"golang.org/x/sys/windows/registry"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

func keyName(id string) string { return `Software\Microsoft\Windows\CurrentVersion\Uninstall\` + id }
func shortcutName(id string) string {
	if id == "Doc2GovPDF" {
		return "公文整理.lnk"
	}
	return id + ".lnk"
}
func Register(dir, version, id string) error {
	if id != "Doc2GovPDF" && !strings.HasPrefix(id, "Doc2GovPDF-Test-") {
		return fmt.Errorf("安装标识无效")
	}
	k, _, e := registry.CreateKey(registry.CURRENT_USER, keyName(id), registry.SET_VALUE)
	if e != nil {
		return e
	}
	defer k.Close()
	for name, value := range map[string]string{"DisplayName": "公文整理 · " + id, "DisplayVersion": version, "Publisher": "Doc2GovPDF", "InstallLocation": dir, "DisplayIcon": filepath.Join(dir, "Doc2GovPDF.exe"), "UninstallString": `"` + filepath.Join(dir, "Doc2GovPDF-maintenance.exe") + `" --uninstall`, "QuietUninstallString": `"` + filepath.Join(dir, "Doc2GovPDF-maintenance.exe") + `" --uninstall --silent`} {
		if e = k.SetStringValue(name, value); e != nil {
			return e
		}
	}
	_ = k.SetDWordValue("NoModify", 1)
	_ = k.SetDWordValue("NoRepair", 1)
	folder := filepath.Join(os.Getenv("APPDATA"), "Microsoft", "Windows", "Start Menu", "Programs")
	if e = os.MkdirAll(folder, 0700); e != nil {
		return e
	}
	return shortcut(filepath.Join(folder, shortcutName(id)), filepath.Join(dir, "Doc2GovPDF-launcher.exe"), dir)
}
func Unregister(dir, id string) error {
	k, e := registry.OpenKey(registry.CURRENT_USER, keyName(id), registry.QUERY_VALUE)
	if e == nil {
		location, _, _ := k.GetStringValue("InstallLocation")
		k.Close()
		if !strings.EqualFold(filepath.Clean(location), filepath.Clean(dir)) {
			return fmt.Errorf("安装位置不一致，未移除系统登记")
		}
		if e = registry.DeleteKey(registry.CURRENT_USER, keyName(id)); e != nil {
			return e
		}
	} else if e != registry.ErrNotExist {
		return e
	}
	shortcut := filepath.Join(os.Getenv("APPDATA"), "Microsoft", "Windows", "Start Menu", "Programs", shortcutName(id))
	if e = os.Remove(shortcut); e != nil && !os.IsNotExist(e) {
		return e
	}
	return nil
}
func shortcut(path, target, dir string) error {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	if e := ole.CoInitialize(0); e != nil {
		return e
	}
	defer ole.CoUninitialize()
	object, e := oleutil.CreateObject("WScript.Shell")
	if e != nil {
		return e
	}
	defer object.Release()
	shell, e := object.QueryInterface(ole.IID_IDispatch)
	if e != nil {
		return e
	}
	defer shell.Release()
	v, e := oleutil.CallMethod(shell, "CreateShortcut", path)
	if e != nil {
		return e
	}
	link := v.ToIDispatch()
	defer link.Release()
	if _, e = oleutil.PutProperty(link, "TargetPath", target); e != nil {
		return e
	}
	_, _ = oleutil.PutProperty(link, "WorkingDirectory", dir)
	_, e = oleutil.CallMethod(link, "Save")
	return e
}
