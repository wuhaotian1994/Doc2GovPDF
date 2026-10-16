package office

// Conservative, reviewable counterparts of upstream lib/fix/text-rules.js.
import (
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

var paddedInline = regexp.MustCompile(`(年\s*)0([0-9]\s*月)|(月\s*)0([0-9]\s*日)`)
var referenceInline = regexp.MustCompile(`[【\[〔]([0-9]{4})[】\]〕]\s*(?:第\s*)?0*([0-9]+)\s*号`)
var chineseDate = regexp.MustCompile(`([〇零一二三四五六七八九]{4})\s*年(?:\s*([一二三四五六七八九十]{1,3})\s*月(?:\s*([一二三四五六七八九十]{1,3})\s*日)?)?`)
var fullwidthDigits = regexp.MustCompile(`[０-９]+`)
var joinedUnit = regexp.MustCompile(`[0-9](?:mAh/g|GWh|kWh|MWh|kg|kW|MW|mm|cm|km|ppm|t/h|g/cm|Wh)`)
var bareDecimal = regexp.MustCompile(`(?:^|[^0-9A-Za-z_.])\.[0-9]+`)
var duplicateManual = regexp.MustCompile(`^(?:[一二三四五六七八九十]+[、．.]|（[一二三四五六七八九十]+）|[0-9]{1,2}[.．、])\s*`)

func protectedAt(text string, a, b int) bool {
	for _, span := range protectedSpan.FindAllStringIndex(text, -1) {
		if a < span[1] && max(a+1, b) > span[0] {
			return true
		}
	}
	return false
}
func replaceSafe(text string, re *regexp.Regexp, replace func(string) string) string {
	var out strings.Builder
	from := 0
	for _, loc := range re.FindAllStringIndex(text, -1) {
		if protectedAt(text, loc[0], loc[1]) {
			continue
		}
		out.WriteString(text[from:loc[0]])
		out.WriteString(replace(text[loc[0]:loc[1]]))
		from = loc[1]
	}
	out.WriteString(text[from:])
	return out.String()
}
func cjk(r rune) bool { return unicode.Is(unicode.Han, r) || r >= 0x3000 && r <= 0x303f }
func punctuationCorrection(text string) string {
	rs := []rune(text)
	at := make([]int, len(rs))
	n := 0
	for i, r := range rs {
		at[i] = n
		n += utf8.RuneLen(r)
	}
	result := append([]rune{}, rs...)
	stack := []int{}
	set := func(i int, r rune) {
		if i >= 0 && !protectedAt(text, at[i], at[i]+utf8.RuneLen(rs[i])) {
			result[i] = r
		}
	}
	pair := func(a, b int) {
		near := false
		for _, i := range []int{a - 1, a + 1, b - 1, b + 1} {
			if i >= 0 && i < len(rs) && cjk(rs[i]) {
				near = true
			}
		}
		if a >= 0 && b >= 0 {
			for _, r := range rs[a+1 : b] {
				if cjk(r) {
					near = true
				}
			}
		}
		if near {
			set(a, '（')
			set(b, '）')
		}
	}
	for i, r := range rs {
		if r == '(' {
			stack = append(stack, i)
		} else if r == ')' {
			a := -1
			if len(stack) > 0 {
				a = stack[len(stack)-1]
				stack = stack[:len(stack)-1]
			}
			pair(a, i)
		}
	}
	for _, a := range stack {
		pair(a, -1)
	}
	punct := map[rune]rune{',': '，', ';': '；', ':': '：', '!': '！', '?': '？', '.': '。'}
	for i, r := range rs {
		replacement, ok := punct[r]
		if !ok {
			continue
		}
		var prev, next rune
		if i > 0 {
			prev = rs[i-1]
		}
		if i+1 < len(rs) {
			next = rs[i+1]
		}
		closer := strings.ContainsRune(")）」”", prev)
		if !cjk(prev) && !cjk(next) && !(r == '.' && closer && hasHan(text)) {
			continue
		}
		if r == '.' && (unicode.IsDigit(prev) || unicode.IsDigit(next) || prev == '.' || next == '.' || !cjk(prev) && !closer) {
			continue
		}
		if r == ':' && unicode.IsDigit(prev) && unicode.IsDigit(next) {
			continue
		}
		set(i, replacement)
	}
	return string(result)
}
func TextCorrections(p Paragraph) map[string]string {
	if p.Protected {
		out := map[string]string{}
		shift := map[string]int{}
		var editable []TextRange
		for _, r := range p.EditableRanges {
			if r.Start < 0 || r.End > len(p.Text) || r.End < r.Start {
				continue
			}
			start := r.Start
			for _, guard := range protectedSpan.FindAllStringIndex(p.Text, -1) {
				if guard[1] <= start || guard[0] >= r.End {
					continue
				}
				if guard[0] > start {
					editable = append(editable, TextRange{start, guard[0]})
				}
				start = max(start, guard[1])
				if start >= r.End {
					break
				}
			}
			if start < r.End {
				editable = append(editable, TextRange{start, r.End})
			}
		}
		for _, r := range editable {
			if r.Start < 0 || r.End > len(p.Text) || r.End < r.Start {
				continue
			}
			part := p
			part.Protected = false
			part.EditableRanges = nil
			part.Text = p.Text[r.Start:r.End]
			part.Prefix = ""
			for id, replacement := range TextCorrections(part) {
				base, ok := out[id]
				if !ok {
					base = p.Text
				}
				start, end := r.Start+shift[id], r.End+shift[id]
				out[id] = base[:start] + replacement + base[end:]
				shift[id] += len(replacement) - (r.End - r.Start)
			}
		}
		return out
	}
	text := p.Text
	out := map[string]string{}
	put := func(id, next string) {
		if next != text {
			out[id] = next
		}
	}
	put("date.inline-padding", replaceSafe(text, paddedInline, func(s string) string {
		m := paddedInline.FindStringSubmatch(s)
		if m[1] != "" {
			return m[1] + m[2]
		}
		return m[3] + m[4]
	}))
	put("reference.format", replaceSafe(text, referenceInline, func(s string) string {
		m := referenceInline.FindStringSubmatch(s)
		n, e := strconv.Atoi(m[2])
		if e != nil {
			return s
		}
		return "〔" + m[1] + "〕" + strconv.Itoa(n) + "号"
	}))
	put("date.chinese-year", replaceSafe(text, chineseDate, func(s string) string {
		m := chineseDate.FindStringSubmatch(s)
		if !strings.ContainsRune(m[1], '〇') {
			return s
		}
		digits := "〇一二三四五六七八九"
		year := ""
		for _, r := range m[1] {
			if r == '零' {
				r = '〇'
			}
			year += strconv.Itoa(strings.IndexRune(digits, r) / 3)
		}
		y, _ := strconv.Atoi(year)
		month, day := countNumber(m[2]), countNumber(m[3])
		if m[2] != "" && (month < 1 || month > 12) || m[3] != "" && (day < 1 || day > 31) {
			return s
		}
		if day > 0 {
			date := time.Date(y, time.Month(month), day, 0, 0, 0, 0, time.UTC)
			if int(date.Month()) != month || date.Day() != day {
				return s
			}
		}
		v := year + "年"
		if month > 0 {
			v += strconv.Itoa(month) + "月"
		}
		if day > 0 {
			v += strconv.Itoa(day) + "日"
		}
		return v
	}))
	put("number.fullwidth", replaceSafe(text, fullwidthDigits, func(s string) string { return strings.Map(func(r rune) rune { return r - 0xfee0 }, s) }))
	put("punctuation.half", punctuationCorrection(text))
	for _, pair := range variants {
		if at := editableOccurrence(text, pair.from); at >= 0 {
			put("word.variant", text[:at]+pair.to+text[at+len(pair.from):])
			break
		}
	}
	put("number.unit-space", replaceSafe(text, joinedUnit, func(s string) string { return s[:1] + " " + s[1:] }))
	put("number.bare-decimal", replaceSafe(text, bareDecimal, func(s string) string {
		dot := strings.IndexByte(s, '.')
		if dot == 0 {
			return "0" + s
		}
		r, _ := utf8.DecodeLastRuneInString(s[:dot])
		if cjk(r) || strings.ContainsRune("（(：:，", r) {
			return s[:dot] + "0" + s[dot:]
		}
		return s
	}))
	if p.Prefix != "" && headingLevel(&p) > 0 {
		if loc := duplicateManual.FindStringIndex(text); loc != nil {
			if loc[1] < len(text) && text[loc[1]] >= '0' && text[loc[1]] <= '9' {
			} else {
				put("format.duplicate-number", text[loc[1]:])
			}
		}
	}
	return out
}
