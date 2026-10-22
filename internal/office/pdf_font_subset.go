package office

// fpdf v0.12.0 writes a format-4 length from glyph count instead of the
// emitted byte count, and calcInt32 increments the high word on subtraction
// borrow. Repair only that recognized generated subset, never source fonts.
// OpenType references: learn.microsoft.com/en-us/typography/opentype/spec/cmap
// and learn.microsoft.com/en-us/typography/opentype/spec/otff#calculating-checksums.
import (
	"encoding/binary"
	"fmt"
	"sort"

	"golang.org/x/image/font/sfnt"
)

type pdfSubsetTable struct{ record, offset, size int }
type pdfSubsetGlyph struct{ code, glyph uint16 }

func pdfSubsetChecksum(data []byte) uint32 {
	var sum uint32
	for len(data) >= 4 {
		sum += binary.BigEndian.Uint32(data)
		data = data[4:]
	}
	var tail [4]byte
	copy(tail[:], data)
	return sum + binary.BigEndian.Uint32(tail[:])
}

func pdfSubsetTables(data []byte) (map[string]pdfSubsetTable, error) {
	if len(data) < 12 || len(data) > 32<<20 || binary.BigEndian.Uint32(data) != 0x00010000 {
		return nil, fmt.Errorf("PDF字体子集不是受支持的TrueType容器")
	}
	count := int(binary.BigEndian.Uint16(data[4:6]))
	directoryEnd := 12 + count*16
	if count == 0 || directoryEnd > len(data) {
		return nil, fmt.Errorf("PDF字体子集目录无效")
	}
	tables := make(map[string]pdfSubsetTable, count)
	intervals := make([]pdfSubsetTable, 0, count)
	for i := 0; i < count; i++ {
		at := 12 + i*16
		record := data[at : at+16]
		tag := string(record[:4])
		start, size := uint64(binary.BigEndian.Uint32(record[8:12])), uint64(binary.BigEndian.Uint32(record[12:16]))
		if _, exists := tables[tag]; exists || start < uint64(directoryEnd) || start%4 != 0 || start > uint64(len(data)) || size > uint64(len(data))-start {
			return nil, fmt.Errorf("PDF字体子集数据表越界或重复")
		}
		table := pdfSubsetTable{at, int(start), int(size)}
		tables[tag] = table
		if size > 0 {
			intervals = append(intervals, table)
		}
	}
	sort.Slice(intervals, func(i, j int) bool { return intervals[i].offset < intervals[j].offset })
	for i := 1; i < len(intervals); i++ {
		if intervals[i].offset < intervals[i-1].offset+intervals[i-1].size {
			return nil, fmt.Errorf("PDF字体子集数据表重叠")
		}
	}
	for tag, table := range tables {
		raw := data[table.offset : table.offset+table.size]
		sum := pdfSubsetChecksum(raw)
		if tag == "head" {
			if len(raw) < 54 {
				return nil, fmt.Errorf("PDF字体子集head表无效")
			}
			sum -= binary.BigEndian.Uint32(raw[8:12])
		}
		if sum != binary.BigEndian.Uint32(data[table.record+4:table.record+8]) {
			return nil, fmt.Errorf("PDF字体子集数据表校验失败")
		}
	}
	return tables, nil
}

// Validate the exact generator layout, including the unused glyph array. Its
// values prove the existing delta mappings; no character/glyph mapping is guessed.
func pdfSubsetCmap(data []byte, glyphs int) (int, []pdfSubsetGlyph, error) {
	fail := func() (int, []pdfSubsetGlyph, error) {
		return 0, nil, fmt.Errorf("PDF字体子集cmap不是可安全修正的固定输出")
	}
	if len(data) < 12 || binary.BigEndian.Uint16(data) != 0 || binary.BigEndian.Uint16(data[2:]) != 1 || binary.BigEndian.Uint16(data[4:]) != 3 || binary.BigEndian.Uint16(data[6:]) != 1 || binary.BigEndian.Uint32(data[8:]) != 12 {
		return fail()
	}
	sub := data[12:]
	if len(sub) < 16 || len(sub)%2 != 0 || binary.BigEndian.Uint16(sub) != 4 || binary.BigEndian.Uint16(sub[4:]) != 0 {
		return fail()
	}
	n2 := int(binary.BigEndian.Uint16(sub[6:]))
	n := n2 / 2
	if n == 0 || n2%2 != 0 || 16+8*n > len(sub) {
		return fail()
	}
	power, selector := 1, 0
	for power*2 <= n {
		power *= 2
		selector++
	}
	if int(binary.BigEndian.Uint16(sub[8:])) != 2*power || int(binary.BigEndian.Uint16(sub[10:])) != selector || int(binary.BigEndian.Uint16(sub[12:])) != 2*n-2*power || binary.BigEndian.Uint16(sub[14+2*n:]) != 0 {
		return fail()
	}
	mapped := make([]pdfSubsetGlyph, 0)
	previous := -1
	for i := 0; i < n; i++ {
		end := int(binary.BigEndian.Uint16(sub[14+2*i:]))
		start := int(binary.BigEndian.Uint16(sub[16+2*n+2*i:]))
		delta := binary.BigEndian.Uint16(sub[16+4*n+2*i:])
		offset := binary.BigEndian.Uint16(sub[16+6*n+2*i:])
		if start > end || start <= previous || offset != 0 {
			return fail()
		}
		if i == n-1 {
			if start != 65535 || end != 65535 || delta != 1 {
				return fail()
			}
		} else {
			if end == 65535 {
				return fail()
			}
			for code := start; code <= end; code++ {
				gid := uint16(code) + delta
				if int(gid) >= glyphs {
					return fail()
				}
				mapped = append(mapped, pdfSubsetGlyph{uint16(code), gid})
			}
		}
		previous = end
	}
	array := sub[16+8*n:]
	if len(array) != 2*(len(mapped)+1) || binary.BigEndian.Uint16(array[len(array)-2:]) != 0 {
		return fail()
	}
	for i, pair := range mapped {
		if binary.BigEndian.Uint16(array[2*i:]) != pair.glyph {
			return fail()
		}
	}
	declared := int(binary.BigEndian.Uint16(sub[2:]))
	legacy := (16 + 8*n + glyphs + 1) & 65535
	// Zero range offsets do not read the trailing glyph array. A shorter
	// even subtable that contains all arrays is already legal; preserve it.
	if declared >= 16+8*n && declared <= len(sub) && declared%2 == 0 {
		return declared, mapped, nil
	}
	if declared != legacy || len(sub) > 65535 {
		return fail()
	}
	return len(sub), mapped, nil
}

// The old split-word subtraction is accepted only as a recognized input case.
// Every repaired output uses ordinary uint32 subtraction and a complete checksum.
func pdfSubsetLegacyAdjustment(sum uint32) uint32 {
	adjustment := uint32(0xb1b0afba) - sum
	if uint16(sum) > 0xafba {
		adjustment += 0x20000
	}
	return adjustment
}

func repairFPDFSubsetFont(source []byte) ([]byte, bool, error) {
	tables, err := pdfSubsetTables(source)
	if err != nil {
		return nil, false, err
	}
	head, hasHead := tables["head"]
	cmap, hasCmap := tables["cmap"]
	maxp, hasMaxp := tables["maxp"]
	if !hasHead || !hasCmap || !hasMaxp || maxp.size < 6 {
		return nil, false, fmt.Errorf("PDF字体子集缺少必要表")
	}
	glyphs := int(binary.BigEndian.Uint16(source[maxp.offset+4:]))
	if glyphs == 0 {
		return nil, false, fmt.Errorf("PDF字体子集没有字形")
	}
	actual, mappings, err := pdfSubsetCmap(source[cmap.offset:cmap.offset+cmap.size], glyphs)
	if err != nil {
		return nil, false, err
	}
	oldAdjustment := binary.BigEndian.Uint32(source[head.offset+8:])
	zeroSum := pdfSubsetChecksum(source) - oldAdjustment
	proper := uint32(0xb1b0afba) - zeroSum
	if oldAdjustment != proper && oldAdjustment != pdfSubsetLegacyAdjustment(zeroSum) {
		return nil, false, fmt.Errorf("PDF字体子集总校验不是已识别的生成结果")
	}
	if int(binary.BigEndian.Uint16(source[cmap.offset+14:])) == actual && oldAdjustment == proper {
		return source, false, nil
	}
	repaired := append([]byte(nil), source...)
	binary.BigEndian.PutUint16(repaired[cmap.offset+14:], uint16(actual))
	binary.BigEndian.PutUint32(repaired[cmap.record+4:], pdfSubsetChecksum(repaired[cmap.offset:cmap.offset+cmap.size]))
	binary.BigEndian.PutUint32(repaired[head.offset+8:], 0)
	binary.BigEndian.PutUint32(repaired[head.offset+8:], uint32(0xb1b0afba)-pdfSubsetChecksum(repaired))
	if _, err = pdfSubsetTables(repaired); err != nil || pdfSubsetChecksum(repaired) != 0xb1b0afba {
		return nil, false, fmt.Errorf("PDF字体子集修正后校验失败")
	}
	parsed, err := sfnt.Parse(repaired)
	if err != nil {
		return nil, false, fmt.Errorf("PDF字体子集修正后无法解析：%w", err)
	}
	for _, pair := range mappings {
		got, e := parsed.GlyphIndex(nil, rune(pair.code))
		if e != nil || uint16(got) != pair.glyph {
			return nil, false, fmt.Errorf("PDF字体子集修正改变了字符字形映射")
		}
	}
	return repaired, true, nil
}
