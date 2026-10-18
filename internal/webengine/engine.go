// Package webengine is the filesystem-free boundary used by the browser worker.
package webengine

import (
	"archive/zip"
	"bytes"
	"context"
	"doc2govpdf/internal/office"
	"encoding/json"
	"fmt"
	"strings"
	"unicode/utf8"
)

type Request struct {
	Method string            `json:"method"`
	Args   []json.RawMessage `json:"args"`
}
type Reply struct {
	Value any    `json:"value,omitempty"`
	Error string `json:"error,omitempty"`
}
type File struct {
	Name string `json:"name"`
	Data []byte `json:"data"`
}

func Call(raw string) (out string) {
	defer func() {
		if recover() != nil {
			out = `{"error":"文档处理失败，草稿仍保留。请检查文件后重试。"}`
		}
	}()
	var req Request
	if e := json.Unmarshal([]byte(raw), &req); e != nil {
		return `{"error":"无效请求"}`
	}
	value, e := dispatch(req)
	r := Reply{Value: value}
	if e != nil {
		r.Value = nil
		r.Error = e.Error()
	}
	b, e := json.Marshal(r)
	if e != nil {
		return `{"error":"无法序列化文档结果"}`
	}
	return string(b)
}
func dispatch(r Request) (any, error) {
	arg := func(i int, v any) error {
		if i >= len(r.Args) {
			return fmt.Errorf("缺少参数")
		}
		return json.Unmarshal(r.Args[i], v)
	}
	var m office.Model
	var f office.Fields
	var text, id string
	switch r.Method {
	case "Templates":
		return office.Templates(), nil
	case "Fonts":
		return office.FontStatus(), nil
	case "RegisterFont":
		var b []byte
		if e := arg(0, &text); e != nil {
			return nil, e
		}
		if e := arg(1, &b); e != nil {
			return nil, e
		}
		return nil, office.RegisterFont(text, b)
	case "BuildDocument":
		if e := arg(0, &f); e != nil {
			return nil, e
		}
		return office.NewDocument(f)
	case "Import":
		var b []byte
		if e := arg(0, &text); e != nil {
			return nil, e
		}
		if e := arg(1, &b); e != nil {
			return nil, e
		}
		if len(b) > 50<<20 {
			return nil, fmt.Errorf("文件超过 50 MB")
		}
		if strings.HasSuffix(strings.ToLower(text), ".txt") {
			if !utf8.Valid(b) {
				return nil, fmt.Errorf("请选择 UTF-8 编码的文本")
			}
			m = office.Plain(strings.TrimPrefix(string(b), "\ufeff"))
			return m, m.Validate()
		}
		if !strings.HasSuffix(strings.ToLower(text), ".docx") {
			return nil, fmt.Errorf("请选择 DOCX 或 TXT 文件")
		}
		p, e := office.Open(b)
		if e != nil {
			return nil, e
		}
		return p.Model, nil
	case "InspectPDF":
		var b []byte
		var allow []string
		if e := arg(0, &b); e != nil {
			return nil, e
		}
		if len(r.Args) > 1 {
			if e := arg(1, &allow); e != nil {
				return nil, e
			}
		}
		return office.InspectPDFBytes(context.Background(), b, allow)
	}
	if e := arg(0, &m); e != nil {
		return nil, e
	}
	if e := m.Validate(); e != nil {
		return nil, e
	}
	switch r.Method {
	case "InspectDocument":
		return office.Inspect(m)
	case "ApplyDocumentFix":
		if e := arg(1, &id); e != nil {
			return nil, e
		}
		return office.ApplyFinding(m, id)
	case "NormalizeDocument":
		return office.NormalizeLayout(m), nil
	case "SetParagraphRole":
		if e := arg(1, &id); e != nil {
			return nil, e
		}
		if e := arg(2, &text); e != nil {
			return nil, e
		}
		return office.SetRole(m, id, text)
	case "UpdateDocumentElements":
		if e := arg(1, &f); e != nil {
			return nil, e
		}
		return office.UpdateElements(m, f)
	case "PreviewSafeRepairs":
		var ignored []string
		if e := arg(1, &ignored); e != nil {
			return nil, e
		}
		inspection, e := office.Inspect(m)
		if e != nil {
			return nil, e
		}
		ids := map[string]bool{}
		for _, id := range ignored {
			ids[id] = true
		}
		skip := map[string]bool{}
		for _, f := range inspection.Issues {
			if ids[f.ID] && f.Replacement != "" {
				skip[f.ParagraphID] = true
			}
		}
		return office.PlanSafeRepairsSkipping(m, skip)
	case "PreviewDocument":
		m = office.RenumberDocument(m)
		result, e := office.RenderPDF(context.Background(), m)
		if e != nil {
			return nil, e
		}
		prefixes := map[string]string{}
		for _, p := range m.Paragraphs() {
			prefixes[p.ID] = p.Prefix
		}
		return map[string]any{"pdf": result.Data, "pages": result.Pages, "warnings": result.Warnings, "prefixes": prefixes}, nil
	case "ExportDocument":
		var format string
		var tracked bool
		var original []byte
		if e := arg(1, &format); e != nil {
			return nil, e
		}
		if e := arg(2, &tracked); e != nil {
			return nil, e
		}
		if e := arg(3, &original); e != nil {
			return nil, e
		}
		if format != "pdf" && format != "docx" && format != "both" {
			return nil, fmt.Errorf("导出格式无效")
		}
		inspection, e := office.Inspect(m)
		if e != nil {
			return nil, e
		}
		confirmed := map[string]bool{}
		for _, id := range m.ConfirmedIssues {
			confirmed[id] = true
		}
		for _, f := range inspection.Issues {
			if f.Severity == "error" {
				return nil, fmt.Errorf("请先处理：%s", f.Message)
			}
			if f.Severity == "review" && !confirmed[f.ID] {
				noted := false
				if format == "docx" {
					for _, note := range m.ReviewComments {
						if strings.Contains(note.Text, f.Message) {
							noted = true
						}
					}
				}
				if !noted {
					return nil, fmt.Errorf("请先核对：%s", f.Message)
				}
			}
		}
		title := "公文"
		for _, p := range m.Paragraphs() {
			if p.Role == "title" {
				title = p.Text
				break
			}
		}
		title = strings.Map(func(r rune) rune {
			if r < 32 || strings.ContainsRune(`<>:"/\|?*`, r) {
				return '-'
			}
			return r
		}, title)
		if len([]rune(title)) > 60 {
			title = string([]rune(title)[:60])
		}
		title += "-整理稿"
		files := []File{}
		if format != "pdf" {
			var b []byte
			if m.SourceID != "" {
				p, err := office.Open(original)
				if err != nil {
					return nil, fmt.Errorf("原始文件副本缺失或损坏，请重新导入")
				}
				if p.Model.SourceID != m.SourceID {
					return nil, fmt.Errorf("原始文件与当前文档不匹配")
				}
				b, e = p.Export(m, tracked)
			} else {
				b, e = office.CreateDOCX(m)
			}
			if e != nil {
				return nil, e
			}
			b, e = office.AddReviewComments(b, m, m.ReviewComments)
			if e != nil {
				return nil, e
			}
			files = append(files, File{title + ".docx", b})
		}
		if format != "docx" {
			pdf, e := office.RenderPDF(context.Background(), m)
			if e != nil {
				return nil, e
			}
			files = append(files, File{title + ".pdf", pdf.Data})
		}
		if len(files) == 1 {
			return files[0], nil
		}
		var b bytes.Buffer
		z := zip.NewWriter(&b)
		for _, f := range files {
			w, e := z.Create(f.Name)
			if e != nil {
				return nil, e
			}
			if _, e = w.Write(f.Data); e != nil {
				return nil, e
			}
		}
		if e = z.Close(); e != nil {
			return nil, e
		}
		return File{title + ".zip", b.Bytes()}, nil
	}
	return nil, fmt.Errorf("不支持的操作：%s", r.Method)
}
