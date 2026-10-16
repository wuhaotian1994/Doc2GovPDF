package office

import (
	"archive/zip"
	"bytes"
	"doc2govpdf/internal/document"
	"fmt"
	"github.com/beevik/etree"
	"io"
	"path"
	"strconv"
	"strings"
	"time"
)

type ReviewComment struct {
	ParagraphID string `json:"paragraphId"`
	Text        string `json:"text"`
}

// AddReviewComments appends standards-compliant comment parts without changing
// text, old comments, hyperlinks, fields, or another author's revision markup.
func AddReviewComments(data []byte, m Model, notes []ReviewComment) ([]byte, error) {
	if len(notes) == 0 {
		return data, nil
	}
	if len(notes) > 100 {
		return nil, fmt.Errorf("一次最多保存 100 条核对批注")
	}
	z, e := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if e != nil {
		return nil, e
	}
	parts := map[string][]byte{}
	for _, f := range z.File {
		r, e := f.Open()
		if e != nil {
			return nil, e
		}
		b, e := io.ReadAll(r)
		r.Close()
		if e != nil {
			return nil, e
		}
		parts[f.Name] = b
	}
	doc, e := parseXML(parts["word/document.xml"])
	if e != nil {
		return nil, e
	}
	rels, e := parseXML(parts["word/_rels/document.xml.rels"])
	if e != nil {
		return nil, e
	}
	types, e := parseXML(parts["[Content_Types].xml"])
	if e != nil {
		return nil, e
	}
	filename := "word/comments.xml"
	related := false
	for _, r := range rels.Root().ChildElements() {
		if strings.HasSuffix(attr(r, "Type"), "/comments") {
			if attr(r, "TargetMode") == "External" {
				return nil, fmt.Errorf("外部批注部件不支持修改")
			}
			filename = path.Clean(path.Join("word", attr(r, "Target")))
			if !strings.HasPrefix(filename, "word/") {
				return nil, fmt.Errorf("批注部件路径无效")
			}
			related = true
			break
		}
	}
	comments := etree.NewDocument()
	if len(parts[filename]) > 0 {
		comments, e = parseXML(parts[filename])
		if e != nil {
			return nil, e
		}
	} else {
		comments.CreateElement("w:comments").CreateAttr("xmlns:w", W)
	}
	next := 0
	old := map[string]string{}
	for _, c := range comments.Root().ChildElements() {
		id := attr(c, "id")
		n, _ := strconv.Atoi(id)
		if n >= next {
			next = n + 1
		}
		if attr(c, "author") == "Doc2GovPDF" {
			var text strings.Builder
			for _, x := range descendants(c, "t") {
				text.WriteString(x.Text())
			}
			old[id] = text.String()
		}
	}
	body := child(doc.Root(), "body")
	paras := bodyParagraphElements(body)
	modelParas := m.Paragraphs()
	if len(paras) != len(modelParas) {
		return nil, fmt.Errorf("此文档段落结构不适合安全插入批注，原件仍保留")
	}
	targets := map[string]*etree.Element{}
	for i, p := range modelParas {
		targets[p.ID] = paras[i]
	}
	added := 0
	for _, note := range notes {
		if len([]rune(note.Text)) > 4000 {
			return nil, fmt.Errorf("批注内容过长")
		}
		if strings.TrimSpace(note.Text) == "" {
			continue
		}
		if e := document.Validate(note.Text); e != nil {
			return nil, e
		}
		para := targets[note.ParagraphID]
		if para == nil {
			return nil, fmt.Errorf("批注原文位置已变化，请重新检查")
		}
		duplicate := false
		for _, ref := range descendants(para, "commentReference") {
			if old[attr(ref, "id")] == note.Text {
				duplicate = true
			}
		}
		if duplicate {
			continue
		}
		id := strconv.Itoa(next)
		next++
		added++
		c := comments.Root().CreateElement("w:comment")
		c.CreateAttr("w:id", id)
		c.CreateAttr("w:author", "Doc2GovPDF")
		c.CreateAttr("w:initials", "公文整理")
		c.CreateAttr("w:date", time.Now().UTC().Format(time.RFC3339))
		addRun(c.CreateElement("w:p"), note.Text, nil)
		start := etree.NewElement("w:commentRangeStart")
		start.CreateAttr("w:id", id)
		at := 0
		if pr := child(para, "pPr"); pr != nil {
			at = pr.Index() + 1
		}
		para.InsertChildAt(at, start)
		para.CreateElement("w:commentRangeEnd").CreateAttr("w:id", id)
		r := para.CreateElement("w:r")
		r.CreateElement("w:rPr").CreateElement("w:rStyle").CreateAttr("w:val", "CommentReference")
		r.CreateElement("w:commentReference").CreateAttr("w:id", id)
	}
	if added == 0 {
		return data, nil
	}
	if !related {
		ids := map[string]bool{}
		for _, r := range rels.Root().ChildElements() {
			ids[attr(r, "Id")] = true
		}
		id := "reviewComments"
		for ids[id] {
			id += "x"
		}
		r := rels.Root().CreateElement("Relationship")
		r.CreateAttr("Id", id)
		r.CreateAttr("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments")
		r.CreateAttr("Target", strings.TrimPrefix(filename, "word/"))
	}
	found := false
	for _, c := range types.Root().ChildElements() {
		if attr(c, "PartName") == "/"+filename {
			found = true
		}
	}
	if !found {
		c := types.Root().CreateElement("Override")
		c.CreateAttr("PartName", "/"+filename)
		c.CreateAttr("ContentType", "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml")
	}
	for name, xml := range map[string]*etree.Document{"word/document.xml": doc, "word/_rels/document.xml.rels": rels, "[Content_Types].xml": types, filename: comments} {
		b, e := xml.WriteToBytes()
		if e != nil {
			return nil, e
		}
		parts[name] = b
	}
	var out bytes.Buffer
	writer := zip.NewWriter(&out)
	seen := map[string]bool{}
	for _, f := range z.File {
		w, e := writer.Create(f.Name)
		if e != nil {
			return nil, e
		}
		if _, e = w.Write(parts[f.Name]); e != nil {
			return nil, e
		}
		seen[f.Name] = true
	}
	if !seen[filename] {
		w, e := writer.Create(filename)
		if e != nil {
			return nil, e
		}
		if _, e = w.Write(parts[filename]); e != nil {
			return nil, e
		}
	}
	if e = writer.Close(); e != nil {
		return nil, e
	}
	return out.Bytes(), nil
}
