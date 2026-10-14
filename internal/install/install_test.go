package install

import (
	"archive/zip"
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

func payload(t *testing.T, name, body string) []byte {
	t.Helper()
	var b bytes.Buffer
	z := zip.NewWriter(&b)
	f, _ := z.Create(name)
	f.Write([]byte(body))
	z.Close()
	return b.Bytes()
}
func TestInstallUpgradeRollbackUninstall(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "app")
	if e := Install(payload(t, "Doc2GovPDF.exe", "old"), dir, "1.0.0"); e != nil {
		t.Fatal(e)
	}
	user := filepath.Join(dir, "用户文件.docx")
	os.WriteFile(user, []byte("keep"), 0600)
	if e := Install(payload(t, "Doc2GovPDF.exe", "new"), dir, "1.1.0"); e != nil {
		t.Fatal(e)
	}
	if e := Rollback(dir); e != nil {
		t.Fatal(e)
	}
	b, _ := os.ReadFile(filepath.Join(dir, "Doc2GovPDF.exe"))
	if string(b) != "old" {
		t.Fatal("rollback failed")
	}
	if e := Uninstall(dir); e != nil {
		t.Fatal(e)
	}
	b, _ = os.ReadFile(user)
	if string(b) != "keep" {
		t.Fatal("uninstall removed user file")
	}
}
func TestInstallerRejectsTraversalAndForeignDirectory(t *testing.T) {
	if e := Install(payload(t, "../outside.exe", "x"), filepath.Join(t.TempDir(), "app"), "1.0.0"); e == nil {
		t.Fatal("path traversal")
	}
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "owned.txt"), []byte("user"), 0600)
	if e := Install(payload(t, "Doc2GovPDF.exe", "x"), dir, "1.0.0"); e == nil {
		t.Fatal("foreign directory overwritten")
	}
}
