//go:build !windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"time"
)

func hideWindow(cmd *exec.Cmd) {}

// stopServer: мягко через SIGTERM, чтобы сервер убрал run.json, через 3 с — принудительно.
func stopServer(p *os.Process) {
	_ = p.Signal(syscall.SIGTERM)
	done := make(chan struct{})
	go func() { _, _ = p.Wait(); close(done) }()
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		_ = p.Kill()
	}
}

func fail(err error) { fmt.Fprintln(os.Stderr, appTitle+": "+err.Error()) }

func findAppBrowser() string {
	if p := os.Getenv("POSTNEO_BROWSER"); p != "" {
		return p
	}
	for _, name := range []string{"microsoft-edge", "google-chrome", "chromium", "chromium-browser"} {
		if p, err := exec.LookPath(name); err == nil {
			return p
		}
	}
	return ""
}

func openDefaultBrowser(url string) error {
	if _, err := exec.LookPath("xdg-open"); err == nil {
		return exec.Command("xdg-open", url).Start()
	}
	fmt.Println("откройте в браузере:", url)
	return nil
}

func ensureShortcut(exe, base, data string) { _ = filepath.Join }
