package userdata

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

type snapshotFile struct {
	Exists bool   `json:"exists"`
	Hash   string `json:"hash"`
}
type snapshot struct {
	Token string                  `json:"token"`
	Files map[string]snapshotFile `json:"files"`
}

var files = []string{"workspace.json", "preferences.json", "draft.json"}

func Dir() string {
	if p := os.Getenv("DOC2GOVPDF_DATA_DIR"); p != "" {
		return p
	}
	p, _ := os.UserConfigDir()
	return filepath.Join(p, "Doc2GovPDF")
}
func Token(pending []byte) string { h := sha256.Sum256(pending); return hex.EncodeToString(h[:]) }
func Snapshot(dir, token string) error {
	folder := filepath.Join(dir, "upgrade-backup")
	if b, e := os.ReadFile(filepath.Join(folder, "manifest.json")); e == nil {
		var old snapshot
		if json.Unmarshal(b, &old) == nil && old.Token == token {
			return nil
		}
	}
	if e := os.MkdirAll(folder, 0700); e != nil {
		return e
	}
	s := snapshot{Token: token, Files: map[string]snapshotFile{}}
	for _, name := range files {
		b, e := os.ReadFile(filepath.Join(dir, name))
		if os.IsNotExist(e) {
			s.Files[name] = snapshotFile{}
			continue
		}
		if e != nil {
			return e
		}
		if len(b) > 20*1024*1024 {
			return fmt.Errorf("用户数据过大，未开始升级迁移")
		}
		h := sha256.Sum256(b)
		s.Files[name] = snapshotFile{true, hex.EncodeToString(h[:])}
		if e = atomic(filepath.Join(folder, name), b); e != nil {
			return e
		}
	}
	b, _ := json.Marshal(s)
	return atomic(filepath.Join(folder, "manifest.json"), b)
}
func Restore(dir, token string) error {
	folder := filepath.Join(dir, "upgrade-backup")
	b, e := os.ReadFile(filepath.Join(folder, "manifest.json"))
	if os.IsNotExist(e) {
		return nil
	}
	if e != nil {
		return e
	}
	var s snapshot
	if json.Unmarshal(b, &s) != nil {
		return fmt.Errorf("升级备份清单损坏")
	}
	if s.Token != token {
		return nil
	}
	data := map[string][]byte{}
	for _, name := range files {
		entry, ok := s.Files[name]
		if !ok {
			return fmt.Errorf("升级备份清单不完整")
		}
		if !entry.Exists {
			continue
		}
		b, e := os.ReadFile(filepath.Join(folder, name))
		if e != nil {
			return e
		}
		h := sha256.Sum256(b)
		if hex.EncodeToString(h[:]) != entry.Hash {
			return fmt.Errorf("升级备份校验失败，原件未覆盖")
		}
		data[name] = b
	}
	for _, name := range files {
		if b, ok := data[name]; ok {
			if e = atomic(filepath.Join(dir, name), b); e != nil {
				return e
			}
		} else {
			if e = os.Remove(filepath.Join(dir, name)); e != nil && !os.IsNotExist(e) {
				return e
			}
		}
	}
	return nil
}
func atomic(path string, b []byte) error {
	f, e := os.CreateTemp(filepath.Dir(path), ".upgrade-*.tmp")
	if e != nil {
		return e
	}
	name := f.Name()
	defer os.Remove(name)
	if _, e = f.Write(b); e == nil {
		e = f.Sync()
	}
	ce := f.Close()
	if e == nil {
		e = ce
	}
	if e != nil {
		return e
	}
	return os.Rename(name, path)
}
