package main

import (
	"context"
	"crypto/sha256"
	"doc2govpdf/internal/office"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// Native dialogs remain the production default. Test builds replace only the
// chooser result; import, validation, rendering and file writes remain real.
var openDocumentDialog = runtime.OpenFileDialog
var saveDocumentDialog = runtime.SaveFileDialog
var openOutputDirectory = runtime.OpenDirectoryDialog

type Action struct {
	Time        string `json:"time"`
	Kind        string `json:"kind"`
	ParagraphID string `json:"paragraphId"`
	Before      string `json:"before"`
	After       string `json:"after"`
}
type Workspace struct {
	Schema       int            `json:"schema"`
	Name         string         `json:"name"`
	Document     office.Model   `json:"document"`
	Ignored      []string       `json:"ignored"`
	Actions      []Action       `json:"actions"`
	Fields       office.Fields  `json:"fields"`
	Form         *office.Fields `json:"form,omitempty"`
	Screen       string         `json:"screen,omitempty"`
	ResumeTarget string         `json:"resumeTarget,omitempty"`
	Editing      bool           `json:"editing,omitempty"`
	TableDraft   *TableDraft    `json:"tableDraft,omitempty"`
	UpdatedAt    string         `json:"updatedAt"`
}
type TableDraft struct {
	Text      string `json:"text"`
	Header    bool   `json:"header"`
	ThreeLine bool   `json:"threeLine"`
	Anchor    string `json:"anchor"`
}
type Preferences struct {
	Agency          string `json:"agency"`
	ReferencePrefix string `json:"referencePrefix"`
	OutputFormat    string `json:"outputFormat"`
	AutoUpdate      bool   `json:"autoUpdate"`
}
type Preview struct {
	PDF      string   `json:"pdf"`
	Pages    int      `json:"pages"`
	Warnings []string `json:"warnings"`
	Digest   string   `json:"digest"`
}
type ExportResult struct {
	Paths    []string `json:"paths"`
	Warnings []string `json:"warnings"`
}

func (a *App) Templates() []office.Template { return office.Templates() }
func (a *App) Fonts() []office.FontInfo     { return office.FontStatus() }
func (a *App) BuildDocument(fields office.Fields) (office.Model, error) {
	return office.NewDocument(fields)
}
func (a *App) InspectDocument(m office.Model) (office.Inspection, error) { return office.Inspect(m) }
func (a *App) ApplyDocumentFix(m office.Model, id string) (office.Model, error) {
	return office.ApplyFinding(m, id)
}
func (a *App) GetWorkspace() (Workspace, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	var w Workspace
	b, e := os.ReadFile(filepath.Join(a.draftDir, "workspace.json"))
	if os.IsNotExist(e) {
		legacy, le := os.ReadFile(filepath.Join(a.draftDir, "draft.json"))
		if le == nil {
			var d Draft
			if json.Unmarshal(legacy, &d) == nil && strings.TrimSpace(d.Text) != "" {
				w.Name = d.Name
				w.Document = office.Plain(d.Text)
			}
		}
		return w, nil
	}
	if e != nil {
		return w, fmt.Errorf("无法读取上次工作，已保留本地数据")
	}
	if len(b) > 12*1024*1024 || json.Unmarshal(b, &w) != nil {
		a.workspaceReadFailed = true
		return w, fmt.Errorf("上次工作数据损坏，未覆盖原文件")
	}
	if w.Schema > 1 {
		a.workspaceReadFailed = true
		return w, fmt.Errorf("草稿来自更新版本，已保留文件；请升级后再打开")
	}
	if len(w.Document.Blocks) > 0 {
		if e = w.Document.Validate(); e != nil {
			a.workspaceReadFailed = true
			return w, e
		}
	}
	return w, nil
}
func (a *App) SaveWorkspace(w Workspace) error {
	if a.startupError != nil {
		return fmt.Errorf("升级前备份未完成，未改动草稿")
	}
	w.Schema = 1
	if w.TableDraft != nil && len(w.TableDraft.Text) > 2*1024*1024 {
		return fmt.Errorf("表格草稿过大，请分批添加")
	}
	if w.Screen != "" && w.Screen != "welcome" && w.Screen != "compose" && w.Screen != "workspace" {
		return fmt.Errorf("工作界面状态无效")
	}
	if w.Form != nil {
		data, e := json.Marshal(w.Form)
		if e != nil || len(data) > 3*1024*1024 {
			return fmt.Errorf("新建草稿过大，请缩短正文")
		}
	}
	if len(w.Document.Blocks) > 0 {
		if e := w.Document.Validate(); e != nil {
			return e
		}
	}
	if len(w.Actions) > 1000 {
		w.Actions = w.Actions[len(w.Actions)-1000:]
	}
	if len(w.Name) > 500 || len(w.Ignored) > 1000 {
		return fmt.Errorf("工作数据过大")
	}
	w.UpdatedAt = time.Now().Format(time.RFC3339)
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.workspaceReadFailed {
		if len(w.Document.Blocks) == 0 && w.Form == nil {
			return nil
		}
		old, e := os.ReadFile(filepath.Join(a.draftDir, "workspace.json"))
		if e != nil {
			return fmt.Errorf("原草稿无法备份，未覆盖原文件")
		}
		backup := filepath.Join(a.draftDir, fmt.Sprintf("workspace-recovery-%d.json", time.Now().UnixNano()))
		if e = writeNew(backup, old); e != nil {
			return e
		}
		a.workspaceReadFailed = false
	}
	return saveJSON(filepath.Join(a.draftDir, "workspace.json"), w)
}
func saveJSON(path string, value interface{}) error {
	data, e := json.Marshal(value)
	if e != nil {
		return e
	}
	if len(data) > 12*1024*1024 {
		return fmt.Errorf("保存数据过大")
	}
	dir := filepath.Dir(path)
	if e = os.MkdirAll(dir, 0700); e != nil {
		return e
	}
	f, e := os.CreateTemp(dir, ".save-*.tmp")
	if e != nil {
		return e
	}
	name := f.Name()
	defer os.Remove(name)
	if _, e = f.Write(data); e == nil {
		e = f.Sync()
	}
	closeErr := f.Close()
	if e == nil {
		e = closeErr
	}
	if e != nil {
		return e
	}
	return os.Rename(name, path)
}
func (a *App) GetPreferences() (Preferences, error) {
	p := Preferences{OutputFormat: "both", AutoUpdate: true}
	b, e := os.ReadFile(filepath.Join(a.draftDir, "preferences.json"))
	if os.IsNotExist(e) {
		return p, nil
	}
	if e != nil {
		return p, e
	}
	if e = json.Unmarshal(b, &p); e != nil {
		return p, fmt.Errorf("设置损坏，请重新保存设置")
	}
	if p.OutputFormat != "both" && p.OutputFormat != "pdf" && p.OutputFormat != "docx" {
		p.OutputFormat = "both"
	}
	return p, nil
}
func (a *App) SavePreferences(p Preferences) error {
	if a.startupError != nil {
		return fmt.Errorf("升级前备份未完成，未改动设置")
	}
	previous, _ := a.GetPreferences()
	if len(p.Agency) > 300 || len(p.ReferencePrefix) > 100 {
		return fmt.Errorf("单位信息过长")
	}
	if p.OutputFormat != "both" && p.OutputFormat != "pdf" && p.OutputFormat != "docx" {
		return fmt.Errorf("导出格式无效")
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if e := saveJSON(filepath.Join(a.draftDir, "preferences.json"), p); e != nil {
		return e
	}
	if previous.AutoUpdate && !p.AutoUpdate {
		a.updateMu.Lock()
		if a.updateCancel != nil {
			a.updateCancel()
		}
		a.updateMu.Unlock()
	}
	if !previous.AutoUpdate && p.AutoUpdate {
		_ = os.Remove(filepath.Join(a.draftDir, "updates", "last-check"))
	}
	return nil
}
func (a *App) ImportWorkspace() (Workspace, error) {
	path, e := openDocumentDialog(a.ctx, runtime.OpenDialogOptions{Title: "选择公文", Filters: []runtime.FileFilter{{DisplayName: "Word 或文本", Pattern: "*.docx;*.txt"}}})
	if e != nil || path == "" {
		return Workspace{}, e
	}
	return a.OpenWorkspacePath(path)
}
func (a *App) OpenWorkspacePath(path string) (Workspace, error) {
	var w Workspace
	ext := strings.ToLower(filepath.Ext(path))
	if ext != ".docx" && ext != ".txt" {
		return w, fmt.Errorf("请选择 DOCX 或 UTF-8 TXT 文件")
	}
	info, e := os.Stat(path)
	if e != nil || !info.Mode().IsRegular() {
		return w, fmt.Errorf("无法读取所选文件")
	}
	if info.Size() > 50*1024*1024 {
		return w, fmt.Errorf("文件超过 50 MB")
	}
	b, e := os.ReadFile(path)
	if e != nil {
		return w, e
	}
	w.Name = filepath.Base(path)
	w.Ignored = []string{}
	w.Actions = []Action{}
	if ext == ".txt" {
		w.Document = office.Plain(strings.TrimPrefix(string(b), "\ufeff"))
		return w, w.Document.Validate()
	}
	p, e := office.Open(b)
	if e != nil {
		return w, e
	}
	w.Document = p.Model
	folder := filepath.Join(a.draftDir, "sources")
	if e = os.MkdirAll(folder, 0700); e != nil {
		return w, e
	}
	sourcePath := filepath.Join(folder, p.Model.SourceID+".docx")
	if _, e = os.Stat(sourcePath); os.IsNotExist(e) {
		if e = writeNew(sourcePath, b); e != nil {
			return w, e
		}
	}
	return w, nil
}
func modelDigest(m office.Model) string {
	b, _ := json.Marshal(m)
	return fmt.Sprintf("%x", sha256.Sum256(b))
}
func (a *App) PreviewDocument(m office.Model) (Preview, error) {
	key := modelDigest(m)
	a.previewMu.Lock()
	if key == a.previewKey {
		v := a.previewValue
		a.previewMu.Unlock()
		return v, nil
	}
	if a.previewCancel != nil {
		a.previewCancel()
	}
	ctx, cancel := context.WithCancel(a.ctx)
	a.previewCancel = cancel
	a.previewMu.Unlock()
	defer cancel()
	r, e := office.RenderPDF(ctx, m)
	if e != nil {
		return Preview{}, e
	}
	v := Preview{PDF: base64.StdEncoding.EncodeToString(r.Data), Pages: r.Pages, Warnings: r.Warnings, Digest: key}
	a.previewMu.Lock()
	defer a.previewMu.Unlock()
	if ctx.Err() != nil {
		return Preview{}, ctx.Err()
	}
	a.previewKey = key
	a.previewValue = v
	return v, nil
}
func (a *App) CancelPreview() {
	a.previewMu.Lock()
	defer a.previewMu.Unlock()
	if a.previewCancel != nil {
		a.previewCancel()
	}
}

var sourceIDPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)

func (a *App) docxBytes(m office.Model, tracked bool) ([]byte, error) {
	if m.SourceID == "" {
		return office.CreateDOCX(m)
	}
	if !sourceIDPattern.MatchString(m.SourceID) {
		return nil, fmt.Errorf("文档来源标识无效")
	}
	b, e := os.ReadFile(filepath.Join(a.draftDir, "sources", m.SourceID+".docx"))
	if e != nil {
		return nil, fmt.Errorf("原始文档副本缺失，请重新导入；当前正文仍保留")
	}
	p, e := office.Open(b)
	if e != nil {
		return nil, e
	}
	return p.Export(m, tracked)
}
func safeTitle(m office.Model) string {
	title := "公文"
	for _, p := range m.Paragraphs() {
		if p.Role == "title" && strings.TrimSpace(p.Text) != "" {
			title = p.Text
			break
		}
	}
	title = strings.Map(func(r rune) rune {
		if strings.ContainsRune(`<>:"/\|?*`, r) || r < 32 {
			return '-'
		}
		return r
	}, title)
	r := []rune(title)
	if len(r) > 60 {
		r = r[:60]
	}
	return strings.TrimRight(string(r), " .") + "-整理稿"
}
func availablePath(dir, base, ext string) string {
	for i := 0; i < 10000; i++ {
		suffix := ""
		if i > 0 {
			suffix = fmt.Sprintf("-%d", i)
		}
		p := filepath.Join(dir, base+suffix+ext)
		if _, e := os.Stat(p); os.IsNotExist(e) {
			return p
		}
	}
	return filepath.Join(dir, fmt.Sprintf("%s-%d%s", base, time.Now().UnixNano(), ext))
}
func availablePair(dir, base string) []string {
	for i := 0; i < 10000; i++ {
		name := base
		if i > 0 {
			name = fmt.Sprintf("%s-%d", base, i)
		}
		docx, pdf := filepath.Join(dir, name+".docx"), filepath.Join(dir, name+".pdf")
		_, de := os.Stat(docx)
		_, pe := os.Stat(pdf)
		if os.IsNotExist(de) && os.IsNotExist(pe) {
			return []string{docx, pdf}
		}
	}
	name := fmt.Sprintf("%s-%d", base, time.Now().UnixNano())
	return []string{filepath.Join(dir, name+".docx"), filepath.Join(dir, name+".pdf")}
}
func (a *App) ExportDocument(m office.Model, format string, tracked bool) (ExportResult, error) {
	a.mu.Lock()
	a.jobs++
	a.mu.Unlock()
	defer func() { a.mu.Lock(); a.jobs--; a.mu.Unlock() }()
	result := ExportResult{Paths: []string{}, Warnings: []string{}}
	if format != "docx" && format != "pdf" && format != "both" {
		return result, fmt.Errorf("请选择 Word、PDF 或两者")
	}
	if e := m.Validate(); e != nil {
		return result, e
	}
	inspection, e := office.Inspect(m)
	if e != nil {
		return result, e
	}
	for _, issue := range inspection.Issues {
		if issue.Severity == "error" {
			return result, fmt.Errorf("请先处理：%s", issue.Message)
		}
	}
	var docx, pdf []byte
	if format != "pdf" {
		docx, e = a.docxBytes(m, tracked)
		if e != nil {
			return result, e
		}
	}
	if format != "docx" {
		preview, err := a.PreviewDocument(m)
		if err != nil {
			return result, err
		}
		pdf, e = base64.StdEncoding.DecodeString(preview.PDF)
		if e != nil {
			return result, e
		}
		result.Warnings = preview.Warnings
	}
	base := safeTitle(m)
	paths := []string{}
	payloads := [][]byte{}
	if format == "both" {
		dir, err := openOutputDirectory(a.ctx, runtime.OpenDialogOptions{Title: "选择成品保存文件夹"})
		if err != nil || dir == "" {
			return result, err
		}
		paths = availablePair(dir, base)
		payloads = [][]byte{docx, pdf}
	} else {
		ext := "." + format
		path, err := saveDocumentDialog(a.ctx, runtime.SaveDialogOptions{Title: "保存成品", DefaultFilename: base + ext, Filters: []runtime.FileFilter{{DisplayName: strings.ToUpper(format), Pattern: "*" + ext}}})
		if err != nil || path == "" {
			return result, err
		}
		if filepath.Ext(path) == "" {
			path += ext
		}
		if !strings.EqualFold(filepath.Ext(path), ext) {
			return result, fmt.Errorf("文件扩展名应为 %s", ext)
		}
		paths = []string{path}
		if format == "pdf" {
			payloads = [][]byte{pdf}
		} else {
			payloads = [][]byte{docx}
		}
	}
	for i, path := range paths {
		if e = writeNew(path, payloads[i]); e != nil {
			for _, created := range result.Paths {
				_ = os.Remove(created)
			}
			return ExportResult{}, e
		}
		result.Paths = append(result.Paths, path)
	}
	a.mu.Lock()
	a.lastOutputs = append([]string(nil), result.Paths...)
	a.mu.Unlock()
	return result, nil
}
