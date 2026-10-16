package office

import (
	"regexp"
	"strings"
)

var annexMark = regexp.MustCompile(`^(?:.*〔[0-9]{4}〕.*号)?附件[0-9]*$`)
var annexNext = regexp.MustCompile(`^[0-9]+[.．、]`)

func inferStructuralRoles(m *Model) {
	afterTitle, afterAnnex, description := false, false, false
	for _, b := range m.Blocks {
		p := b.Paragraph
		if p == nil {
			afterTitle = false
			continue
		}
		text := strings.TrimSpace(p.Text)
		if text == "" {
			continue
		}
		if p.PageBreak && annexMark.MatchString(text) {
			p.Role = "attachment-label"
			afterAnnex = true
			continue
		}
		if afterAnnex {
			if p.Align == "center" && p.Size >= 15 {
				p.Role = "attachment-title"
			}
			afterAnnex = false
			continue
		}
		if strings.HasPrefix(text, "附件：") {
			p.Role = "attachment-description"
			description = true
			continue
		}
		if description {
			if annexNext.MatchString(text) && p.Prefix == "" {
				p.Role = "attachment-description"
				continue
			}
			description = false
		}
		if p.Role == "title" {
			afterTitle = true
			continue
		}
		if afterTitle {
			if p.Indent == 0 && strings.HasSuffix(text, "：") && p.Role == "body" {
				p.Role = "recipient"
			}
			afterTitle = false
		}
	}
}
