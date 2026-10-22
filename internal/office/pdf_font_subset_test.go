package office

import (
	"bytes"
	"compress/zlib"
	"encoding/binary"
	"fmt"
	"io"
	"sort"
	"strings"
	"testing"

	"codeberg.org/go-pdf/fpdf"
	"doc2govpdf/assets"
	readpdf "github.com/ledongthuc/pdf"
	"golang.org/x/image/font/sfnt"
)

func testSubsetRawFont(source []byte, text string) []byte { return fpdf.UTF8CutFont(source, text) }
func testSubsetResum(t *testing.T, data []byte) {
	t.Helper()
	count := int(binary.BigEndian.Uint16(data[4:]))
	head := -1
	for i := 0; i < count; i++ {
		at := 12 + 16*i
		start, size := int(binary.BigEndian.Uint32(data[at+8:])), int(binary.BigEndian.Uint32(data[at+12:]))
		if string(data[at:at+4]) == "head" {
			head = start
			binary.BigEndian.PutUint32(data[start+8:], 0)
		}
		binary.BigEndian.PutUint32(data[at+4:], pdfSubsetChecksum(data[start:start+size]))
	}
	if head < 0 {
		t.Fatal("no head")
	}
	binary.BigEndian.PutUint32(data[head+8:], uint32(0xb1b0afba)-pdfSubsetChecksum(data))
}
func testSubsetFontTablesEqual(t *testing.T, one, two []byte) {
	t.Helper()
	old, err := pdfSubsetTables(one)
	if err != nil {
		t.Fatal(err)
	}
	next, err := pdfSubsetTables(two)
	if err != nil {
		t.Fatal(err)
	}
	if len(old) != len(next) || len(one) != len(two) {
		t.Fatal("sfnt shape changed")
	}
	for tag, a := range old {
		b, ok := next[tag]
		if !ok || a.offset != b.offset || a.size != b.size {
			t.Fatal("sfnt table layout changed", tag)
		}
		left, right := one[a.offset:a.offset+a.size], two[b.offset:b.offset+b.size]
		switch tag {
		case "head":
			if !bytes.Equal(left[:8], right[:8]) || !bytes.Equal(left[12:], right[12:]) {
				t.Fatal("head fields beyond adjustment changed")
			}
		case "cmap":
			if !bytes.Equal(left[:14], right[:14]) || !bytes.Equal(left[16:], right[16:]) {
				t.Fatal("cmap mapping bytes changed")
			}
		default:
			if !bytes.Equal(left, right) {
				t.Fatal("non-cmap font table changed", tag)
			}
		}
	}
}

func TestPDFSubsetRepairRecognizesOddAndPreservesLegalEvenLengths(t *testing.T) {
	oddSeen, evenSeen := false, false
	for _, source := range [][]byte{assets.FallbackFont, assets.FallbackBlackFont} {
		for _, text := range []string{"甲", "甲乙", "Ab12甲乙", "办公室字体核对（模拟）", "请各科室核对库存12箱，编号A-17。"} {
			original := testSubsetRawFont(source, text)
			before := append([]byte(nil), original...)
			tables, err := pdfSubsetTables(original)
			if err != nil {
				t.Fatal(err)
			}
			cmap, head := tables["cmap"], tables["head"]
			sub := original[cmap.offset+12 : cmap.offset+cmap.size]
			declared := int(binary.BigEndian.Uint16(sub[2:]))
			minimum := 16 + 8*int(binary.BigEndian.Uint16(sub[6:]))/2
			validEven := declared%2 == 0 && declared >= minimum && declared <= len(sub)
			if declared%2 == 1 {
				oddSeen = true
			}
			if validEven {
				evenSeen = true
			}
			repaired, changed, err := repairFPDFSubsetFont(original)
			if err != nil {
				t.Fatal(text, err)
			}
			if !bytes.Equal(original, before) {
				t.Fatal("input subset changed")
			}
			testSubsetFontTablesEqual(t, original, repaired)
			if pdfSubsetChecksum(repaired) != 0xb1b0afba {
				t.Fatal("wrong whole checksum")
			}
			if validEven && binary.BigEndian.Uint16(repaired[cmap.offset+14:]) != uint16(declared) {
				t.Fatal("legal short subtable was normalized unnecessarily")
			}
			if !validEven && int(binary.BigEndian.Uint16(repaired[cmap.offset+14:])) != len(sub) {
				t.Fatal("bad subtable length not fixed")
			}
			properHead := binary.BigEndian.Uint32(original[head.offset+8:]) == uint32(0xb1b0afba)-(pdfSubsetChecksum(original)-binary.BigEndian.Uint32(original[head.offset+8:]))
			if changed != (!validEven || !properHead) {
				t.Fatal("change scope not minimal")
			}
			face, err := sfnt.Parse(repaired)
			if err != nil {
				t.Fatal(err)
			}
			for _, r := range text {
				gid, e := face.GlyphIndex(nil, r)
				if e != nil || gid == 0 {
					t.Fatal("repaired subset lost used glyph", r, e)
				}
			}
			twice, again, err := repairFPDFSubsetFont(repaired)
			if err != nil || again || !bytes.Equal(repaired, twice) {
				t.Fatal("repair is not idempotent", err)
			}
		}
	}
	if !oddSeen || !evenSeen {
		t.Fatal("odd and already legal even cases not covered", oddSeen, evenSeen)
	}
}

func TestPDFSubsetRepairKnownBorrowAndCorrectChecksumCases(t *testing.T) {
	raw := testSubsetRawFont(assets.FallbackBlackFont, "办公室字体核对（模拟）")
	fixed, _, err := repairFPDFSubsetFont(raw)
	if err != nil {
		t.Fatal(err)
	}
	tables, _ := pdfSubsetTables(fixed)
	head := tables["head"]
	// A harmless byte in name storage selects the borrow branch while retaining
	// table checksums. The original raw source assets are never changed.
	borrow := append([]byte(nil), fixed...)
	name := tables["name"]
	found := false
	for value := 0; value < 256; value++ {
		borrow[name.offset+name.size-1] = byte(value)
		testSubsetResum(t, borrow)
		zeroSum := pdfSubsetChecksum(borrow) - binary.BigEndian.Uint32(borrow[head.offset+8:])
		if uint16(zeroSum) > 0xafba {
			binary.BigEndian.PutUint32(borrow[head.offset+8:], pdfSubsetLegacyAdjustment(zeroSum))
			found = true
			break
		}
	}
	if !found || pdfSubsetChecksum(borrow) != 0xb1b2afba {
		t.Fatal("borrow fixture did not reproduce upstream error")
	}
	repaired, changed, err := repairFPDFSubsetFont(borrow)
	if err != nil || !changed || pdfSubsetChecksum(repaired) != 0xb1b0afba {
		t.Fatal("borrow fix", err)
	}
	if !bytes.Equal(repaired[:head.offset+8], borrow[:head.offset+8]) || !bytes.Equal(repaired[head.offset+12:], borrow[head.offset+12:]) {
		t.Fatal("checksum-only case changed other bytes")
	}
	if _, changed, err := repairFPDFSubsetFont(fixed); err != nil || changed {
		t.Fatal("correct checksum was changed", err)
	}
	corrupt := append([]byte(nil), fixed...)
	binary.BigEndian.PutUint32(corrupt[head.offset+8:], binary.BigEndian.Uint32(corrupt[head.offset+8:])+1)
	if _, _, err := repairFPDFSubsetFont(corrupt); err == nil {
		t.Fatal("unknown whole checksum accepted")
	}
}

func TestPDFSubsetRepairRejectsUnknownMappingOrCorruptContainer(t *testing.T) {
	raw := testSubsetRawFont(assets.FallbackFont, "甲乙AB12")
	good, _, err := repairFPDFSubsetFont(raw)
	if err != nil {
		t.Fatal(err)
	}
	tables, _ := pdfSubsetTables(good)
	cmap := tables["cmap"]
	sub := cmap.offset + 12
	n := int(binary.BigEndian.Uint16(good[sub+6:])) / 2
	mutations := []func([]byte){func(b []byte) { binary.BigEndian.PutUint16(b[sub:], 12) }, func(b []byte) { binary.BigEndian.PutUint16(b[sub+2:], 1) }, func(b []byte) { binary.BigEndian.PutUint16(b[sub+16+6*n:], 2) }, func(b []byte) { binary.BigEndian.PutUint16(b[sub+16+4*n:], 65500) }}
	for i, mutate := range mutations {
		bad := append([]byte(nil), good...)
		mutate(bad)
		testSubsetResum(t, bad)
		before := append([]byte(nil), bad...)
		if _, _, err := repairFPDFSubsetFont(bad); err == nil {
			t.Fatal("unknown cmap accepted", i)
		}
		if !bytes.Equal(before, bad) {
			t.Fatal("bad input changed")
		}
	}
	bad := append([]byte(nil), good...)
	metrics := tables["hmtx"]
	bad[metrics.offset] ^= 1
	if _, _, err := repairFPDFSubsetFont(bad); err == nil {
		t.Fatal("unrelated table corruption accepted")
	}
	for _, bad := range [][]byte{nil, make([]byte, 12), good[:len(good)/2]} {
		if _, _, err := repairFPDFSubsetFont(bad); err == nil {
			t.Fatal("truncated sfnt accepted")
		}
	}
}

func testSubsetRawPDF(t *testing.T) []byte {
	t.Helper()
	f := fpdf.New("P", "mm", "A4", "")
	f.SetCatalogSort(true)
	f.AddUTF8FontFromBytes("regular", "", assets.FallbackFont)
	f.AddUTF8FontFromBytes("black", "", assets.FallbackBlackFont)
	f.AddPage()
	f.SetFont("black", "", 22)
	f.Text(28, 45, "办公室字体核对（模拟）")
	f.SetFont("regular", "", 16)
	f.Text(28, 65, "请各科室核对库存12箱，编号A-17。")
	var out bytes.Buffer
	if err := f.Output(&out); err != nil {
		t.Fatal(err)
	}
	return out.Bytes()
}
func testSubsetFonts(t *testing.T, container pdfSubsetContainer) map[int][]byte {
	t.Helper()
	out := map[int][]byte{}
	for _, object := range container.objects {
		header := pdfSubsetStreamHeader.FindSubmatchIndex(object.data)
		if len(header) != 8 {
			continue
		}
		size, err := pdfSubsetNumber(object.data[header[4]:header[5]])
		if err != nil {
			t.Fatal(err)
		}
		decoder, err := zlib.NewReader(bytes.NewReader(object.data[header[1] : header[1]+size]))
		if err != nil {
			t.Fatal(err)
		}
		raw, err := io.ReadAll(decoder)
		decoder.Close()
		if err != nil {
			t.Fatal(err)
		}
		out[object.id] = raw
	}
	return out
}
func TestPDFSubsetOutputPreservesAllOtherObjectsTextAndCoordinates(t *testing.T) {
	original := testSubsetRawPDF(t)
	before := append([]byte(nil), original...)
	old, err := parseFPDFSubsetContainer(original)
	if err != nil {
		t.Fatal(err)
	}
	repaired, err := repairPDFSubsetFonts(original)
	if err != nil {
		t.Fatal(err)
	}
	next, err := parseFPDFSubsetContainer(repaired)
	if err != nil {
		t.Fatal(err)
	}
	oldFonts, newFonts := testSubsetFonts(t, old), testSubsetFonts(t, next)
	if len(oldFonts) != 2 || len(newFonts) != 2 {
		t.Fatal("font object counts")
	}
	if len(old.objects) != len(next.objects) || !bytes.Equal(old.header, next.header) || !bytes.Equal(old.trailer, next.trailer) {
		t.Fatal("PDF outer objects changed")
	}
	for i, object := range old.objects {
		after := next.objects[i]
		if object.id != after.id {
			t.Fatal("object order changed")
		}
		if source, ok := oldFonts[object.id]; ok {
			testSubsetFontTablesEqual(t, source, newFonts[object.id])
		} else if !bytes.Equal(object.data, after.data) {
			t.Fatal("non-font PDF object changed", object.id)
		}
	}
	read := func(data []byte) []readpdf.Text {
		reader, err := readpdf.NewReader(bytes.NewReader(data), int64(len(data)))
		if err != nil {
			t.Fatal(err)
		}
		if reader.NumPage() != 1 {
			t.Fatal("page count")
		}
		return reader.Page(1).Content().Text
	}
	left, right := read(original), read(repaired)
	if fmt.Sprint(left) != fmt.Sprint(right) {
		t.Fatal("PDF text/geometry/font references changed")
	}
	if !bytes.Equal(before, original) {
		t.Fatal("original output mutated")
	}
	twice, err := repairPDFSubsetFonts(repaired)
	if err != nil || !bytes.Equal(twice, repaired) {
		t.Fatal("PDF repair not idempotent", err)
	}
}

func testSubsetAssembleObjects(objects map[int][]byte, order []int) []byte {
	var out bytes.Buffer
	out.WriteString("%PDF-1.3\n%test\n")
	offsets := make([]int, len(objects)+1)
	for _, id := range order {
		offsets[id] = out.Len()
		out.Write(objects[id])
	}
	xref := out.Len()
	fmt.Fprintf(&out, "xref\n0 %d\n0000000000 65535 f \n", len(offsets))
	for _, offset := range offsets[1:] {
		fmt.Fprintf(&out, "%010d 00000 n \n", offset)
	}
	fmt.Fprintf(&out, "trailer\n<</Size %d\n/Root 3 0 R>>\nstartxref\n%d\n%%%%EOF\n", len(offsets), xref)
	return out.Bytes()
}
func testSubsetNameMarker(t *testing.T, source []byte) []byte {
	t.Helper()
	tables, err := pdfSubsetTables(source)
	if err != nil {
		t.Fatal(err)
	}
	names := make([]string, 0, len(tables))
	for name := range tables {
		names = append(names, name)
	}
	sort.Strings(names)
	out := make([]byte, 12+len(names)*16)
	copy(out, source[:12])
	for i, name := range names {
		table := tables[name]
		data := source[table.offset : table.offset+table.size]
		if name == "name" {
			data = append(append([]byte(nil), data...), []byte("endobj\nxref\nstartxref\n1\n%%EOF\nstream\n")...)
		}
		at := len(out)
		out = append(out, data...)
		for len(out)%4 != 0 {
			out = append(out, 0)
		}
		record := out[12+16*i:]
		copy(record, name)
		binary.BigEndian.PutUint32(record[8:], uint32(at))
		binary.BigEndian.PutUint32(record[12:], uint32(len(data)))
	}
	testSubsetResum(t, out)
	return out
}
func TestPDFSubsetBinaryMarkersUseXrefAndLengthNotStreamSearch(t *testing.T) {
	raw := testSubsetNameMarker(t, testSubsetRawFont(assets.FallbackBlackFont, "办公室字体核对（模拟）"))
	var packed bytes.Buffer
	encoder, _ := zlib.NewWriterLevel(&packed, zlib.NoCompression)
	encoder.Write(raw)
	encoder.Close()
	if !bytes.Contains(packed.Bytes(), []byte("endobj\nxref\nstartxref")) {
		t.Fatal("compressed fixture lacks literal binary marker")
	}
	font := []byte(fmt.Sprintf("2 0 obj\n<</Length %d\n/Filter /FlateDecode\n/Length1 %d\n>>\nstream\n", packed.Len(), len(raw)))
	font = append(font, packed.Bytes()...)
	font = append(font, []byte("\nendstream\nendobj\n")...)
	objects := map[int][]byte{1: []byte("1 0 obj\n<</Type /FontDescriptor /FontName /utf8probe /FontFile2 2 0 R>>\nendobj\n"), 2: font, 3: []byte("3 0 obj\n<</Type /Catalog>>\nendobj\n")}
	original := testSubsetAssembleObjects(objects, []int{3, 1, 2})
	repaired, err := repairPDFSubsetFonts(original)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := parseFPDFSubsetContainer(repaired)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.objects[0].id != 3 || parsed.objects[1].id != 1 || parsed.objects[2].id != 2 {
		t.Fatal("out-of-number object order lost")
	}
	if !bytes.Equal(parsed.objects[0].data, objects[3]) || !bytes.Equal(parsed.objects[1].data, objects[1]) {
		t.Fatal("opaque non-font object changed")
	}
	fonts := testSubsetFonts(t, parsed)
	if pdfSubsetChecksum(fonts[2]) != 0xb1b0afba {
		t.Fatal("repaired font checksum")
	}
	testSubsetFontTablesEqual(t, raw, fonts[2])
}

func TestPDFSubsetContainerRejectsUnknownXrefFilterAndLengths(t *testing.T) {
	raw := testSubsetRawPDF(t)
	for _, bad := range [][]byte{nil, raw[:len(raw)/2], bytes.Replace(raw, []byte("xref\n0 "), []byte("xref\n1 "), 1), bytes.Replace(raw, []byte("/Root "), []byte("/Encrypt "), 1)} {
		if _, err := repairPDFSubsetFonts(bad); err == nil {
			t.Fatal("unknown PDF container accepted")
		}
	}
	parsed, err := parseFPDFSubsetContainer(raw)
	if err != nil {
		t.Fatal(err)
	}
	for _, object := range parsed.objects {
		if !pdfSubsetStreamHeader.Match(object.data) {
			continue
		}
		bad := object
		bad.data = bytes.Replace(object.data, []byte("/FlateDecode"), []byte("/ASCIIHexDecode"), 1)
		if _, _, err := repairFPDFFontObject(bad); err == nil {
			t.Fatal("unknown filter accepted")
		}
		header := pdfSubsetStreamHeader.FindSubmatchIndex(object.data)
		wrong := append([]byte(nil), object.data...)
		wrong[header[4]] = '9'
		bad.data = wrong
		if _, _, err := repairFPDFFontObject(bad); err == nil {
			t.Fatal("wrong stream length accepted")
		}
		oversized := strings.Replace(string(object.data[:header[1]]), string(object.data[header[6]:header[7]]), "999999999", 1)
		bad.data = append([]byte(oversized), object.data[header[1]:]...)
		if _, _, err := repairFPDFFontObject(bad); err == nil {
			t.Fatal("inflated-size bound ignored")
		}
		return
	}
	t.Fatal("missing font stream")
}
