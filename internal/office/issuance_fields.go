package office

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

// The optional existing fields form an independently authored fact pair. Their
// absence keeps legacy templates intact; partial input must never borrow the
// signing agency or document date to manufacture a complete imprint.
func hasExplicitImprint(f Fields) bool { return f.Issuer != "" || f.IssueDate != "" }

func imprintValues(f Fields) (string, string) {
	if hasExplicitImprint(f) {
		return f.Issuer, f.IssueDate
	}
	return f.Agency, f.Date
}

func validateIssuanceFields(f Fields) error {
	if f.Signer != "" && len(cleanNames(f.Signers)) > 0 && strings.TrimSpace(f.Signer) != cleanNames(f.Signers)[0] {
		return fmt.Errorf("签发人单项与签发人名单不一致，请明确采用的原始事实；不会自动选择其中一个")
	}
	if !hasExplicitImprint(f) {
		return nil
	}
	if strings.TrimSpace(f.Issuer) == "" {
		return fmt.Errorf("请明确填写独立印发机关；不会使用落款单位代替")
	}
	if strings.TrimSpace(f.IssueDate) == "" {
		return fmt.Errorf("请明确填写独立印发日期；不会使用成文日期代替")
	}
	if strings.ContainsAny(f.Issuer, "\r\n\t") {
		return fmt.Errorf("印发机关请填写在单独一行，不能含换行或制表符")
	}
	if !dateStandalone(f.IssueDate) {
		return fmt.Errorf("印发日期需明确为完整年月日，冲突日期请先核实；不会自动选取来源日期")
	}
	match := inlineDate.FindStringSubmatch(f.IssueDate)
	if len(match) != 4 {
		return fmt.Errorf("请核对独立印发日期的完整年月日")
	}
	year, _ := strconv.Atoi(match[1])
	month, _ := strconv.Atoi(match[2])
	day, _ := strconv.Atoi(match[3])
	date := time.Date(year, time.Month(month), day, 0, 0, 0, 0, time.UTC)
	if year == 0 || date.Year() != year || int(date.Month()) != month || date.Day() != day {
		return fmt.Errorf("独立印发日期不是有效日期，请依据原始材料核对")
	}
	if f.Kind == "letter" {
		return fmt.Errorf("函类版式暂不支持独立印发栏，请保留原始事实，勿把它并入落款或抄送")
	}
	return nil
}
