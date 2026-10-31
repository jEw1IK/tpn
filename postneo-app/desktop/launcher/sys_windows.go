//go:build windows

package main

import (
	"encoding/base64"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"unicode/utf16"
	"unsafe"
)

const createNoWindow = 0x08000000

func stopServer(p *os.Process) { _ = p.Kill() }

func hideWindow(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
}

var (
	user32         = syscall.NewLazyDLL("user32.dll")
	procMessageBox = user32.NewProc("MessageBoxW")
)

func fail(err error) {
	text, _ := syscall.UTF16PtrFromString(err.Error())
	title, _ := syscall.UTF16PtrFromString(appTitle)
	procMessageBox.Call(0, uintptr(unsafe.Pointer(text)), uintptr(unsafe.Pointer(title)), 0x10)
}

func findAppBrowser() string {
	roots := []string{os.Getenv("ProgramFiles(x86)"), os.Getenv("ProgramFiles"), os.Getenv("LOCALAPPDATA")}
	rel := []string{
		`Microsoft\Edge\Application\msedge.exe`,
		`Google\Chrome\Application\chrome.exe`,
		`Chromium\Application\chrome.exe`,
		`Yandex\YandexBrowser\Application\browser.exe`,
	}
	for _, r := range rel {
		for _, root := range roots {
			if root == "" {
				continue
			}
			p := filepath.Join(root, r)
			if _, err := os.Stat(p); err == nil {
				return p
			}
		}
	}
	return ""
}

func openDefaultBrowser(url string) error {
	cmd := exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	hideWindow(cmd)
	return cmd.Start()
}

// ensureShortcut один раз кладёт ярлык «POSTNEO Карточки» на рабочий стол пользователя.
func ensureShortcut(exe, base, data string) {
	marker := filepath.Join(data, "shortcut-v1")
	if _, err := os.Stat(marker); err == nil {
		return
	}
	script := `$d=[Environment]::GetFolderPath('Desktop'); if(-not $d){exit 0}
$s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $d 'POSTNEO Карточки.lnk'))
$s.TargetPath='` + exe + `'
$s.WorkingDirectory='` + base + `'
$s.IconLocation='` + exe + `,0'
$s.Description='База пациентов и лист назначений отделения'
$s.Save()`
	u := utf16.Encode([]rune(script))
	b := make([]byte, len(u)*2)
	for i, c := range u {
		b[2*i] = byte(c)
		b[2*i+1] = byte(c >> 8)
	}
	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", base64.StdEncoding.EncodeToString(b))
	hideWindow(cmd)
	if cmd.Run() == nil {
		_ = os.WriteFile(marker, []byte("ok"), 0o644)
	}
}
