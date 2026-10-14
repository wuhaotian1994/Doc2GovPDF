//go:build windows

package desktopintegration

import (
	"fmt"
	"golang.org/x/sys/windows/registry"
	"os"
	"testing"
	"time"
)

func TestSystemRegistration(t *testing.T) {
	if os.Getenv("DOC2GOVPDF_SYSTEM_TEST") != "1" {
		t.Skip("opt-in temporary system integration")
	}
	id := fmt.Sprintf("Doc2GovPDF-Test-%d", time.Now().UnixNano())
	dir := t.TempDir()
	defer Unregister(dir, id)
	if e := Register(dir, "0.2.0", id); e != nil {
		t.Fatal(e)
	}
	k, e := registry.OpenKey(registry.CURRENT_USER, keyName(id), registry.QUERY_VALUE)
	if e != nil {
		t.Fatal(e)
	}
	location, _, e := k.GetStringValue("InstallLocation")
	k.Close()
	if e != nil || location != dir {
		t.Fatal("incorrect uninstall registration")
	}
	if e = Unregister(dir, id); e != nil {
		t.Fatal(e)
	}
	if k, e := registry.OpenKey(registry.CURRENT_USER, keyName(id), registry.QUERY_VALUE); e == nil {
		k.Close()
		t.Fatal("uninstall key remained")
	}
}
