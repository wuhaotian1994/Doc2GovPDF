package office

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Generates review artifacts only when explicitly requested. These files are
// rendered independently and visually inspected; successful generation is not QA.
func TestVisualAuditCases(t *testing.T) {
	root := os.Getenv("DOC2GOVPDF_VISUAL_AUDIT")
	if root == "" {
		t.Skip("visual audit opt-in")
	}
	refs := map[string]string{"notice": "公文通知", "report": "公文请示", "request": "公文请示", "letter": "公文信函", "minutes": "公文纪要", "rules": "公文管理办法", "plain": "企业内部报告"}
	manifest := []map[string]interface{}{}
	write := func(name string, m Model, reference string) {
		dir := filepath.Join(root, name)
		if e := os.MkdirAll(dir, 0700); e != nil {
			t.Fatal(e)
		}
		b, e := CreateDOCX(m)
		if e != nil {
			t.Fatal(e)
		}
		if e = os.WriteFile(filepath.Join(dir, "document.docx"), b, 0600); e != nil {
			t.Fatal(e)
		}
		r, e := RenderPDF(context.Background(), m)
		if e != nil {
			t.Fatal(e)
		}
		os.WriteFile(filepath.Join(dir, "go.pdf"), r.Data, 0600)
		model, _ := json.MarshalIndent(m, "", "  ")
		os.WriteFile(filepath.Join(dir, "model.json"), model, 0600)
		manifest = append(manifest, map[string]interface{}{"case": name, "reference": reference, "pages": r.Pages, "warnings": r.Warnings})
	}
	for _, kind := range Templates() {
		f := Fields{Kind: kind.ID, Agency: "示例市人民政府办公室", Title: "示例市人民政府办公室关于开展公文材料整理工作的" + kind.Name, Reference: "示政办发〔2026〕12号", Recipient: "各部门、各有关单位", Date: "2026年10月15日", CopyTo: "有关部门", Letterhead: kind.ID != "plain", Body: "一、工作目标\n做好资料整理，确保内容完整、数字准确。\n二、具体安排\n请各部门按时完成整理，并妥善保存原始材料。"}
		if kind.ID == "request" || kind.ID == "report" {
			f.Signer = "张三"
		}
		if kind.ID == "minutes" {
			f.Recipient = ""
			f.Attendees = "张三、李四、王五、赵六、陈七、周八、吴九、郑十、钱十一、孙十二"
			f.Absentees = "刘某"
			f.Observers = "市财政局、市档案馆有关负责同志"
		}
		if kind.ID == "rules" {
			f.Body = "第一章 总则\n第一条 为规范公文材料整理工作，制定本办法。\n第二条 本办法适用于资料归集、核对和移交工作。\n第二章 工作程序\n第三条 各部门应当指定专人负责整理。\n第四条 本办法自印发之日起施行。"
		}
		m, e := NewDocument(f)
		if e != nil {
			t.Fatal(e)
		}
		write(kind.ID+"-short", m, refs[kind.ID])
		f.Attachments = []string{"材料整理清单", "有关工作要求"}
		f.AnnexPages = true
		f.Body += "\n三、材料核对\n" + strings.Repeat("有关部门应当逐项核对纸质材料和电子台账，保留核对记录；发现差异时，应当根据原始材料查明原因，不得擅自改动事实和数字。\n", 8)
		if kind.ID == "rules" {
			f.Body = "第一章 总则\n第一条 为规范材料整理工作，制定本办法。\n第二章 工作程序\n"
			for i := 2; i < 10; i++ {
				f.Body += fmt.Sprintf("第%d条 各部门应当逐项核对纸质材料和电子台账，保留核对记录，并根据原始材料核实差异，不得擅自改动事实和数字。\n", i)
			}
		}
		m, e = NewDocument(f)
		if e != nil {
			t.Fatal(e)
		}
		for _, p := range m.Paragraphs() {
			if p.Role == "attachment-body" {
				p.Text = "一、整理纸质材料。\n二、核对电子台账。\n三、保留移交记录。"
			}
		}
		rows := []Row{}
		for i := 0; i < 25; i++ {
			values := []string{fmt.Sprint(i), "材料归集与核对", fmt.Sprint(i + 1)}
			if i == 0 {
				values = []string{"序号", "工作项目", "数量"}
			}
			cells := []Cell{}
			for j, v := range values {
				cells = append(cells, Cell{Span: 1, Paragraphs: []Paragraph{{ID: fmt.Sprintf("audit-%s-%d-%d", kind.ID, i, j), Text: v, Role: "body", Font: "仿宋", Size: 14, Line: 7, Align: "left"}}})
			}
			rows = append(rows, Row{Header: i == 0, Cells: cells})
		}
		at := len(m.Blocks)
		for i, b := range m.Blocks {
			if b.Paragraph != nil && b.Paragraph.Role == "signature" {
				at = i
				break
			}
		}
		blocks := append([]Block{}, m.Blocks[:at]...)
		blocks = append(blocks, Block{Table: &Table{Widths: []float64{22, 104, 30}, Borders: true, BorderStyle: "three-line", Rows: rows}})
		m.Blocks = append(blocks, m.Blocks[at:]...)
		write(kind.ID+"-long", m, refs[kind.ID])
	}
	b, _ := json.MarshalIndent(manifest, "", "  ")
	os.WriteFile(filepath.Join(root, "manifest.json"), b, 0600)
}
