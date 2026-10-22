package main

import (
	"bytes"
	"crypto/sha256"
	"doc2govpdf/internal/office"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
)

func digest(data []byte) string { s := sha256.Sum256(data); return hex.EncodeToString(s[:]) }
func fail(e error) {
	if e != nil {
		panic(e)
	}
}

type tableState struct {
	Cells  int          `json:"cells"`
	Blanks int          `json:"blanks"`
	Tables int          `json:"tables"`
	Matrix [][][]string `json:"-"`
	SHA    string       `json:"matrixSHA256"`
}

func tables(m office.Model) tableState {
	v := tableState{}
	for _, b := range m.Blocks {
		if b.Table == nil {
			continue
		}
		v.Tables++
		rows := [][]string{}
		for _, r := range b.Table.Rows {
			cells := []string{}
			for _, c := range r.Cells {
				text := []string{}
				for _, p := range c.Paragraphs {
					text = append(text, p.Prefix+p.Text)
				}
				s := strings.Join(text, "\n")
				cells = append(cells, s)
				v.Cells++
				if s == "" {
					v.Blanks++
				}
			}
			rows = append(rows, cells)
		}
		v.Matrix = append(v.Matrix, rows)
	}
	b, _ := json.Marshal(v.Matrix)
	v.SHA = digest(b)
	return v
}
func main() {
	if len(os.Args) != 3 {
		panic("usage: go run ./tmp/normalized-footer-probe INPUT.docx OUTDIR")
	}
	source := os.Args[1]
	out := os.Args[2]
	fail(os.MkdirAll(out, 0700))
	data, e := os.ReadFile(source)
	fail(e)
	if digest(data) != "f53393e97c5be20febaf04ae8336b82f0dbaea12a27be179c769d473777f7ee8" {
		panic("exact supplied original Word required; do not substitute another manuscript")
	}
	pkg, e := office.Open(data)
	fail(e)
	before, e := json.Marshal(pkg.Model)
	fail(e)
	unmodified, e := pkg.Export(pkg.Model, false)
	fail(e)
	if !bytes.Equal(data, unmodified) {
		panic("original byte preservation failed")
	}
	normal := office.NormalizeLayout(pkg.Model)
	afterOriginal, _ := json.Marshal(pkg.Model)
	if !bytes.Equal(before, afterOriginal) {
		panic("NormalizeLayout mutated source model")
	}
	oldText, newText := pkg.Model.Text(), normal.Text()
	oldTables, newTables := tables(pkg.Model), tables(normal)
	if oldText != newText || !reflect.DeepEqual(oldTables.Matrix, newTables.Matrix) {
		panic("normalization changed content")
	}
	oldp, nextp := pkg.Model.Paragraphs(), normal.Paragraphs()
	sizeChanges := 0
	for i := range oldp {
		if oldp[i].Size != nextp[i].Size {
			sizeChanges++
		}
	}
	if sizeChanges != 0 {
		panic("source normalization changes font sizes; do not use this task without recording the boundary")
	}
	if oldTables.Tables != 3 || oldTables.Cells != 81 || oldTables.Blanks != 29 {
		panic("not the expected original table shape")
	}
	output, e := pkg.Export(normal, false)
	fail(e)
	reopened, e := office.Open(output)
	fail(e)
	if reopened.Model.Text() != oldText || !reflect.DeepEqual(tables(reopened.Model).Matrix, oldTables.Matrix) {
		panic("export roundtrip changed original text/cells")
	}
	unchanged, e := reopened.Export(reopened.Model, false)
	fail(e)
	if !bytes.Equal(output, unchanged) {
		panic("normalized Word reexport not byte exact")
	}
	filename := filepath.Join(out, "normalized-original.docx")
	fail(os.WriteFile(filename, output, 0600))
	model, _ := json.MarshalIndent(normal, "", "  ")
	fail(os.WriteFile(filepath.Join(out, "normalized-source.model.json"), model, 0600))
	changed := []string{}
	for name, part := range reopened.Parts {
		if !bytes.Equal(part, pkg.Parts[name]) {
			changed = append(changed, name)
		}
	}
	sort.Strings(changed)
	report := map[string]any{"sourceSHA256": digest(data), "sourceBytesUnchanged": true, "outputSHA256": digest(output), "sourceModelSHA256": digest(before), "normalizedModelSHA256": digest(model), "sourceModelUnchanged": true, "textSHA256": digest([]byte(oldText)), "contentUnchanged": true, "normalized": normal.LayoutNormalized, "fontSizeChanges": sizeChanges, "tables": oldTables, "roundtripTextAndCellsExact": true, "normalizedWordReexportByteExact": true, "changedParts": changed, "boundary": "Existing real Word through Office.Open -> NormalizeLayout -> Package.Export. No manual content/font-size changes; normalization may change other declared paragraph formatting. Actual receiver output has not yet been evaluated."}
	b, _ := json.MarshalIndent(report, "", "  ")
	fail(os.WriteFile(filepath.Join(out, "source-normalization.json"), b, 0600))
	fmt.Println(string(b))
}
