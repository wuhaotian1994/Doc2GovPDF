package office

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestReferenceFieldAdviceMatchesExistingFinding(t *testing.T) {
	data, err := os.ReadFile("../../scripts/fixtures/reference-advice.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Input       string  `json:"input"`
		Replacement *string `json:"engineReplacement"`
	}
	if err = json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	for _, sample := range cases {
		got, ok := TextCorrections(Paragraph{Text: strings.TrimSpace(sample.Input), Role: "reference"})["reference.format"]
		if sample.Replacement == nil {
			if ok {
				t.Errorf("unexpected finding for %q: %s", sample.Input, got)
			}
		} else if !ok || got != *sample.Replacement {
			t.Errorf("%q: got %q, want %q", sample.Input, got, *sample.Replacement)
		}
	}
}
