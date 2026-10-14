package main

import (
	"context"
	"crypto/ed25519"
	"doc2govpdf/internal/release"
	"doc2govpdf/internal/update"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type UpdateInfo struct {
	Version    string `json:"version"`
	Configured bool   `json:"configured"`
	Message    string `json:"message"`
	Ready      bool   `json:"ready"`
}
type PendingUpdate struct {
	Manifest  update.Manifest `json:"manifest"`
	Installer string          `json:"installer"`
}

func updateClient() update.Client {
	key, _ := base64.StdEncoding.DecodeString(release.PublicKey)
	return update.Client{CurrentVersion: release.Version, PublicKey: ed25519.PublicKey(key), ManifestURL: release.UpdateURL}
}

var newUpdateClient = updateClient

func (a *App) UpdateStatus() UpdateInfo {
	if release.Channel == "local" {
		return UpdateInfo{Version: release.Version, Configured: false, Message: "本地安装版。需要升级时，运行新的安装包即可。"}
	}
	if prefs, e := a.GetPreferences(); e == nil && !prefs.AutoUpdate {
		return UpdateInfo{Version: release.Version, Configured: release.UpdateURL != "" && release.PublicKey != "", Message: "自动更新已关闭。"}
	}
	a.updateMu.Lock()
	defer a.updateMu.Unlock()
	if a.updateInfo.Version == "" {
		return UpdateInfo{Version: release.Version, Configured: release.UpdateURL != "" && release.PublicKey != "", Message: "更新发布服务尚未配置，离线出稿不受影响。"}
	}
	return a.updateInfo
}
func (a *App) setUpdate(message string, ready bool) {
	a.updateMu.Lock()
	defer a.updateMu.Unlock()
	a.updateInfo = UpdateInfo{Version: release.Version, Configured: release.UpdateURL != "" && release.PublicKey != "", Message: message, Ready: ready}
}
func (a *App) updateLoop(ctx context.Context) {
	if release.UpdateURL == "" || release.PublicKey == "" {
		a.setUpdate("更新发布服务尚未配置，离线出稿不受影响。", false)
		return
	}
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()
	for {
		a.checkUpdate(ctx)
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
func (a *App) checkUpdate(ctx context.Context) {
	prefs, e := a.GetPreferences()
	if e != nil || !prefs.AutoUpdate {
		a.setUpdate("自动更新已关闭。", false)
		return
	}
	stamp := filepath.Join(a.draftDir, "updates", "last-check")
	if b, e := os.ReadFile(stamp); e == nil {
		if last, e := time.Parse(time.RFC3339, string(b)); e == nil && time.Since(last) < 24*time.Hour {
			a.setUpdate("后台更新已启用。", false)
			return
		}
	}
	client := newUpdateClient()
	checkCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	a.updateMu.Lock()
	a.updateCancel = cancel
	a.updateMu.Unlock()
	defer func() { a.updateMu.Lock(); a.updateCancel = nil; a.updateMu.Unlock() }()
	defer cancel()
	m, e := client.Check(checkCtx)
	_ = os.MkdirAll(filepath.Dir(stamp), 0700)
	_ = os.WriteFile(stamp, []byte(time.Now().UTC().Format(time.RFC3339)), 0600)
	if e != nil {
		a.setUpdate("暂时无法检查更新，将在后台重试。", false)
		return
	}
	if m == nil {
		a.setUpdate("当前已是最新版本。", false)
		return
	}
	if m.Version == failedUpdateVersion() {
		a.setUpdate("该版本上次启动异常，已保留当前版本，等待后续更新。", false)
		return
	}
	a.setUpdate("正在后台下载更新，出稿不受影响。", false)
	path, e := client.Download(checkCtx, *m, filepath.Join(a.draftDir, "updates"))
	if e != nil {
		a.setUpdate("更新未完成，当前版本仍可正常使用。", false)
		return
	}
	pending := &PendingUpdate{Manifest: *m, Installer: path}
	if e = saveJSON(filepath.Join(a.draftDir, "updates", "pending.json"), pending); e != nil {
		return
	}
	a.updateMu.Lock()
	a.pendingUpdate = pending
	a.updateMu.Unlock()
	a.setUpdate("新版本已准备好，退出软件后自动安装。", true)
}
func (a *App) scheduleUpdate() {
	prefs, e := a.GetPreferences()
	if e != nil || !prefs.AutoUpdate {
		return
	}
	a.updateMu.Lock()
	pending := a.pendingUpdate
	a.updateMu.Unlock()
	if pending == nil {
		b, e := os.ReadFile(filepath.Join(a.draftDir, "updates", "pending.json"))
		if e != nil {
			return
		}
		var p PendingUpdate
		if json.Unmarshal(b, &p) != nil {
			return
		}
		pending = &p
	}
	client := newUpdateClient()
	if pending.Manifest.Version == failedUpdateVersion() {
		return
	}
	if client.VerifyFile(pending.Manifest, pending.Installer) != nil {
		return
	}
	cmp, e := update.Compare(pending.Manifest.Version, release.Version)
	if e != nil || cmp <= 0 {
		return
	}
	exe, e := os.Executable()
	if e != nil {
		return
	}
	root := filepath.Dir(exe)
	helper := filepath.Join(root, "Doc2GovPDF-updater.exe")
	if _, e = os.Stat(helper); e != nil {
		return
	}
	cmd := exec.Command(helper, "--parent", strconv.Itoa(os.Getpid()), "--installer", pending.Installer, "--manifest", pending.Installer+".json", "--target", root)
	hideCommand(cmd)
	_ = cmd.Start()
}

func failedUpdateVersion() string {
	exe, e := os.Executable()
	if e != nil {
		return ""
	}
	b, _ := os.ReadFile(filepath.Join(filepath.Dir(exe), ".failed-version"))
	return strings.TrimSpace(string(b))
}
func (a *App) MarkHealthy() error {
	if a.startupError != nil {
		return a.startupError
	}
	a.mu.Lock()
	a.uiReady = true
	a.mu.Unlock()
	token := os.Getenv("DOC2GOVPDF_HEALTH_TOKEN")
	if token == "" {
		return nil
	}
	if len(token) != 64 {
		return fmt.Errorf("启动验证标识无效")
	}
	exe, e := os.Executable()
	if e != nil {
		return e
	}
	if pending, e := os.ReadFile(filepath.Join(filepath.Dir(exe), ".pending-health")); e == nil {
		parts := strings.Split(string(pending), "\n")
		if len(parts) < 2 || parts[1] != release.Version {
			return fmt.Errorf("更新版本不一致，正在恢复旧版")
		}
	}
	return os.WriteFile(filepath.Join(filepath.Dir(exe), ".health"), []byte(token), 0600)
}
