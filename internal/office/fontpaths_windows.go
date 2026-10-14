//go:build windows

package office

import (
	"golang.org/x/sys/windows/registry"
	"os"
	"path/filepath"
	"strings"
)

func extraFontPaths(role string) []string {
	var paths []string
	for _, base := range []registry.Key{registry.CURRENT_USER, registry.LOCAL_MACHINE} {
		key, e := registry.OpenKey(base, `Software\Microsoft\Windows NT\CurrentVersion\Fonts`, registry.QUERY_VALUE)
		if e != nil {
			continue
		}
		names, _ := key.ReadValueNames(-1)
		for _, name := range names {
			match := strings.Contains(name, role)
			if role == "方正小标宋简体" {
				match = strings.Contains(name, "方正小标宋简体")
			}
			if !match {
				continue
			}
			file, _, e := key.GetStringValue(name)
			if e != nil {
				continue
			}
			if !filepath.IsAbs(file) {
				if base == registry.CURRENT_USER {
					file = filepath.Join(os.Getenv("LOCALAPPDATA"), "Microsoft", "Windows", "Fonts", file)
				} else {
					file = filepath.Join(os.Getenv("WINDIR"), "Fonts", file)
				}
			}
			paths = append(paths, file)
		}
		key.Close()
	}
	return paths
}
