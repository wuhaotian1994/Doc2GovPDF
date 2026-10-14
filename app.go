package main

import (
	"context"
	"doc2govpdf/internal/document"
	"encoding/json"
	"fmt"
	"html/template"
	"io"
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
	ctx          context.Context
	mu           sync.Mutex
	draftDir     string
	closeAllowed bool
}

func NewApp() *App { return &App{} }
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	if dir := os.Getenv("DOC2GOVPDF_DATA_DIR"); dir != "" {
		a.draftDir = dir
	} else if dir, err := os.UserConfigDir(); err == nil {
		a.draftDir = filepath.Join(dir, "Doc2GovPDF")
	}
}
func (a *App) beforeClose(ctx context.Context) bool {
	a.mu.Lock()
	allowed := a.closeAllowed
	a.mu.Unlock()
	if !allowed {
		runtime.EventsEmit(ctx, "app:closing")
	}
	return !allowed
}
func (a *App) Close() { a.mu.Lock(); a.closeAllowed = true; a.mu.Unlock(); runtime.Quit(a.ctx) }

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

func (a *App) Import() (Draft, error) {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{Title: "选择正文文件", Filters: []runtime.FileFilter{{DisplayName: "Word 文件或 UTF-8 文本", Pattern: "*.docx;*.txt"}}})
	if err != nil || path == "" {
		return Draft{}, err
	}
	return a.ImportPath(path)
}

func (a *App) ImportPath(path string) (Draft, error) {
	ext := strings.ToLower(filepath.Ext(path))
	if ext != ".docx" && ext != ".txt" {
		return Draft{}, fmt.Errorf("请选择 DOCX 或 UTF-8 TXT 文件，也可以直接粘贴正文")
	}
	f, err := os.Open(path)
	if err != nil {
		return Draft{}, fmt.Errorf("无法打开文件，请检查文件是否可访问")
	}
	defer f.Close()
	stat, err := f.Stat()
	if err != nil || !stat.Mode().IsRegular() {
		return Draft{}, fmt.Errorf("请选择普通文件")
	}
	limit := int64(document.MaxDOCXBytes)
	if ext == ".txt" {
		limit = document.MaxTextBytes
	}
	if stat.Size() > limit {
		return Draft{}, fmt.Errorf("文件过大，DOCX 上限为 50 MB，正文上限为 2 MB")
	}
	data, err := io.ReadAll(io.LimitReader(f, limit+1))
	if err != nil || int64(len(data)) > limit {
		return Draft{}, fmt.Errorf("文件读取失败或过大")
	}
	text := strings.TrimPrefix(string(data), "\ufeff")
	if ext == ".docx" {
		text, err = document.ReadDOCX(data)
		if err != nil {
			return Draft{}, err
		}
	}
	if err := document.Validate(text); err != nil {
		return Draft{}, err
	}
	return Draft{Text: document.NormalizeNewlines(text), Name: filepath.Base(path)}, nil
}

func (a *App) Check(text string) (document.Report, error) { return document.Check(text) }
func (a *App) Apply(text, id string) (string, error)      { return document.Apply(text, id) }

// Export always creates a NEW file. It cannot overwrite originals, existing
// outputs or an alias of the original, even if the save dialog permits it.
func (a *App) Export(text, kind string) (string, error) {
	r, err := document.Check(text)
	if err != nil {
		return "", err
	}
	var data []byte
	var ext, description string
	switch kind {
	case "docx":
		data, err = document.DOCX(text)
		ext = ".docx"
		description = "Word 排版草稿"
	case "report":
		data, err = reportHTML(r)
		ext = ".html"
		description = "检查报告"
	default:
		return "", fmt.Errorf("当前版本支持 Word 草稿与检查报告导出")
	}
	if err != nil {
		return "", err
	}
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{Title: "另存新文件", DefaultFilename: "公文-" + description + ext, Filters: []runtime.FileFilter{{DisplayName: description, Pattern: "*" + ext}}})
	if err != nil || path == "" {
		return "", err
	}
	if filepath.Ext(path) == "" {
		path += ext
	}
	if !strings.EqualFold(filepath.Ext(path), ext) {
		return "", fmt.Errorf("文件扩展名应为 %s，请重新选择保存位置", ext)
	}
	if err := writeNew(path, data); err != nil {
		return "", err
	}
	return path, nil
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

func reportHTML(r document.Report) ([]byte, error) {
	t := template.Must(template.New("report").Funcs(template.FuncMap{"oneBased": func(i int) int { return i + 1 }}).Parse(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>公文检查报告</title><style>body{max-width:850px;margin:48px auto;padding:24px;font:16px/1.8 system-ui;color:#242c37}li{margin:16px 0}code{overflow-wrap:anywhere}small{color:#566273}</style><h1>公文检查报告</h1><p>开发预览版 · 规则版本 {{.RuleVersion}}</p><p>已检查：独立成行的日期与发文字号写法。此报告不代表完整公文机检通过。</p><h2>待核对项（{{len .Issues}}）</h2><ol>{{range .Issues}}<li>第 {{oneBased .Paragraph}} 段：{{.Message}}<br>原文：{{.Original}}{{if .Replacement}}<br>建议：{{.Replacement}}{{end}}</li>{{else}}<li>在本次有限检查范围内未发现问题。</li>{{end}}</ol><h2>尚未检查</h2><ul>{{range .Unchecked}}<li>{{.}}</li>{{end}}</ul><p><small>正文 SHA-256：<code>{{.Digest}}</code></small></p></html>`))
	var b strings.Builder
	if err := t.Execute(&b, r); err != nil {
		return nil, err
	}
	return []byte(b.String()), nil
}
