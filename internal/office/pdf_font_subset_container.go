package office

import (
	"bytes"
	"compress/zlib"
	"fmt"
	"io"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

type pdfSubsetObject struct {
	id, offset int
	data       []byte
}
type pdfSubsetContainer struct {
	header, trailer []byte
	objects         []pdfSubsetObject
	count           int
}

var pdfSubsetFontReference = regexp.MustCompile(`/FontFile2 ([0-9]+) 0 R(?:\s|>|$)`)
var pdfSubsetStreamHeader = regexp.MustCompile(`(?s)^([0-9]+) 0 obj\n<</Length ([0-9]+)\s*/Filter /FlateDecode\s*/Length1 ([0-9]+)\s*>>\nstream\n`)
var pdfSubsetTrailerSize = regexp.MustCompile(`/Size ([0-9]+)(?:\s|>|$)`)

func pdfSubsetNumber(value []byte) (int, error) {
	if len(value) == 0 || len(value) > 10 {
		return 0, fmt.Errorf("PDF字体容器整数无效")
	}
	for _, c := range value {
		if c < '0' || c > '9' {
			return 0, fmt.Errorf("PDF字体容器整数无效")
		}
	}
	number, err := strconv.ParseUint(string(value), 10, 64)
	if err != nil || number > uint64(^uint(0)>>1) {
		return 0, fmt.Errorf("PDF字体容器整数越界")
	}
	return int(number), nil
}
func pdfSubsetLine(data []byte, position *int) ([]byte, error) {
	if *position < 0 || *position >= len(data) {
		return nil, fmt.Errorf("PDF字体容器行越界")
	}
	end := bytes.IndexByte(data[*position:], '\n')
	if end < 0 {
		return nil, fmt.Errorf("PDF字体容器行未结束")
	}
	line := data[*position : *position+end]
	*position += end + 1
	return line, nil
}

// This is a parser for our freshly generated fpdf classic-xref output only,
// not an imported-PDF repair API. Binary streams are bounded by real xref offsets.
func parseFPDFSubsetContainer(data []byte) (pdfSubsetContainer, error) {
	fail := func() (pdfSubsetContainer, error) {
		return pdfSubsetContainer{}, fmt.Errorf("PDF字体容器不是受支持的生成输出")
	}
	marker := bytes.LastIndex(data, []byte("\nstartxref\n"))
	if marker < 0 || !bytes.HasPrefix(data, []byte("%PDF-")) {
		return fail()
	}
	numberStart := marker + len("\nstartxref\n")
	position := numberStart
	line, err := pdfSubsetLine(data, &position)
	if err != nil {
		return fail()
	}
	xref, err := pdfSubsetNumber(line)
	if err != nil || xref >= marker || !bytes.Equal(bytes.TrimSpace(data[position:]), []byte("%%EOF")) {
		return fail()
	}
	position = xref
	line, err = pdfSubsetLine(data, &position)
	if err != nil || string(line) != "xref" {
		return fail()
	}
	line, err = pdfSubsetLine(data, &position)
	if err != nil {
		return fail()
	}
	fields := strings.Fields(string(line))
	if len(fields) != 2 || fields[0] != "0" {
		return fail()
	}
	count, err := pdfSubsetNumber([]byte(fields[1]))
	if err != nil || count < 2 || count > len(data)/20+1 {
		return fail()
	}
	objects := make([]pdfSubsetObject, 0, count-1)
	seen := map[int]bool{}
	for id := 0; id < count; id++ {
		line, err = pdfSubsetLine(data, &position)
		if err != nil {
			return fail()
		}
		fields = strings.Fields(string(line))
		if len(fields) != 3 || len(fields[0]) != 10 || len(fields[1]) != 5 {
			return fail()
		}
		offset, e := pdfSubsetNumber([]byte(fields[0]))
		if e != nil {
			return fail()
		}
		if id == 0 {
			if offset != 0 || fields[1] != "65535" || fields[2] != "f" {
				return fail()
			}
			continue
		}
		if fields[1] != "00000" || fields[2] != "n" || offset < 8 || offset >= xref || seen[offset] {
			return fail()
		}
		seen[offset] = true
		objects = append(objects, pdfSubsetObject{id: id, offset: offset})
	}
	trailerStart := position
	if !bytes.HasPrefix(data[position:], []byte("trailer\n<<")) {
		return fail()
	}
	trailer := data[trailerStart:marker]
	sizeMatch := pdfSubsetTrailerSize.FindSubmatch(trailer)
	if len(sizeMatch) != 2 {
		return fail()
	}
	size, e := pdfSubsetNumber(sizeMatch[1])
	if e != nil || size != count || bytes.Contains(trailer, []byte("/Encrypt")) || bytes.Contains(trailer, []byte("/Prev")) || bytes.Contains(trailer, []byte("/XRefStm")) {
		return fail()
	}
	sort.Slice(objects, func(i, j int) bool { return objects[i].offset < objects[j].offset })
	for i := range objects {
		end := xref
		if i+1 < len(objects) {
			end = objects[i+1].offset
		}
		objects[i].data = data[objects[i].offset:end]
		if !bytes.HasPrefix(objects[i].data, []byte(fmt.Sprintf("%d 0 obj\n", objects[i].id))) || !bytes.HasSuffix(bytes.TrimSpace(objects[i].data), []byte("endobj")) {
			return fail()
		}
	}
	return pdfSubsetContainer{data[:objects[0].offset], trailer, objects, count}, nil
}

func repairFPDFFontObject(object pdfSubsetObject) ([]byte, bool, error) {
	header := pdfSubsetStreamHeader.FindSubmatchIndex(object.data)
	if len(header) != 8 {
		return nil, false, fmt.Errorf("PDF字体流结构不是受支持的固定输出")
	}
	id, err := pdfSubsetNumber(object.data[header[2]:header[3]])
	if err != nil || id != object.id {
		return nil, false, fmt.Errorf("PDF字体流标识不一致")
	}
	size, err := pdfSubsetNumber(object.data[header[4]:header[5]])
	if err != nil {
		return nil, false, err
	}
	originalSize, err := pdfSubsetNumber(object.data[header[6]:header[7]])
	if err != nil || originalSize == 0 || originalSize > 32<<20 {
		return nil, false, fmt.Errorf("PDF字体流解压长度无效")
	}
	start := header[1]
	if size > len(object.data)-start || string(bytes.TrimSpace(object.data[start+size:])) != "endstream\nendobj" {
		return nil, false, fmt.Errorf("PDF字体流长度与对象边界不一致")
	}
	decoder, err := zlib.NewReader(bytes.NewReader(object.data[start : start+size]))
	if err != nil {
		return nil, false, fmt.Errorf("PDF字体流无法解压")
	}
	source, err := io.ReadAll(io.LimitReader(decoder, int64(originalSize)+1))
	closeErr := decoder.Close()
	if err != nil || closeErr != nil || len(source) != originalSize {
		return nil, false, fmt.Errorf("PDF字体流解压后长度不一致")
	}
	repaired, changed, err := repairFPDFSubsetFont(source)
	if err != nil || !changed {
		return nil, changed, err
	}
	var compressed bytes.Buffer
	encoder := zlib.NewWriter(&compressed)
	if _, err = encoder.Write(repaired); err != nil {
		return nil, false, err
	}
	if err = encoder.Close(); err != nil {
		return nil, false, err
	}
	var out bytes.Buffer
	fmt.Fprintf(&out, "%d 0 obj\n<</Length %d\n/Filter /FlateDecode\n/Length1 %d\n>>\nstream\n", object.id, compressed.Len(), len(repaired))
	out.Write(compressed.Bytes())
	out.Write(object.data[start+size:])
	return out.Bytes(), true, nil
}

func repairPDFSubsetFonts(data []byte) ([]byte, error) {
	container, err := parseFPDFSubsetContainer(data)
	if err != nil {
		return nil, err
	}
	targets := map[int]bool{}
	byID := map[int]pdfSubsetObject{}
	for _, object := range container.objects {
		byID[object.id] = object
		newline := bytes.IndexByte(object.data, '\n')
		body := object.data[newline+1:]
		if !bytes.HasPrefix(body, []byte("<</Type /FontDescriptor /FontName /utf8")) {
			continue
		}
		matches := pdfSubsetFontReference.FindAllSubmatch(body, -1)
		if len(matches) != 1 {
			return nil, fmt.Errorf("PDF字体描述缺少唯一字体流")
		}
		id, e := pdfSubsetNumber(matches[0][1])
		if e != nil || id <= 0 || id >= container.count {
			return nil, fmt.Errorf("PDF字体流引用无效")
		}
		targets[id] = true
	}
	patched := map[int][]byte{}
	for id := range targets {
		object, exists := byID[id]
		if !exists {
			return nil, fmt.Errorf("PDF字体流对象缺失")
		}
		bytes, changed, e := repairFPDFFontObject(object)
		if e != nil {
			return nil, e
		}
		if changed {
			patched[id] = bytes
		}
	}
	if len(patched) == 0 {
		return data, nil
	}
	var out bytes.Buffer
	out.Grow(len(data))
	out.Write(container.header)
	offsets := make([]int, container.count)
	for _, object := range container.objects {
		offsets[object.id] = out.Len()
		if replacement, ok := patched[object.id]; ok {
			out.Write(replacement)
		} else {
			out.Write(object.data)
		}
	}
	xref := out.Len()
	fmt.Fprintf(&out, "xref\n0 %d\n0000000000 65535 f \n", container.count)
	for id := 1; id < container.count; id++ {
		fmt.Fprintf(&out, "%010d 00000 n \n", offsets[id])
	}
	out.Write(container.trailer)
	fmt.Fprintf(&out, "\nstartxref\n%d\n%%%%EOF\n", xref)
	if _, err := parseFPDFSubsetContainer(out.Bytes()); err != nil {
		return nil, fmt.Errorf("PDF字体流更新后xref校验失败")
	}
	return out.Bytes(), nil
}
