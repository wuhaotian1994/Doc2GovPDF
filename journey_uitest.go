//go:build uitest

package main

import (
	"archive/zip"
	"bytes"
	"context"
	"doc2govpdf/internal/office"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

var qaDialogMu sync.Mutex
var qaDialogPaths []string
var qaOpened []string

func (a *App) QAOpened() []string {
	qaDialogMu.Lock()
	defer qaDialogMu.Unlock()
	return append([]string{}, qaOpened...)
}

func (a *App) QAQueueDialog(path string) {
	qaDialogMu.Lock()
	defer qaDialogMu.Unlock()
	qaDialogPaths = append(qaDialogPaths, path)
}
func qaDialogPath() (string, error) {
	qaDialogMu.Lock()
	defer qaDialogMu.Unlock()
	if len(qaDialogPaths) == 0 {
		return "", fmt.Errorf("QA dialog result missing")
	}
	p := qaDialogPaths[0]
	qaDialogPaths = qaDialogPaths[1:]
	return p, nil
}

func (a *App) qaFixtures() (map[string]interface{}, error) {
	launchResult = func(path string) error {
		qaDialogMu.Lock()
		defer qaDialogMu.Unlock()
		qaOpened = append(qaOpened, path)
		return nil
	}
	root, e := os.Getwd()
	if e != nil {
		return nil, e
	}
	out := filepath.Join(a.draftDir, "exports")
	if e = os.MkdirAll(out, 0700); e != nil {
		return nil, e
	}
	files, e := filepath.Glob(filepath.Join(root, "testdata/upstream/gongwen-kit/docx/*.docx"))
	if e != nil {
		return nil, e
	}
	txt := filepath.Join(a.draftDir, "输入样稿.txt")
	os.WriteFile(txt, []byte("测试通知\n各部门：\n请按计划完成资料整理。"), 0600)
	bad := filepath.Join(a.draftDir, "损坏文件.docx")
	os.WriteFile(bad, []byte("not a DOCX"), 0600)
	empty := filepath.Join(a.draftDir, "空文件.txt")
	os.WriteFile(empty, nil, 0600)
	unsupported := filepath.Join(a.draftDir, "含公式.docx")
	b, e := office.CreateDOCX(office.Plain("复杂对象测试\n保留原有公式对象。"))
	if e != nil {
		return nil, e
	}
	z, _ := zip.NewReader(bytes.NewReader(b), int64(len(b)))
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)
	for _, f := range z.File {
		r, _ := f.Open()
		data, _ := io.ReadAll(r)
		r.Close()
		if f.Name == "word/document.xml" {
			data = []byte(strings.Replace(string(data), "</w:p>", `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:r><m:t>x</m:t></m:r></m:oMath></w:p>`, 1))
		}
		part, _ := w.Create(f.Name)
		part.Write(data)
	}
	w.Close()
	os.WriteFile(unsupported, buf.Bytes(), 0600)
	openDocumentDialog = func(context.Context, runtime.OpenDialogOptions) (string, error) { return qaDialogPath() }
	saveDocumentDialog = func(context.Context, runtime.SaveDialogOptions) (string, error) { return qaDialogPath() }
	openOutputDirectory = func(context.Context, runtime.OpenDialogOptions) (string, error) { return qaDialogPath() }
	return map[string]interface{}{"phase": os.Getenv("DOC2GOVPDF_QA_PHASE"), "files": files, "pdf": filepath.Join(root, "testdata/upstream/gongwen-kit/pdf/公文通知.pdf"), "text": txt, "bad": bad, "empty": empty, "unsupported": unsupported, "output": out}, nil
}
