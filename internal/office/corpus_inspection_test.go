package office

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// These historical fixtures pass the upstream tool, but some omit body font/size.
// Application defaults cannot certify 9704 formatting; reviews are legitimate.
func TestInspectUpstreamCorpus(t *testing.T) {
	files, _ := filepath.Glob("../../testdata/upstream/gongwen-kit/docx/*.docx")
	for _, file := range files {
		t.Run(filepath.Base(file), func(t *testing.T) {
			b, _ := os.ReadFile(file)
			p, e := Open(b)
			if e != nil {
				t.Fatal(e)
			}
			if !strings.Contains(strings.Join(p.Model.Warnings, " "), "未明确声明") {
				t.Fatal("sparse font/size defaults must be reported as unverified")
			}
			r, e := Inspect(p.Model)
			if e != nil {
				t.Fatal(e)
			}
			for _, f := range r.Issues {
				t.Logf("%s: %s", f.Rule, f.Message)
				if f.Rule != "format.size" || f.Severity != "review" {
					t.Errorf("unexpected corpus issue: %+v", f)
				}
			}
		})
	}
}
