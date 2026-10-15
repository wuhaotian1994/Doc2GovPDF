// Package install manages an application-owned directory. It never recursively
// deletes a target directory or touches user documents/configuration.
package install

import (
	"archive/zip"
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

const Marker = ".doc2govpdf-install.json"

type State struct {
	Version string            `json:"version"`
	Files   map[string]string `json:"files"`
}

func safeName(name string) bool {
	return name != "" && !filepath.IsAbs(name) && !strings.ContainsAny(name, "\\:") && name == filepath.ToSlash(filepath.Clean(name)) && !strings.HasPrefix(name, "../") && name != ".."
}
func ReadState(dir string) (State, error) {
	var s State
	b, e := os.ReadFile(filepath.Join(dir, Marker))
	if e != nil {
		return s, e
	}
	e = json.Unmarshal(b, &s)
	if s.Version == "" || len(s.Files) == 0 {
		return s, fmt.Errorf("安装标记损坏")
	}
	return s, e
}
func Install(payload []byte, dir, version string) error {
	absolute, e := filepath.Abs(dir)
	if e != nil {
		return e
	}
	if filepath.Dir(absolute) == absolute {
		return fmt.Errorf("不能安装到磁盘根目录")
	}
	if e = os.MkdirAll(absolute, 0700); e != nil {
		return e
	}
	previous, oldErr := ReadState(absolute)
	if oldErr == nil {
		if e = CheckRemovable(absolute); e != nil {
			return e
		}
	}
	if oldErr != nil {
		entries, e := os.ReadDir(absolute)
		if e != nil {
			return e
		}
		if len(entries) > 0 {
			return fmt.Errorf("所选目录不是本软件的安装目录，请选择空目录")
		}
	}
	z, e := zip.NewReader(bytes.NewReader(payload), int64(len(payload)))
	if e != nil {
		return e
	}
	if len(z.File) > 100 {
		return fmt.Errorf("安装包文件数量异常")
	}
	staging, e := os.MkdirTemp(absolute, ".stage-")
	if e != nil {
		return e
	}
	staged := []string{}
	defer func() {
		for _, p := range staged {
			_ = os.Remove(p)
		}
		_ = os.Remove(staging)
	}()
	state := State{Version: version, Files: map[string]string{}}
	total := uint64(0)
	for _, entry := range z.File {
		if entry.FileInfo().IsDir() {
			continue
		}
		name := entry.Name
		if !safeName(name) || strings.Contains(name, "/") {
			return fmt.Errorf("安装包包含无效文件路径")
		}
		if name == Marker || strings.HasPrefix(name, ".") {
			return fmt.Errorf("安装包文件名无效")
		}
		if _, ok := state.Files[name]; ok {
			return fmt.Errorf("安装包有重复文件")
		}
		total += entry.UncompressedSize64
		if total > 800*1024*1024 {
			return fmt.Errorf("安装包解压体积异常")
		}
		r, e := entry.Open()
		if e != nil {
			return e
		}
		path := filepath.Join(staging, name)
		f, e := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if e != nil {
			r.Close()
			return e
		}
		staged = append(staged, path)
		h := sha256.New()
		n, e := io.Copy(io.MultiWriter(f, h), io.LimitReader(r, 256*1024*1024+1))
		r.Close()
		ce := f.Close()
		if e != nil {
			return e
		}
		if ce != nil {
			return ce
		}
		if n > 256*1024*1024 {
			return fmt.Errorf("安装文件过大")
		}
		state.Files[name] = hex.EncodeToString(h.Sum(nil))
	}
	if _, ok := state.Files["Doc2GovPDF.exe"]; !ok {
		return fmt.Errorf("安装包缺少主程序")
	}
	for name := range state.Files {
		if _, known := previous.Files[name]; !known {
			if _, e := os.Stat(filepath.Join(absolute, name)); e == nil {
				return fmt.Errorf("安装目标包含同名用户文件 %s，未覆盖", name)
			}
		}
	}
	backup := filepath.Join(absolute, ".previous")
	if oldErr == nil {
		if e = os.MkdirAll(backup, 0700); e != nil {
			return e
		}
		for name := range previous.Files {
			if !safeName(name) || strings.Contains(name, "/") {
				return fmt.Errorf("原安装标记含无效路径")
			}
			src := filepath.Join(absolute, name)
			b, e := os.ReadFile(src)
			if os.IsNotExist(e) {
				continue
			}
			if e != nil {
				return e
			}
			sum := sha256.Sum256(b)
			if hex.EncodeToString(sum[:]) != previous.Files[name] {
				return fmt.Errorf("原安装文件 %s 已被修改，未执行升级", name)
			}
			if e = os.WriteFile(filepath.Join(backup, name), b, 0600); e != nil {
				return e
			}
		}
		b, _ := json.Marshal(previous)
		if e = os.WriteFile(filepath.Join(backup, Marker), b, 0600); e != nil {
			return e
		}
	}
	changed := []string{}
	token := make([]byte, 16)
	if _, e = rand.Read(token); e != nil {
		return e
	}
	pendingData := []byte(previous.Version + "\n" + version + "\n" + hex.EncodeToString(token))
	if oldErr == nil {
		if e = os.WriteFile(filepath.Join(absolute, ".pending-health"), pendingData, 0600); e != nil {
			return e
		}
	}
	rollback := func() {
		for _, name := range changed {
			dst := filepath.Join(absolute, name)
			if oldErr == nil {
				if b, e := os.ReadFile(filepath.Join(backup, name)); e == nil {
					_ = os.WriteFile(dst, b, 0600)
					continue
				}
			}
			_ = os.Remove(dst)
		}
		_ = os.Remove(filepath.Join(absolute, ".pending-health"))
	}
	for name := range state.Files {
		dst := filepath.Join(absolute, name)
		if e = replaceInstalledFile(filepath.Join(staging, name), dst); e != nil {
			rollback()
			return fmt.Errorf("无法替换 %s，请关闭正在运行的程序后重试：%w", name, e)
		}
		changed = append(changed, name)
	}
	b, _ := json.Marshal(state)
	if e = os.WriteFile(filepath.Join(absolute, Marker), b, 0600); e != nil {
		rollback()
		return e
	}
	if oldErr == nil {
		if e = os.WriteFile(filepath.Join(absolute, ".pending-health"), pendingData, 0600); e != nil {
			return e
		}
	}
	return nil
}
func Rollback(dir string) error {
	backup := filepath.Join(dir, ".previous")
	state, e := ReadState(backup)
	if e != nil {
		return e
	}
	for name, hash := range state.Files {
		if !safeName(name) || strings.Contains(name, "/") {
			return fmt.Errorf("回退清单路径无效")
		}
		b, e := os.ReadFile(filepath.Join(backup, name))
		if e != nil {
			return e
		}
		sum := sha256.Sum256(b)
		if hex.EncodeToString(sum[:]) != hash {
			return fmt.Errorf("旧版本备份已损坏")
		}
		if e = os.WriteFile(filepath.Join(dir, name), b, 0600); e != nil {
			return e
		}
	}
	b, _ := json.Marshal(state)
	if e = os.WriteFile(filepath.Join(dir, Marker), b, 0600); e != nil {
		return e
	}
	_ = os.Remove(filepath.Join(dir, ".pending-health"))
	return nil
}
func Uninstall(dir string) error {
	if e := CheckRemovable(dir); e != nil {
		return e
	}
	state, e := ReadState(dir)
	if e != nil {
		return fmt.Errorf("找不到有效的安装标记，未删除任何文件")
	}
	for name := range state.Files {
		if !safeName(name) || strings.Contains(name, "/") {
			return fmt.Errorf("安装标记路径异常")
		}
	}
	for name := range state.Files {
		if e = os.Remove(filepath.Join(dir, name)); e != nil && !os.IsNotExist(e) {
			return e
		}
	}
	_ = os.Remove(filepath.Join(dir, Marker))
	_ = os.Remove(filepath.Join(dir, ".pending-health"))
	_ = os.Remove(filepath.Join(dir, ".health"))
	_ = os.Remove(filepath.Join(dir, ".failed-version"))
	if previous, e := ReadState(filepath.Join(dir, ".previous")); e == nil {
		for name := range previous.Files {
			if safeName(name) && !strings.Contains(name, "/") {
				_ = os.Remove(filepath.Join(dir, ".previous", name))
			}
		}
		_ = os.Remove(filepath.Join(dir, ".previous", Marker))
		_ = os.Remove(filepath.Join(dir, ".previous"))
	}
	_ = os.Remove(dir)
	return nil
}

func CheckRemovable(dir string) error {
	state, e := ReadState(dir)
	if e != nil {
		return e
	}
	for name := range state.Files {
		if !safeName(name) || strings.Contains(name, "/") {
			return fmt.Errorf("安装清单路径无效")
		}
		f, e := os.OpenFile(filepath.Join(dir, name), os.O_RDWR, 0)
		if os.IsNotExist(e) {
			continue
		}
		if e != nil {
			return fmt.Errorf("程序或文件仍被占用，请先关闭公文整理后重试")
		}
		f.Close()
	}
	return nil
}
