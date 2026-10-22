package office

import (
	"crypto/sha256"
	"encoding/binary"
	"fmt"
	"sort"
	"unicode/utf16"

	"golang.org/x/image/font/sfnt"
)

// DOCX-only names avoid colliding with an installed Noto variable font. The
// release suffix is the first five SHA256 hex digits of regularSHA+"\n"+blackSHA.
// Black's legacy family remains below Word's 32-character attribute limit.
const wordFallbackFamily = "Doc2GovPDF Serif SC 3429e"
const wordFallbackBlackFamily = wordFallbackFamily + " Black"
const wordFallbackRegularSHA = "9502147ceba7b5bc7fd3415083f6a5d133f22d8f9efb4974d4b85f3a97ea2d3a"
const wordFallbackBlackSHA = "0f048849cd9c0514f9915e25673801d37196c57af8e3b804f0185a3b23b53ac1"

func derivedFallbackSource(name string) (string, bool) {
	switch name {
	case wordFallbackFamily:
		return "Noto Serif SC", true
	case wordFallbackBlackFamily:
		return "Noto Serif SC Black", true
	}
	return "", false
}

// Only pinned, project-owned OFL resources may enter this transformation.
// RegisterFont and the original immutable registered slices are never changed.
// Original copyright, trademark, licence and designer name records survive.
func prepareWordFallbackEmbedding(face fontData) (fontData, error) {
	expected, family, style, postscript := wordFallbackRegularSHA, wordFallbackFamily, "Regular", "Doc2GovPDFSerifSC3429e-Regular"
	switch face.name {
	case "Noto Serif SC":
	case "Noto Serif SC Black":
		expected, family, style, postscript = wordFallbackBlackSHA, wordFallbackBlackFamily, "Black", "Doc2GovPDFSerifSC3429e-Black"
	default:
		return fontData{}, fmt.Errorf("Word备用字体不是已许可的固定OFL资源；未修改或嵌入所选字体")
	}
	if fmt.Sprintf("%x", sha256.Sum256(face.data)) != expected {
		return fontData{}, fmt.Errorf("Word备用字体校验不匹配，请重新读取固定完整资源；未嵌入未知字体")
	}
	names := map[uint16]string{1: family, 3: "Doc2GovPDF;3429e;" + postscript, 4: family, 6: postscript, 16: wordFallbackFamily, 25: "Doc2GovPDFSerifSC3429e"}
	if style == "Regular" {
		names[4] += " Regular"
	}
	data, err := rebuildWordFallbackNames(face.data, names, style)
	if err != nil {
		return fontData{}, fmt.Errorf("Word备用字体身份准备失败：%w", err)
	}
	parsed, err := sfnt.Parse(data)
	if err != nil {
		return fontData{}, fmt.Errorf("Word备用字体身份准备后无法读取：%w", err)
	}
	got, err := parsed.Name(nil, sfnt.NameIDFamily)
	if err != nil || got != family || wordFontChecksum(data) != 0xb1b0afba {
		return fontData{}, fmt.Errorf("Word备用字体身份或校验和无效，未生成文件")
	}
	return fontData{family, data}, nil
}

type wordNameRecord struct {
	platform, encoding, language, id uint16
	data                             []byte
}

func wordNameUTF16(value string) []byte {
	chars := utf16.Encode([]rune(value))
	data := make([]byte, 2*len(chars))
	for i, c := range chars {
		binary.BigEndian.PutUint16(data[i*2:], c)
	}
	return data
}

func rebuildWordNameTable(data []byte, replacements map[uint16]string, style string) ([]byte, error) {
	if len(data) < 6 || binary.BigEndian.Uint16(data[:2]) != 0 {
		return nil, fmt.Errorf("不支持的固定字体名称表")
	}
	count, start := int(binary.BigEndian.Uint16(data[2:4])), int(binary.BigEndian.Uint16(data[4:6]))
	if 6+count*12 > len(data) || start < 6+count*12 || start > len(data) {
		return nil, fmt.Errorf("固定字体名称表越界")
	}
	records := make([]wordNameRecord, 0, count+2)
	seen := map[uint16]bool{}
	for i := 0; i < count; i++ {
		p := data[6+i*12:]
		r := wordNameRecord{platform: binary.BigEndian.Uint16(p), encoding: binary.BigEndian.Uint16(p[2:]), language: binary.BigEndian.Uint16(p[4:]), id: binary.BigEndian.Uint16(p[6:])}
		n, offset := int(binary.BigEndian.Uint16(p[8:])), int(binary.BigEndian.Uint16(p[10:]))
		if start+offset > len(data) || n > len(data)-start-offset {
			return nil, fmt.Errorf("固定字体名称字符串越界")
		}
		r.data = data[start+offset : start+offset+n]
		if value, replace := replacements[r.id]; replace {
			if r.platform != 0 && r.platform != 3 {
				return nil, fmt.Errorf("不支持的固定字体名称编码")
			}
			r.data = wordNameUTF16(value)
			seen[r.id] = true
		}
		if r.id == 17 {
			seen[17] = true
		}
		records = append(records, r)
	}
	// Regular has no typographic-family records in the original static face.
	// Explicitly pair it with Black without changing either legacy style.
	for _, id := range []uint16{16, 17} {
		if !seen[id] {
			value := replacements[id]
			if id == 17 {
				value = style
			}
			records = append(records, wordNameRecord{3, 1, 0x409, id, wordNameUTF16(value)})
		}
	}
	sort.SliceStable(records, func(i, j int) bool {
		a, b := records[i], records[j]
		if a.platform != b.platform {
			return a.platform < b.platform
		}
		if a.encoding != b.encoding {
			return a.encoding < b.encoding
		}
		if a.language != b.language {
			return a.language < b.language
		}
		return a.id < b.id
	})
	stringsAt := 6 + len(records)*12
	if stringsAt > 65535 {
		return nil, fmt.Errorf("固定字体名称表过长")
	}
	out := make([]byte, stringsAt)
	binary.BigEndian.PutUint16(out[2:], uint16(len(records)))
	binary.BigEndian.PutUint16(out[4:], uint16(stringsAt))
	for i, r := range records {
		offset := len(out) - stringsAt
		if offset > 65535 || len(r.data) > 65535 || offset+len(r.data) > 65535 {
			return nil, fmt.Errorf("固定字体名称字符串过长")
		}
		p := out[6+i*12:]
		for j, v := range []uint16{r.platform, r.encoding, r.language, r.id, uint16(len(r.data)), uint16(offset)} {
			binary.BigEndian.PutUint16(p[j*2:], v)
		}
		out = append(out, r.data...)
	}
	return out, nil
}

// Rebuild the sfnt container rather than overwriting shorter name storage.
// All non-name tables are copied byte-for-byte, except head's required checksum
// adjustment. No outline, cmap, metrics, hinting or style flags are rewritten.
func rebuildWordFallbackNames(source []byte, names map[uint16]string, style string) ([]byte, error) {
	if len(source) < 12 || binary.BigEndian.Uint32(source[:4]) != 0x00010000 {
		return nil, fmt.Errorf("固定字体不是TrueType")
	}
	count := int(binary.BigEndian.Uint16(source[4:6]))
	if count == 0 || count > (len(source)-12)/16 {
		return nil, fmt.Errorf("固定字体目录无效")
	}
	// A name table is bounded to 65535 bytes. Reserve its worst-case growth
	// once, so appending the large glyf table cannot repeatedly copy a full face.
	out := make([]byte, 12+count*16, len(source)+65536)
	copy(out, source[:len(out)])
	headOffset, nameCount := 0, 0
	for i := 0; i < count; i++ {
		r := source[12+i*16:]
		tag := string(r[:4])
		start, size := uint64(binary.BigEndian.Uint32(r[8:12])), uint64(binary.BigEndian.Uint32(r[12:16]))
		if start > uint64(len(source)) || size > uint64(len(source))-start {
			return nil, fmt.Errorf("固定字体数据表越界")
		}
		data := source[int(start):int(start+size)]
		if tag == "name" {
			nameCount++
			var err error
			data, err = rebuildWordNameTable(data, names, style)
			if err != nil {
				return nil, err
			}
		}
		at := len(out)
		out = append(out, data...)
		if tag == "head" {
			if len(data) < 12 || headOffset != 0 {
				return nil, fmt.Errorf("固定字体head表无效")
			}
			headOffset = at
			binary.BigEndian.PutUint32(out[at+8:], 0)
		}
		for len(out)%4 != 0 {
			out = append(out, 0)
		}
		p := out[12+i*16:]
		binary.BigEndian.PutUint32(p[4:], wordFontChecksum(out[at:at+len(data)]))
		binary.BigEndian.PutUint32(p[8:], uint32(at))
		binary.BigEndian.PutUint32(p[12:], uint32(len(data)))
	}
	if headOffset == 0 || nameCount != 1 {
		return nil, fmt.Errorf("固定字体缺少唯一名称或head表")
	}
	binary.BigEndian.PutUint32(out[headOffset+8:], 0xb1b0afba-wordFontChecksum(out))
	return out, nil
}

func wordFontChecksum(data []byte) uint32 {
	var sum uint32
	for len(data) >= 4 {
		sum += binary.BigEndian.Uint32(data[:4])
		data = data[4:]
	}
	var tail [4]byte
	copy(tail[:], data)
	return sum + binary.BigEndian.Uint32(tail[:])
}
