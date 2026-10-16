package main

import (
	"bytes"
	"context"
	"doc2govpdf/internal/office"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

type PDFReview struct {
	Name       string               `json:"name"`
	PDF        string               `json:"pdf"`
	Inspection office.PDFInspection `json:"inspection"`
}

func pdfInspectionWorker() {
	data, e := io.ReadAll(io.LimitReader(os.Stdin, 46*1024*1024))
	reply := office.PDFInspectionReply{}
	var request office.PDFInspectionRequest
	if e == nil {
		e = json.Unmarshal(data, &request)
	}
	if e == nil {
		reply.Result, e = office.InspectPDFBytes(context.Background(), request.Data, request.Allow)
	}
	if e != nil {
		reply.Error = e.Error()
	}
	json.NewEncoder(os.Stdout).Encode(reply)
}
func (a *App) inspectPDF(data []byte, allow []string) (office.PDFInspection, error) {
	var reply office.PDFInspectionReply
	if len(data) > 32*1024*1024 {
		return reply.Result, fmt.Errorf("PDF 超过 32 MB")
	}
	if len(allow) > 30 {
		return reply.Result, fmt.Errorf("自定义字体最多 30 项")
	}
	for _, s := range allow {
		if len(s) > 200 {
			return reply.Result, fmt.Errorf("字体名称过长")
		}
	}
	exe, e := os.Executable()
	if e != nil {
		return reply.Result, e
	}
	ctx, cancel := context.WithTimeout(a.ctx, 20*time.Second)
	defer cancel()
	request, _ := json.Marshal(office.PDFInspectionRequest{Data: data, Allow: allow})
	cmd := exec.CommandContext(ctx, exe, "--inspect-pdf-worker")
	cmd.Env = append(os.Environ(), "GOMEMLIMIT=512MiB")
	hideCommand(cmd)
	cmd.Stdin = bytes.NewReader(request)
	out, e := cmd.Output()
	if ctx.Err() != nil {
		return reply.Result, fmt.Errorf("PDF 解析超时或取消，文件和草稿均保留")
	}
	if e != nil {
		return reply.Result, fmt.Errorf("PDF 检查进程未能完成")
	}
	if e = json.Unmarshal(out, &reply); e != nil {
		return reply.Result, fmt.Errorf("PDF 检查结果无效")
	}
	if reply.Error != "" {
		return reply.Result, fmt.Errorf("%s", reply.Error)
	}
	return reply.Result, nil
}
func (a *App) ReviewPDFFile() (PDFReview, error) {
	var result PDFReview
	file, e := openDocumentDialog(a.ctx, runtime.OpenDialogOptions{Title: "打开成品 PDF 核对", Filters: []runtime.FileFilter{{DisplayName: "PDF", Pattern: "*.pdf"}}})
	if e != nil || file == "" {
		return result, e
	}
	info, e := os.Stat(file)
	if e != nil {
		return result, e
	}
	if info.Size() > 32*1024*1024 {
		return result, fmt.Errorf("请选择不超过 32 MB 的 PDF")
	}
	data, e := os.ReadFile(file)
	if e != nil {
		return result, e
	}
	result.Inspection, e = a.inspectPDF(data, nil)
	if e != nil {
		return result, e
	}
	result.Name = filepath.Base(file)
	result.PDF = base64.StdEncoding.EncodeToString(data)
	return result, nil
}
func (a *App) RecheckPDF(encoded string, allow []string) (office.PDFInspection, error) {
	if len(encoded) > 45*1024*1024 {
		return office.PDFInspection{}, fmt.Errorf("PDF 超过大小限制")
	}
	data, e := base64.StdEncoding.DecodeString(encoded)
	if e != nil {
		return office.PDFInspection{}, fmt.Errorf("PDF 数据无效")
	}
	return a.inspectPDF(data, allow)
}
