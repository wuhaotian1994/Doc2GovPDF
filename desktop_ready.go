//go:build !uitest && !upgradeprobe

package main

import "context"

func (a *App) domReady(context.Context) {}
func (a *App) startupProbe()            {}
