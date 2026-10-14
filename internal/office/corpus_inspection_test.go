package office

import (
	"os"
	"path/filepath"
	"testing"
)

func TestInspectUpstreamCorpus(t *testing.T) {
	files, _ := filepath.Glob("../../testdata/upstream/gongwen-kit/docx/*.docx")
	for _, file := range files {
		t.Run(filepath.Base(file), func(t *testing.T) {
			b, _ := os.ReadFile(file)
			p, e := Open(b)
			if e != nil {
				t.Fatal(e)
			}
			r, e := Inspect(p.Model)
			if e != nil {
				t.Fatal(e)
			}
			for _, f := range r.Issues {
				t.Logf("%s: %s", f.Rule, f.Message)
				t.Errorf("upstream passing example flagged: %+v", f)
			}
		})
	}
}
