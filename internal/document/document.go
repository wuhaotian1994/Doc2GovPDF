// Package document implements the first, deliberately bounded, text workflow.
package document

import (
	"crypto/sha256"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

const MaxTextBytes = 2 * 1024 * 1024
const RuleVersion = "0.1.0"

type Issue struct {
	ID          string `json:"id"`
	Rule        string `json:"rule"`
	Paragraph   int    `json:"paragraph"`
	Original    string `json:"original"`
	Replacement string `json:"replacement"`
	Message     string `json:"message"`
}

type Report struct {
	Digest      string   `json:"digest"`
	RuleVersion string   `json:"ruleVersion"`
	Issues      []Issue  `json:"issues"`
	Unchecked   []string `json:"unchecked"`
}

func Validate(text string) error {
	if len(text) > MaxTextBytes {
		return fmt.Errorf("正文超过 2 MB，请拆分后处理")
	}
	if !utf8.ValidString(text) {
		return fmt.Errorf("正文不是有效的 UTF-8 文本")
	}
	if strings.TrimSpace(text) == "" {
		return fmt.Errorf("请先填写或导入正文")
	}
	for _, r := range text {
		if r < 32 && r != '\n' && r != '\r' && r != '\t' {
			return fmt.Errorf("正文包含无法写入 Word 的控制字符")
		}
		if r == 0xfffe || r == 0xffff {
			return fmt.Errorf("正文包含无法写入 Word 的字符")
		}
	}
	return nil
}

func NormalizeNewlines(text string) string {
	return strings.ReplaceAll(strings.ReplaceAll(text, "\r\n", "\n"), "\r", "\n")
}

var dateLine = regexp.MustCompile(`^([0-9]{4})年([0-9]{1,2})月([0-9]{1,2})日$`)
var referenceLine = regexp.MustCompile(`^([\p{Han}A-Za-z]{1,24})[〔【\[〖]([0-9]{4})[〕】\]〗](第)?([0-9]{1,6})号$`)

// Check only proposes changes to complete, standalone date/reference lines.
// It never rewrites numbers in prose, quotations or tables.
func Check(text string) (Report, error) {
	if err := Validate(text); err != nil {
		return Report{}, err
	}
	r := Report{Digest: fmt.Sprintf("%x", sha256.Sum256([]byte(text))), RuleVersion: RuleVersion,
		Issues: []Issue{}, Unchecked: []string{"正文数字自洽与表格", "文风、事实及引用内容", "字体、分页与完整公文格式"}}
	for i, raw := range strings.Split(NormalizeNewlines(text), "\n") {
		line := strings.TrimSpace(raw)
		add := func(rule, replacement, message string) {
			h := sha256.Sum256([]byte(fmt.Sprintf("%s:%d:%s", rule, i, raw)))
			r.Issues = append(r.Issues, Issue{ID: fmt.Sprintf("%x", h[:8]), Rule: rule, Paragraph: i, Original: raw, Replacement: replacement, Message: message})
		}
		if m := dateLine.FindStringSubmatch(line); m != nil {
			year, _ := strconv.Atoi(m[1])
			month, _ := strconv.Atoi(m[2])
			day, _ := strconv.Atoi(m[3])
			d := time.Date(year, time.Month(month), day, 0, 0, 0, 0, time.UTC)
			if year == 0 || d.Year() != year || int(d.Month()) != month || d.Day() != day {
				add("date.invalid", "", "这个日期不存在，请核对原始材料后手动修改。")
			} else {
				want := fmt.Sprintf("%d年%d月%d日", year, month, day)
				if want != line {
					add("date.padding", strings.Replace(raw, line, want, 1), "如果这是成文日期，月、日不补零；请确认后应用。")
				}
			}
		}
		if m := referenceLine.FindStringSubmatch(line); m != nil {
			n, _ := strconv.Atoi(m[4])
			want := fmt.Sprintf("%s〔%s〕%d号", m[1], m[2], n)
			if want != line {
				add("reference.format", strings.Replace(raw, line, want, 1), "如果这是发文字号，年份使用六角括号，序号去掉“第”和前导零；请确认后应用。")
			}
		}
	}
	return r, nil
}

func Apply(text, id string) (string, error) {
	r, err := Check(text)
	if err != nil {
		return "", err
	}
	for _, issue := range r.Issues {
		if issue.ID == id && issue.Replacement != "" {
			lines := strings.Split(NormalizeNewlines(text), "\n")
			lines[issue.Paragraph] = issue.Replacement
			return strings.Join(lines, "\n"), nil
		}
	}
	return "", fmt.Errorf("内容已改变或此项需要手动修改，请重新检查")
}
