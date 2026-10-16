package office

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestExtendedTemplateElements(t *testing.T) {
	base := Fields{Kind: "notice", Title: "关于开展资料核对工作的通知", Body: "一、工作安排\n各单位应当逐项核对资料，确保内容完整、数字准确。\n二、有关要求\n请妥善保存原始材料。", Agency: "示例市人民政府", Reference: "示政发〔2026〕12号", Date: "2026年10月16日", Letterhead: true, Recipient: "各有关单位", CopyTo: "有关部门"}
	cases := map[string]Fields{}
	joint := base
	joint.Agencies = []string{"示例市人民政府", "示例市财政局"}
	joint.CopyNumber = "1"
	joint.Classification = "秘密"
	joint.SecrecyPeriod = "1年"
	joint.Urgency = "特急"
	joint.Issuer = "示例市人民政府办公室"
	joint.IssueDate = "2026年10月17日"
	joint.Note = "（联系人：张三，联系电话：010-12345678。）"
	cases["joint-notice"] = joint
	up := joint
	up.Kind = "request"
	up.Title = "关于开展资料核对工作的请示"
	up.Signers = []string{"张三", "李四", "王五", "赵六", "钱七"}
	cases["joint-request"] = up
	preprinted := joint
	preprinted.Preprinted = true
	cases["preprinted"] = preprinted
	letter := base
	letter.Kind = "letter"
	letter.Title = "关于核对资料的函"
	letter.CopyNumber = "12"
	letter.Classification = "秘密"
	letter.SecrecyPeriod = "1年"
	letter.Urgency = "加急"
	cases["letter-elements"] = letter
	minutes := base
	minutes.Kind = "minutes"
	minutes.Title = "资料核对工作会议纪要"
	minutes.IssueNumber = "第12期"
	minutes.Attendees = "张三、李四"
	cases["minutes-issue"] = minutes
	unsealed := base
	unsealed.Letterhead = false
	unsealed.Kind = "plain"
	unsealed.Unsealed = true
	unsealed.SigningAgencies = []string{"示例市财政局", "示例市档案局"}
	cases["unsealed-joint"] = unsealed
	detached := base
	detached.AnnexPages = true
	detached.DetachedAttachments = true
	detached.Attachments = []string{"材料清单", "核对要求"}
	cases["detached-attachments"] = detached
	for name, fields := range cases {
		t.Run(name, func(t *testing.T) {
			m, e := NewDocument(fields)
			if e != nil {
				t.Fatal(e)
			}
			for _, p := range m.Paragraphs() {
				if p.Role == "attachment-body" {
					p.Text = "一、逐项整理材料。\n二、记录核对结果。"
				}
			}
			b, e := CreateDOCX(m)
			if e != nil {
				t.Fatal(e)
			}
			r, e := RenderPDF(context.Background(), m)
			if e != nil {
				t.Fatal(e)
			}
			if r.Pages < 1 {
				t.Fatal("empty PDF")
			}
			p, e := Open(b)
			if e != nil {
				t.Fatal(e)
			}
			if !strings.Contains(p.Model.Text(), "核对") {
				t.Fatal("lost content")
			}
			if fields.DetachedAttachments && !strings.Contains(p.Model.Text(), fields.Reference+"附件1") {
				t.Fatal("detached reference missing")
			}
			if fields.Preprinted && strings.Contains(string(p.Parts["word/document.xml"]), `w:color="FF0000"`) {
				t.Fatal("preprinted red rule remains")
			}
			if folder := os.Getenv("DOC2GOVPDF_EXTENDED_AUDIT"); folder != "" {
				dir := filepath.Join(folder, name)
				if e = os.MkdirAll(dir, 0700); e != nil {
					t.Fatal(e)
				}
				for file, data := range map[string][]byte{"document.docx": b, "go.pdf": r.Data} {
					if e = os.WriteFile(filepath.Join(dir, file), data, 0600); e != nil {
						t.Fatal(e)
					}
				}
				model, _ := json.MarshalIndent(m, "", "  ")
				os.WriteFile(filepath.Join(dir, "model.json"), model, 0600)
			}
		})
	}
}
