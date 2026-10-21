package webengine

import (
	"archive/zip"
	"bytes"
	"doc2govpdf/internal/office"
	"encoding/json"
	"os"
	"testing"
)

func TestWorkspaceBackupPreservesImportedEditsAndOriginal(t *testing.T) {
	raw, e := os.ReadFile("../../testdata/upstream/parity/repair/messy.docx")
	if e != nil {
		t.Fatal(e)
	}
	p, e := office.Open(raw)
	if e != nil {
		t.Fatal(e)
	}
	m := p.Model.Clone()
	for _, p := range m.Paragraphs() {
		if !p.Protected && p.Role == "body" {
			p.Text += "保留已编辑内容。"
			break
		}
	}
	b := Backup{Workspace: Workspace{Schema: 1, Name: "保真草稿", Document: m, Screen: "workspace", Editing: true, IncludeComments: true, Ignored: []string{"confirmed"}, Form: &office.Fields{Title: "尚未提交的表单"}, TableDraft: &TableDraft{Text: "列一\t列二", Caption: "表题", Alignment: "numeric"}}, Source: raw, Preferences: &Preferences{Agency: "测试单位", OutputFormat: "both"}}
	file, e := makeBackup(b)
	if e != nil {
		t.Fatal(e)
	}
	restored, e := readBackup(file.Data)
	if e != nil {
		t.Fatal(e)
	}
	if !bytes.Equal(raw, restored.Source) || restored.Workspace.Document.Text() != m.Text() || !restored.Workspace.Editing || restored.Workspace.TableDraft.Caption != "表题" || restored.Workspace.Form.Title != "尚未提交的表单" || !restored.Workspace.IncludeComments {
		t.Fatal("backup lost state")
	}
	desktop, _ := json.Marshal(b.Workspace)
	linked, e := readBackup(append([]byte{0xef, 0xbb, 0xbf}, desktop...))
	if e != nil || !linked.NeedsSource {
		t.Fatal("desktop migration must request original", e)
	}
	linked.Source = raw
	if _, e = validateBackup(linked); e != nil {
		t.Fatal(e)
	}
	linked.Source = []byte("wrong")
	if _, e = validateBackup(linked); e == nil {
		t.Fatal("wrong original accepted")
	}
}
func TestWorkspaceRejectsInvalidAndFutureStates(t *testing.T) {
	for _, raw := range []string{`null`, `{"schema":2}`, `{"screen":"unknown"}`, `{"document":{"sourceId":"../file"}}`, `{"name":"lost"}`} {
		if _, e := validateWorkspace([]byte(raw)); e == nil {
			t.Fatal("accepted", raw)
		}
	}
	var b bytes.Buffer
	z := zip.NewWriter(&b)
	w, _ := z.Create("../workspace.json")
	w.Write([]byte("{}"))
	z.Close()
	if _, e := readBackup(b.Bytes()); e == nil {
		t.Fatal("archive path accepted")
	}
	for _, p := range []Preferences{{OutputFormat: "html"}, {Agency: string(bytes.Repeat([]byte("a"), 301)), OutputFormat: "pdf"}} {
		if validPreferences(p) == nil {
			t.Fatal("invalid settings")
		}
	}
}

func TestLegacyTextDraftMigration(t *testing.T){
 b,e:=readBackup([]byte(`{"name":"旧版草稿","text":"材料核对通知\n请核对材料。"}`));if e!=nil||b.Workspace.Document.Text()!="材料核对通知\n请核对材料。"{t.Fatal(b,e)}
 if _,e:=readBackup([]byte(`{"workspace":{"schema":1}}`));e==nil{t.Fatal("unrecognized JSON silently restored as empty")}
}
