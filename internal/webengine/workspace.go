package webengine

import (
	"archive/zip"
	"bytes"
	"doc2govpdf/internal/office"
	"encoding/json"
	"fmt"
	"io"
	"regexp"
	"strings"
)

type Workspace struct {
	Schema          int               `json:"schema"`
	Name            string            `json:"name"`
	Document        office.Model      `json:"document"`
	Ignored         []string          `json:"ignored"`
	Actions         []json.RawMessage `json:"actions"`
	Fields          office.Fields     `json:"fields"`
	Form            *office.Fields    `json:"form,omitempty"`
	Screen          string            `json:"screen,omitempty"`
	ResumeTarget    string            `json:"resumeTarget,omitempty"`
	Editing         bool              `json:"editing,omitempty"`
	EditingElements bool              `json:"editingElements,omitempty"`
	IncludeComments bool              `json:"includeComments,omitempty"`
	TableDraft      *TableDraft       `json:"tableDraft,omitempty"`
	UpdatedAt       string            `json:"updatedAt,omitempty"`
}
type TableDraft struct {
	Text      string `json:"text"`
	Caption   string `json:"caption"`
	Alignment string `json:"alignment"`
	Anchor    string `json:"anchor"`
	Header    bool   `json:"header"`
	ThreeLine bool   `json:"threeLine"`
}
type Preferences struct {
	Agency          string `json:"agency"`
	ReferencePrefix string `json:"referencePrefix"`
	OutputFormat    string `json:"outputFormat"`
	AutoUpdate      bool   `json:"autoUpdate"`
}
type Backup struct {
	Workspace   Workspace    `json:"workspace"`
	Preferences *Preferences `json:"preferences,omitempty"`
	Source      []byte       `json:"source,omitempty"`
	NeedsSource bool         `json:"needsSource,omitempty"`
}

var sourceID = regexp.MustCompile(`^[a-f0-9]{64}$`)

func validPreferences(p Preferences) error {
	if len(p.Agency) > 300 || len(p.ReferencePrefix) > 100 {
		return fmt.Errorf("单位信息过长")
	}
	if p.OutputFormat != "docx" && p.OutputFormat != "pdf" && p.OutputFormat != "both" {
		return fmt.Errorf("导出格式无效")
	}
	return nil
}
func validateWorkspace(raw json.RawMessage) (Workspace, error) {
	var w Workspace
	raw=bytes.TrimPrefix(raw,[]byte{0xef,0xbb,0xbf})
	if !bytes.HasPrefix(bytes.TrimSpace(raw), []byte("{")) {
		return w, fmt.Errorf("草稿数据损坏，原数据仍保留")
	}
	if len(raw) > 12<<20 {
		return w, fmt.Errorf("草稿超过 12 MB")
	}
	if e := json.Unmarshal(raw, &w); e != nil {
		return w, fmt.Errorf("草稿数据损坏，原数据仍保留")
	}
	var keys map[string]json.RawMessage;_ = json.Unmarshal(raw,&keys);if _,ok:=keys["document"];!ok{return w,fmt.Errorf("草稿缺少文档数据，请选择工作备份或桌面版草稿")}
	if w.Schema > 1 {
		return w, fmt.Errorf("草稿来自更新版本，请升级网页后重试；原数据未更改")
	}
	if w.Schema < 0 {
		return w, fmt.Errorf("草稿版本无效")
	}
	if len(w.Name) > 500 || len(w.Ignored) > 1000 || len(w.Actions) > 1000 {
		return w, fmt.Errorf("草稿记录过多")
	}
	for _, s := range []string{w.Screen, w.ResumeTarget} {
		if s != "" && s != "welcome" && s != "compose" && s != "workspace" {
			return w, fmt.Errorf("草稿界面状态无效")
		}
	}
	if w.Form != nil {
		b, _ := json.Marshal(w.Form)
		if len(b) > 3<<20 {
			return w, fmt.Errorf("新建草稿过大")
		}
	}
	if t := w.TableDraft; t != nil {
		if len(t.Text) > 2<<20 || len([]rune(t.Caption)) > 150 || len(t.Alignment) > 20 {
			return w, fmt.Errorf("表格草稿过大")
		}
	}
	if len(w.Document.Blocks) > 0 {
		if e := w.Document.Validate(); e != nil {
			return w, e
		}
	}
	if w.Document.SourceID != "" && !sourceID.MatchString(w.Document.SourceID) {
		return w, fmt.Errorf("草稿原件标识无效")
	}
	if len(w.Document.Blocks) == 0 && w.Form == nil && w.Name != "" {
		return w, fmt.Errorf("草稿没有可恢复的内容")
	}
	w.Schema = 1
	return w, nil
}
func validateBackup(b Backup) (Backup, error) {
	raw, _ := json.Marshal(b.Workspace)
	w, e := validateWorkspace(raw)
	if e != nil {
		return b, e
	}
	b.Workspace = w
	if b.Preferences != nil {
		if e := validPreferences(*b.Preferences); e != nil {
			return b, e
		}
	}
	b.NeedsSource = false
	if w.Document.SourceID != "" {
		if len(b.Source) == 0 {
			b.NeedsSource = true
		} else {
			p, e := office.Open(b.Source)
			if e != nil || p.Model.SourceID != w.Document.SourceID {
				return b, fmt.Errorf("这份 Word 与草稿原件不匹配，请选择当时导入的原始文件")
			}
			b.Workspace.Document = office.RefreshSourceMetadata(w.Document, p.Model)
		}
	} else if len(b.Source) > 0 {
		return b, fmt.Errorf("新建草稿不应包含来源文件")
	}
	return b, nil
}
func makeBackup(b Backup) (File, error) {
	b, e := validateBackup(b)
	if e != nil {
		return File{}, e
	}
	var out bytes.Buffer
	z := zip.NewWriter(&out)
	files := map[string][]byte{"manifest.json": []byte(`{"format":"doc2govpdf-workspace","version":1}`)}
	files["workspace.json"], _ = json.Marshal(b.Workspace)
	if b.Preferences != nil {
		files["preferences.json"], _ = json.Marshal(b.Preferences)
	}
	if len(b.Source) > 0 {
		files["sources/"+b.Workspace.Document.SourceID+".docx"] = b.Source
	}
	for _, name := range []string{"manifest.json", "workspace.json", "preferences.json", "sources/" + b.Workspace.Document.SourceID + ".docx"} {
		data, ok := files[name]
		if !ok {
			continue
		}
		w, e := z.Create(name)
		if e != nil {
			return File{}, e
		}
		if _, e = w.Write(data); e != nil {
			return File{}, e
		}
	}
	if e := z.Close(); e != nil {
		return File{}, e
	}
	return File{"公文整理-工作备份.gongwen", out.Bytes()}, nil
}
func readBackup(data []byte) (Backup, error) {
	var b Backup
	data = bytes.TrimPrefix(data, []byte{0xef, 0xbb, 0xbf})
	if len(data) > 70<<20 {
		return b, fmt.Errorf("工作备份超过 70 MB")
	}
	if bytes.HasPrefix(bytes.TrimSpace(data), []byte("{")) {
		var legacy struct{Text *string `json:"text"`;Name string `json:"name"`};if json.Unmarshal(data,&legacy)==nil&&legacy.Text!=nil{if strings.TrimSpace(*legacy.Text)==""{return b,fmt.Errorf("旧版文字草稿为空")};b.Workspace=Workspace{Schema:1,Name:legacy.Name,Document:office.Plain(*legacy.Text),Screen:"workspace"};return validateBackup(b)}
		w, e := validateWorkspace(bytes.TrimPrefix(data, []byte{0xef, 0xbb, 0xbf}))
		b.Workspace = w
		if e != nil {
			return b, e
		}
		return validateBackup(b)
	}
	z, e := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if e != nil || len(z.File) > 5 {
		return b, fmt.Errorf("请选择工作备份或桌面版 workspace.json")
	}
	files := map[string][]byte{}
	var total int64
	for _, f := range z.File {
		if f.FileInfo().IsDir() && f.Name == "sources/" {
			continue
		}
		if f.Name != "manifest.json" && f.Name != "workspace.json" && f.Name != "preferences.json" && !(strings.HasPrefix(f.Name, "sources/") && strings.HasSuffix(f.Name, ".docx") && sourceID.MatchString(strings.TrimSuffix(strings.TrimPrefix(f.Name, "sources/"), ".docx"))) {
			return b, fmt.Errorf("备份包含不支持的文件")
		}
		if _, exists := files[f.Name]; exists {
			return b, fmt.Errorf("备份包含重复文件")
		}
		if f.UncompressedSize64 > 65<<20 {
			return b, fmt.Errorf("备份内容过大")
		}
		r, e := f.Open()
		if e != nil {
			return b, e
		}
		content, e := io.ReadAll(io.LimitReader(r, (65<<20)-total+1))
		r.Close()
		if e != nil {
			return b, e
		}
		total += int64(len(content))
		if total > 65<<20 {
			return b, fmt.Errorf("备份解压后超过大小限制")
		}
		files[f.Name] = content
	}
	if manifest, ok := files["manifest.json"]; ok {
		var m struct {
			Format  string `json:"format"`
			Version int    `json:"version"`
		}
		if json.Unmarshal(manifest, &m) != nil || m.Format != "doc2govpdf-workspace" || m.Version != 1 {
			return b, fmt.Errorf("备份版本不支持，请升级网页后重试")
		}
	}
	b.Workspace, e = validateWorkspace(files["workspace.json"])
	if e != nil {
		return b, e
	}
	if p, ok := files["preferences.json"]; ok {
		b.Preferences = &Preferences{}
		if json.Unmarshal(p, b.Preferences) != nil {
			return b, fmt.Errorf("备份中的设置损坏")
		}
	}
	b.Source = files["sources/"+b.Workspace.Document.SourceID+".docx"]
	return validateBackup(b)
}
