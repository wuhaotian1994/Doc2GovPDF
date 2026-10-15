package install

import (
	"errors"
	"os"
	"runtime"
	"syscall"
	"time"
)

// Windows can briefly retain an image mapping after its process exits. Keep
// the existing file intact and retry the atomic replacement for a bounded time.
func replaceInstalledFile(source, destination string) error {
	deadline := time.Now().Add(5 * time.Second)
	for {
		err := os.Rename(source, destination)
		if err == nil {
			return nil
		}
		transient := runtime.GOOS == "windows" && (errors.Is(err, syscall.Errno(5)) || errors.Is(err, syscall.Errno(32)) || errors.Is(err, syscall.Errno(33)))
		if !transient || time.Now().After(deadline) {
			return err
		}
		time.Sleep(100 * time.Millisecond)
	}
}
