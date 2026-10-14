package main

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
)

var recoveryName = regexp.MustCompile(`^workspace-recovery-[0-9]+\.json$`)

func (a *App) ClearLocalDrafts() error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.jobs > 0 {
		return fmt.Errorf("正在导出，请完成后再清理")
	}
	if exe, e := os.Executable(); e == nil {
		if _, e = os.Stat(filepath.Join(filepath.Dir(exe), ".pending-health")); e == nil {
			return fmt.Errorf("正在完成更新，请稍后再清理")
		}
	}
	if a.draftDir == "" {
		return fmt.Errorf("本地数据目录不可用")
	}
	remove := func(path string) error {
		e := os.Remove(path)
		if os.IsNotExist(e) {
			return nil
		}
		return e
	}
	for _, name := range []string{"workspace.json", "draft.json"} {
		if e := remove(filepath.Join(a.draftDir, name)); e != nil {
			return e
		}
	}
	entries, _ := os.ReadDir(a.draftDir)
	for _, entry := range entries {
		if !entry.IsDir() && recoveryName.MatchString(entry.Name()) {
			if e := remove(filepath.Join(a.draftDir, entry.Name())); e != nil {
				return e
			}
		}
	}
	sources := filepath.Join(a.draftDir, "sources")
	entries, _ = os.ReadDir(sources)
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if len(name) == 69 && sourceIDPattern.MatchString(name[:64]) && name[64:] == ".docx" {
			if e := remove(filepath.Join(sources, name)); e != nil {
				return e
			}
		}
	}
	backup := filepath.Join(a.draftDir, "upgrade-backup")
	for _, name := range []string{"workspace.json", "draft.json", "preferences.json", "manifest.json"} {
		if e := remove(filepath.Join(backup, name)); e != nil {
			return e
		}
	}
	_ = os.Remove(backup)
	a.workspaceReadFailed = false
	a.previewMu.Lock()
	if a.previewCancel != nil {
		a.previewCancel()
	}
	a.previewKey = ""
	a.previewValue = Preview{}
	a.previewMu.Unlock()
	return nil
}
