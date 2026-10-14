//go:build windows

package main

import (
	"crypto/ed25519"
	"doc2govpdf/internal/release"
	"doc2govpdf/internal/update"
	"encoding/base64"
	"encoding/json"
	"flag"
	"golang.org/x/sys/windows"
	"os"
	"os/exec"
	"strconv"
	"syscall"
)

func main() {
	parent := flag.Int("parent", 0, "app pid")
	installer := flag.String("installer", "", "staged installer")
	manifestPath := flag.String("manifest", "", "signed metadata")
	target := flag.String("target", "", "installation directory")
	flag.Parse()
	key, e := base64.StdEncoding.DecodeString(release.PublicKey)
	if e != nil {
		return
	}
	data, e := os.ReadFile(*manifestPath)
	if e != nil {
		return
	}
	var manifest update.Manifest
	if json.Unmarshal(data, &manifest) != nil {
		return
	}
	client := update.Client{PublicKey: ed25519.PublicKey(key), CurrentVersion: release.Version}
	if client.VerifyFile(manifest, *installer) != nil {
		return
	}
	cmp, e := update.Compare(manifest.Version, release.Version)
	if e != nil || cmp <= 0 {
		return
	}
	if *parent > 0 {
		if h, e := windows.OpenProcess(windows.SYNCHRONIZE, false, uint32(*parent)); e == nil {
			result, _ := windows.WaitForSingleObject(h, 60000)
			windows.CloseHandle(h)
			if result != windows.WAIT_OBJECT_0 {
				return
			}
		}
	}
	if client.VerifyFile(manifest, *installer) != nil {
		return
	}
	cmd := exec.Command(*installer, "--silent", "--target", *target, "--wait", strconv.Itoa(os.Getpid()), "--expected-version", manifest.Version)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	_ = cmd.Start()
}
