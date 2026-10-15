package office

import "strings"

func wrapRosterNames(text string, width float64, measure func(string) float64) []string {
	var lines []string
	for _, part := range strings.Split(text, "\n") {
		var tokens []string
		token := ""
		for _, r := range part {
			token += string(r)
			if strings.ContainsRune("、，,", r) {
				tokens = append(tokens, token)
				token = ""
			}
		}
		if token != "" {
			tokens = append(tokens, token)
		}
		line := ""
		for _, name := range tokens {
			if line != "" && measure(line+name) > width+.1 {
				lines = append(lines, line)
				line = ""
			}
			line += name
		}
		lines = append(lines, line)
	}
	return lines
}
