package main

import (
	"context"
	"doc2govpdf/internal/document"
	"doc2govpdf/internal/userdata"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type Draft struct {
	Text      string `json:"text"`
	Name      string `json:"name"`
	UpdatedAt string `json:"updatedAt"`
}

type App struct {
	ctx                 context.Context
	mu                  sync.Mutex
	draftDir            string
	closeAllowed        bool
	previewMu           sync.Mutex
	previewCancel       context.CancelFunc
	previewKey          string
	previewValue        Preview
	updateMu            sync.Mutex
	updateCancel        context.CancelFunc
	updateInfo          UpdateInfo
	pendingUpdate       *PendingUpdate
	lastOutputs         []string
	jobs                int
	workspaceReadFailed bool
	uiReady             bool
	startupError        error
}

func NewApp() *App { return &App{} }
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	if dir := os.Getenv("DOC2GOVPDF_DATA_DIR"); dir != "" {
		a.draftDir = dir
	} else if dir, err := os.UserConfigDir(); err == nil {
		a.draftDir = filepath.Join(dir, "Doc2GovPDF")
	}
	go a.updateLoop(ctx)
	if exe, e := os.Executable(); e == nil {
		if pending, e := os.ReadFile(filepath.Join(filepath.Dir(exe), ".pending-health")); e == nil {
			a.startupError = userdata.Snapshot(a.draftDir, userdata.Token(pending))
		}
	}
	a.startupProbe()
}
func (a *App) beforeClose(ctx context.Context) bool {
	a.mu.Lock()
	allowed := a.closeAllowed
	active := a.jobs > 0
	ready := a.uiReady
	a.mu.Unlock()
	if active {
		runtime.EventsEmit(ctx, "job:busy")
		return true
	}
	if !ready {
		return false
	}
	if !allowed {
		runtime.EventsEmit(ctx, "app:closing")
	}
	return !allowed
}
func (a *App) Close() {
	a.mu.Lock()
	if a.jobs > 0 {
		a.mu.Unlock()
		runtime.EventsEmit(a.ctx, "job:busy")
		return
	}
	a.closeAllowed = true
	a.mu.Unlock()
	a.scheduleUpdate()
	runtime.Quit(a.ctx)
}

func (a *App) LoadDraft() (Draft, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.draftDir == "" {
		return Draft{}, fmt.Errorf("无法定位本地草稿目录")
	}
	data, err := os.ReadFile(filepath.Join(a.draftDir, "draft.json"))
	if os.IsNotExist(err) {
		return Draft{}, nil
	}
	if err != nil {
		return Draft{}, fmt.Errorf("草稿读取失败，原文件仍保留在本机")
	}
	var d Draft
	if len(data) > document.MaxTextBytes*7 || json.Unmarshal(data, &d) != nil {
		return Draft{}, fmt.Errorf("草稿损坏，未覆盖原有草稿")
	}
	return d, nil
}

func (a *App) SaveDraft(d Draft) error {
	if d.Text != "" {
		if err := document.Validate(d.Text); err != nil && strings.TrimSpace(d.Text) != "" {
			return err
		}
	}
	if len(d.Text) > document.MaxTextBytes || len(d.Name) > 1024 {
		return fmt.Errorf("草稿过大")
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.draftDir == "" {
		return fmt.Errorf("草稿目录不可用，请先导出文件保留内容")
	}
	if err := os.MkdirAll(a.draftDir, 0700); err != nil {
		return fmt.Errorf("无法保存草稿，请检查用户目录权限")
	}
	d.UpdatedAt = time.Now().Format(time.RFC3339)
	data, err := json.Marshal(d)
	if err != nil {
		return err
	}
	f, err := os.CreateTemp(a.draftDir, "draft-*.tmp")
	if err != nil {
		return fmt.Errorf("无法创建草稿，请检查磁盘空间")
	}
	name := f.Name()
	defer os.Remove(name)
	if _, err = f.Write(data); err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		return fmt.Errorf("草稿写入失败，请检查磁盘空间")
	}
	if err = os.Rename(name, filepath.Join(a.draftDir, "draft.json")); err != nil {
		return fmt.Errorf("草稿替换失败，之前的草稿已保留")
	}
	return nil
}

func writeNew(path string, data []byte) error {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if os.IsExist(err) {
		return fmt.Errorf("该名称已存在，为保留原件，请使用新的文件名")
	}
	if err != nil {
		return fmt.Errorf("无法创建文件，请选择可写入的位置")
	}
	if _, err = f.Write(data); err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		_ = os.Remove(path)
		return fmt.Errorf("文件写入失败，请检查磁盘空间后重试")
	}
	return nil
}
