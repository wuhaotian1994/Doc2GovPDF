package document

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"strings"
)

const wordNS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
const MaxDOCXBytes = 50 * 1024 * 1024
const maxXMLBytes = 8 * 1024 * 1024

// ReadDOCX extracts a bounded plain-paragraph document. This is an explicit
// text import, not a lossless DOCX round trip. Unsupported content is rejected.
func ReadDOCX(data []byte) (string, error) {
	if len(data) > MaxDOCXBytes {
		return "", fmt.Errorf("文件超过 50 MB，请拆分后导入")
	}
	z, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return "", fmt.Errorf("无法读取 Word 文件，请确认文件未加密且格式为 DOCX")
	}
	if len(z.File) > 2000 {
		return "", fmt.Errorf("文件内部对象过多，暂不支持")
	}
	var main *zip.File
	for _, f := range z.File {
		if f.Name == "word/document.xml" {
			if main != nil {
				return "", fmt.Errorf("文档结构异常：重复正文")
			}
			main = f
		}
		name := strings.ToLower(f.Name)
		if strings.HasPrefix(name, "word/media/") || strings.HasPrefix(name, "word/embeddings/") ||
			strings.HasPrefix(name, "word/comments") || strings.HasSuffix(name, "vbaproject.bin") ||
			name == "word/footnotes.xml" || name == "word/endnotes.xml" {
			return "", fmt.Errorf("当前版本只导入纯正文，文件含图片、批注、脚注或嵌入对象；请复制需要整理的正文")
		}
	}
	if main == nil || main.UncompressedSize64 > maxXMLBytes {
		return "", fmt.Errorf("文档正文缺失或过大")
	}
	f, err := main.Open()
	if err != nil {
		return "", fmt.Errorf("无法读取文档正文")
	}
	defer f.Close()
	content, err := io.ReadAll(io.LimitReader(f, maxXMLBytes+1))
	if err != nil || len(content) > maxXMLBytes {
		return "", fmt.Errorf("文档正文损坏或过大")
	}
	d := xml.NewDecoder(bytes.NewReader(content))
	var lines []string
	var p strings.Builder
	inParagraph, inText, hasBody, inBody := false, false, false, false
	for {
		token, err := d.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", fmt.Errorf("文档 XML 损坏")
		}
		switch t := token.(type) {
		case xml.StartElement:
			if t.Name.Space != wordNS {
				if inBody || t.Name.Local == "AlternateContent" {
					return "", fmt.Errorf("文档含扩展对象，请复制正文后使用")
				}
				continue
			}
			switch t.Name.Local {
			case "body":
				hasBody = true
				inBody = true
			case "tbl", "drawing", "pict", "object", "ins", "del", "moveFrom", "moveTo", "fldChar", "fldSimple", "hyperlink", "sdt", "numPr", "altChunk", "headerReference", "footerReference", "footnoteReference", "endnoteReference", "commentReference", "sectPrChange", "pPrChange", "rPrChange":
				return "", fmt.Errorf("文档含表格、页眉页脚、自动编号、域或修订等结构；当前版本请复制正文后使用")
			case "p":
				if !inBody || inParagraph {
					return "", fmt.Errorf("文档段落结构异常")
				}
				inParagraph = true
				p.Reset()
			case "t":
				inText = inParagraph
			case "tab":
				if inParagraph {
					p.WriteByte('\t')
				}
			case "br", "cr":
				if inParagraph {
					p.WriteByte('\n')
				}
			case "sym":
				return "", fmt.Errorf("文档含符号字体字符，请复制正文后使用")
			}
		case xml.CharData:
			if inText {
				p.Write([]byte(t))
				if p.Len() > MaxTextBytes {
					return "", fmt.Errorf("正文过长")
				}
			}
		case xml.EndElement:
			if t.Name.Space != wordNS {
				continue
			}
			switch t.Name.Local {
			case "t":
				inText = false
			case "p":
				if inParagraph {
					lines = append(lines, p.String())
					inParagraph = false
				}
			case "body":
				inBody = false
			}
		}
	}
	if !hasBody {
		return "", fmt.Errorf("未找到可读取的正文")
	}
	text := strings.Join(lines, "\n")
	if err := Validate(text); err != nil {
		return "", err
	}
	return text, nil
}

func escaped(s string) string {
	var b bytes.Buffer
	_ = xml.EscapeText(&b, []byte(s))
	return b.String()
}

// DOCX creates a new basic, non-letterhead layout draft from supplied text.
// It does not preserve imported formatting or certify rendered pagination.
func DOCX(text string) ([]byte, error) {
	if err := Validate(text); err != nil {
		return nil, err
	}
	var body strings.Builder
	first := true
	for _, line := range strings.Split(NormalizeNewlines(text), "\n") {
		style := "Body"
		if first && strings.TrimSpace(line) != "" {
			style = "Title"
			first = false
		}
		body.WriteString(`<w:p><w:pPr><w:pStyle w:val="` + style + `"/></w:pPr><w:r><w:t xml:space="preserve">` + escaped(line) + `</w:t></w:r></w:p>`)
	}
	parts := []struct{ name, data string }{
		{"[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`},
		{"_rels/.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`},
		{"word/_rels/document.xml.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`},
		{"word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="` + wordNS + `"><w:body>` + body.String() + `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="2098" w:right="1474" w:bottom="1984" w:left="1587" w:header="851" w:footer="992" w:gutter="0"/><w:docGrid w:type="lines" w:linePitch="567"/></w:sectPr></w:body></w:document>`},
		{"word/styles.xml", `<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="` + wordNS + `"><w:style w:type="paragraph" w:default="1" w:styleId="Body"><w:name w:val="正文"/><w:pPr><w:spacing w:after="0" w:line="567" w:lineRule="exact"/><w:ind w:firstLineChars="200"/><w:jc w:val="both"/></w:pPr><w:rPr><w:rFonts w:ascii="FangSong" w:hAnsi="FangSong" w:eastAsia="仿宋"/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="公文标题"/><w:pPr><w:keepNext/><w:spacing w:after="280"/><w:jc w:val="center"/></w:pPr><w:rPr><w:rFonts w:ascii="SimSun" w:hAnsi="SimSun" w:eastAsia="方正小标宋简体"/><w:sz w:val="44"/></w:rPr></w:style></w:styles>`},
	}
	var out bytes.Buffer
	w := zip.NewWriter(&out)
	for _, part := range parts {
		f, err := w.Create(part.name)
		if err != nil {
			return nil, err
		}
		if _, err = io.WriteString(f, part.data); err != nil {
			return nil, err
		}
	}
	if err := w.Close(); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}
