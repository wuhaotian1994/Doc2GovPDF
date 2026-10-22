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
	data = append([]byte(nil), data...)
	face, e := sfnt.Parse(data)
	if e != nil {
		return fmt.Errorf("请选择有效的 TTF 字体文件")
	}
	fontCatalog()
	fonts[role] = fontData{role, data}
	fontMaps[role] = face
	return nil
}

// AliasRegisteredFont reuses an already validated immutable face for another
// document role. Replacing either role later never mutates the other role.
func AliasRegisteredFont(role, source string) error {
	valid := func(value string) bool {
		switch value {
		case "仿宋", "楷体", "黑体", "宋体", "方正小标宋简体":
			return true
		}
		return false
	}
	if !valid(role) || !valid(source) {
		return fmt.Errorf("不支持的字体用途")
	}
	fontCatalog()
	face, ok := fonts[source]
	if !ok || len(face.data) == 0 || fontMaps[source] == nil {
		return fmt.Errorf("所选来源字体尚未读取")
	}
	fonts[role] = fontData{role, face.data}
	fontMaps[role] = fontMaps[source]
	return nil
}
