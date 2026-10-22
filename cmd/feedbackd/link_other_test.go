//go:build !windows

package main

import "os"

func linkDirectory(source, target string) error { return os.Symlink(source, target) }
