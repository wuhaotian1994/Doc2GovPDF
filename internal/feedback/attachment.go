package feedback

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"strings"
)

// Only flattened PNG and the deliberately small example schema are accepted.
// Re-encoding drops PNG ancillary metadata and JSON unknown/hidden fields are rejected.
// Neither operation can certify that visible text or pixels contain no sensitive data.
func sanitizeAttachment(name string, b []byte) (Attachment, error) {
	a := Attachment{}
	if len(b) == 0 || len(b) > MaxFileBytes {
		return a, errors.New("附件为空或超过4MB")
	}
	switch {
	case bytes.HasPrefix(b, []byte("\x89PNG\r\n\x1a\n")):
		if !strings.HasSuffix(strings.ToLower(name), ".png") {
			return a, errors.New("PNG副本需要.png扩展名")
		}
		cfg, e := png.DecodeConfig(bytes.NewReader(b))
		if e != nil || cfg.Width <= 0 || cfg.Height <= 0 || cfg.Width > 4096 || cfg.Height > 4096 || int64(cfg.Width)*int64(cfg.Height) > 8000000 {
			return a, errors.New("PNG无效或超过800万像素/4096边长")
		}
		im, e := png.Decode(bytes.NewReader(b))
		if e != nil {
			return a, errors.New("PNG无法完整解码")
		}
		// A transparent pixel can retain hidden original RGB. Composite all pixels onto opaque white.
		flattened := image.NewRGBA(im.Bounds())
		draw.Draw(flattened, flattened.Bounds(), image.NewUniform(color.White), image.Point{}, draw.Src)
		draw.Draw(flattened, flattened.Bounds(), im, im.Bounds().Min, draw.Over)
		var out bytes.Buffer
		if e = png.Encode(&out, flattened); e != nil {
			return a, e
		}
		a.data = out.Bytes()
		a.Name = "截图副本.png"
		a.MediaType = "image/png"
	case strings.HasSuffix(strings.ToLower(name), ".json"):
		if len(b) > 1<<20 {
			return a, errors.New("结构示例最多1MB")
		}
		var example struct {
			Version int    `json:"version"`
			Kind    string `json:"kind"`
			Title   string `json:"title,omitempty"`
			Blocks  []struct {
				Type   string     `json:"type"`
				Text   string     `json:"text,omitempty"`
				Rows   [][]string `json:"rows,omitempty"`
				Role   *string    `json:"role,omitempty"`
				Align  *string    `json:"align,omitempty"`
				Indent *string    `json:"indent,omitempty"`
				Before *string    `json:"before,omitempty"`
				After  *string    `json:"after,omitempty"`
				Header *bool      `json:"header,omitempty"`
			} `json:"blocks"`
		}
		if e := readJSON(b, &example); e != nil || example.Version != 1 || example.Kind != "doc2govpdf-feedback-example" || len(example.Blocks) == 0 || len(example.Blocks) > 100 || len([]rune(example.Title)) > 300 {
			return a, errors.New("仅接收本地生成的结构示例，不接收原稿/恢复包或任意JSON")
		}
		// Explicit null/empty/unknown semantic values must not silently disappear.
		var raw struct {
			Blocks []map[string]json.RawMessage `json:"blocks"`
		}
		if e := json.Unmarshal(b, &raw); e != nil {
			return a, errors.New("示例JSON无效")
		}
		for _, block := range raw.Blocks {
			for _, key := range []string{"role", "align", "indent", "before", "after", "header"} {
				if v, ok := block[key]; ok && bytes.Equal(bytes.TrimSpace(v), []byte("null")) {
					return a, errors.New("示例语义不能为null")
				}
			}
		}
		total := len([]rune(example.Title))
		for _, block := range example.Blocks {
			switch block.Type {
			case "paragraph":
				if len(block.Rows) != 0 || len([]rune(block.Text)) > 10000 || block.Header != nil {
					return a, errors.New("段落示例无效")
				}
				if !validSemantic(block.Role, []string{"auto", "body", "title", "heading", "heading2", "heading3", "heading4", "article", "signature", "date"}) || !validSemantic(block.Align, []string{"auto", "left", "center", "right", "both"}) || !validSemantic(block.Indent, []string{"auto", "none", "two"}) || !validSemantic(block.Before, []string{"auto", "none", "half", "one"}) || !validSemantic(block.After, []string{"auto", "none", "half", "one"}) {
					return a, errors.New("示例段落语义值无效")
				}
				total += len([]rune(block.Text))
			case "table":
				if block.Text != "" || len(block.Rows) == 0 || len(block.Rows) > 100 || block.Role != nil || block.Align != nil || block.Indent != nil || block.Before != nil || block.After != nil {
					return a, errors.New("表格示例无效")
				}
				cols := len(block.Rows[0])
				if cols == 0 || cols > 20 {
					return a, errors.New("示例表格最多20列")
				}
				for _, row := range block.Rows {
					if len(row) != cols {
						return a, errors.New("示例表格必须是规则网格")
					}
					for _, v := range row {
						if len([]rune(v)) > 1000 {
							return a, errors.New("示例单元格过长")
						}
						total += len([]rune(v))
					}
				}
			default:
				return a, errors.New("未知示例内容类型")
			}
		}
		if total > 30000 {
			return a, errors.New("结构示例内容过长")
		}
		a.data, _ = json.Marshal(example)
		a.Name = "结构示例.json"
		a.MediaType = "application/json"
	default:
		return a, errors.New("仅支持可检查的PNG像素副本或结构示例JSON，不接收原DOCX/ZIP/PDF")
	}
	if len(a.data) > MaxFileBytes {
		return a, errors.New("处理后的附件超过4MB")
	}
	a.Size = int64(len(a.data))
	h := sha256.Sum256(a.data)
	a.SHA256 = hex.EncodeToString(h[:])
	return a, nil
}

func validSemantic(value *string, allowed []string) bool {
	if value == nil {
		return true
	}
	for _, item := range allowed {
		if *value == item {
			return true
		}
	}
	return false
}
