package userdata

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSnapshotRestoreAndReentry(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "workspace.json")
	os.WriteFile(path, []byte("old"), 0600)
	if e := Snapshot(dir, "installation-1"); e != nil {
		t.Fatal(e)
	}
	os.WriteFile(path, []byte("new-schema"), 0600)
	os.WriteFile(filepath.Join(dir, "preferences.json"), []byte("created"), 0600)
	if e := Snapshot(dir, "installation-1"); e != nil {
		t.Fatal(e)
	}
	if e := Restore(dir, "installation-1"); e != nil {
		t.Fatal(e)
	}
	b, _ := os.ReadFile(path)
	if string(b) != "old" {
		t.Fatal("backup overwritten or restore failed")
	}
	if _, e := os.Stat(filepath.Join(dir, "preferences.json")); !os.IsNotExist(e) {
		t.Fatal("new data not rolled back")
	}
}
func TestCorruptBackupDoesNotOverwriteUserData(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "workspace.json")
	os.WriteFile(path, []byte("old"), 0600)
	Snapshot(dir, "x")
	os.WriteFile(path, []byte("current"), 0600)
	os.WriteFile(filepath.Join(dir, "upgrade-backup", "workspace.json"), []byte("corrupt"), 0600)
	if e := Restore(dir, "x"); e == nil {
		t.Fatal("corrupt backup accepted")
	}
	b, _ := os.ReadFile(path)
	if string(b) != "current" {
		t.Fatal("user data changed")
	}
}
