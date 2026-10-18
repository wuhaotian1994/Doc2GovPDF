package office

import (
	"bytes"
	"fmt"
	"golang.org/x/image/font/sfnt"
)

// RegisterFont loads a user-selected face; it never reads or uploads system files.
// The browser worker serializes calls, as does the native renderer.
func RegisterFont(role string, data []byte) error {
	switch role {
	case "仿宋", "楷体", "黑体", "宋体", "方正小标宋简体":
	default:
		return fmt.Errorf("不支持的字体用途")
	}
	if len(data) > 32<<20 {
		return fmt.Errorf("字体文件超过 32 MB")
	}
	var e error
	if bytes.HasPrefix(data, []byte("ttcf")) {
		data, e = extractTTC(data, 0)
		if e != nil {
			return e
		}
	}
	if !embeddingAllowed(data) {
		return fmt.Errorf("字体不允许嵌入，不能用于 PDF 输出")
	}
	face, e := sfnt.Parse(data)
	if e != nil {
		return fmt.Errorf("请选择有效的 TTF 字体文件")
	}
	fontCatalog()
	fonts[role] = fontData{role, append([]byte{}, data...)}
	fontMaps[role] = face
	return nil
}
