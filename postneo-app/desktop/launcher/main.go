// POSTNEO Карточки — лаунчер для рабочего места: поднимает локальный сервер на node и открывает окно браузера.
// Рядом с exe лежат папки node/ (node.exe) и app/ (standalone-сборка). Данные пациентов — в папке пользователя.
package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

const appTitle = "POSTNEO Карточки"

func main() {
	if err := run(); err != nil {
		fail(err)
		os.Exit(1)
	}
}

func run() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	base := filepath.Dir(exe)
	nodeExe := filepath.Join(base, "node", nodeBinary())
	appDir := filepath.Join(base, "app")
	for _, p := range []string{nodeExe, filepath.Join(appDir, "server.js"), filepath.Join(appDir, "desktop-server.cjs")} {
		if _, err := os.Stat(p); err != nil {
			return fmt.Errorf("рядом с программой нет файла\n%s\n\nРаспакуйте архив целиком, не копируйте один exe.", p)
		}
	}
	data := dataDir()
	if err := os.MkdirAll(filepath.Join(data, "logs"), 0o755); err != nil {
		return fmt.Errorf("не удалось создать папку данных %s: %v", data, err)
	}
	noShortcut := false
	for _, a := range os.Args[1:] {
		if a == "--no-shortcut" {
			noShortcut = true
		}
	}
	if !noShortcut {
		ensureShortcut(exe, base, data)
	}

	// Сервер уже работает (окно закрыли меньше полутора минут назад или открыли второй раз) — просто показываем окно.
	if port, ok := runningPort(data); ok && healthy(port) {
		go checkForUpdate(base, data)
		return openWindow(port, data, nil)
	}
	// Сервер не запущен: безопасный момент подменить папку приложения, если обновление уже скачано.
	applyPendingUpdate(base, data)
	for attempt := 0; ; attempt++ {
		err := startAndOpen(base, data, nodeExe, appDir)
		if err != nil && attempt == 0 && rollbackUpdate(base, data) {
			continue
		}
		return err
	}
}

func startAndOpen(base, data, nodeExe, appDir string) error {

	port, err := freePort()
	if err != nil {
		return err
	}
	logPath := filepath.Join(data, "logs", "server.log")
	rotate(logPath)
	logf, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return err
	}
	defer logf.Close()

	cmd := exec.Command(nodeExe, "--disable-warning=ExperimentalWarning", filepath.Join(appDir, "desktop-server.cjs"))
	cmd.Dir = appDir
	cmd.Env = append(os.Environ(),
		"PORT="+strconv.Itoa(port),
		"HOSTNAME=127.0.0.1",
		"DATA_DIR="+data,
		"NODE_ENV=production",
		"NEXT_TELEMETRY_DISABLED=1",
	)
	cmd.Stdout = logf
	cmd.Stderr = logf
	hideWindow(cmd)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("не удалось запустить node:\n%v", err)
	}
	exited := make(chan error, 1)
	go func() { exited <- cmd.Wait() }()

	deadline := time.Now().Add(60 * time.Second)
	for !healthy(port) {
		select {
		case err := <-exited:
			return fmt.Errorf("сервер завершился при запуске (%v).\nПодробности: %s\n\n%s", err, logPath, tail(logPath, 12))
		case <-time.After(300 * time.Millisecond):
		}
		if time.Now().After(deadline) {
			_ = cmd.Process.Kill()
			return fmt.Errorf("сервер не ответил за 60 секунд.\nПодробности: %s\n\n%s", logPath, tail(logPath, 12))
		}
	}
	go checkForUpdate(base, data)
	return openWindow(port, data, cmd.Process)
}

func nodeBinary() string {
	if runtime.GOOS == "windows" {
		return "node.exe"
	}
	return "node"
}

func dataDir() string {
	if d := os.Getenv("POSTNEO_DATA_DIR"); d != "" {
		return d
	}
	home, _ := os.UserHomeDir()
	switch runtime.GOOS {
	case "windows":
		local := os.Getenv("LOCALAPPDATA")
		if local == "" {
			local = filepath.Join(home, "AppData", "Local")
		}
		return filepath.Join(local, "POSTNEO", "kart")
	case "darwin":
		return filepath.Join(home, "Library", "Application Support", "POSTNEO", "kart")
	default:
		if x := os.Getenv("XDG_DATA_HOME"); x != "" {
			return filepath.Join(x, "postneo", "kart")
		}
		return filepath.Join(home, ".local", "share", "postneo", "kart")
	}
}

func runningPort(data string) (int, bool) {
	b, err := os.ReadFile(filepath.Join(data, "run.json"))
	if err != nil {
		return 0, false
	}
	var r struct {
		Port int `json:"port"`
	}
	if json.Unmarshal(b, &r) != nil || r.Port == 0 {
		return 0, false
	}
	return r.Port, true
}

func healthy(port int) bool {
	c := http.Client{Timeout: 1500 * time.Millisecond}
	resp, err := c.Get(fmt.Sprintf("http://127.0.0.1:%d/api/health", port))
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == 200
}

func freePort() (int, error) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port, nil
}

func rotate(p string) {
	if st, err := os.Stat(p); err == nil && st.Size() > 5<<20 {
		_ = os.Rename(p, p+".1")
	}
}

func tail(p string, n int) string {
	b, err := os.ReadFile(p)
	if err != nil {
		return ""
	}
	lines := strings.Split(strings.TrimRight(string(b), "\r\n"), "\n")
	if len(lines) > n {
		lines = lines[len(lines)-n:]
	}
	return strings.Join(lines, "\n")
}

// openWindow показывает приложение в окне без адресной строки (Edge или Chrome в режиме --app).
// Когда это окно закрывают, сервер, который запустил этот лаунчер, останавливается сразу.
// Без Edge и Chrome открывается браузер по умолчанию, а сервер сам выключится через полторы минуты после закрытия вкладки.
func openWindow(port int, data string, server *os.Process) error {
	url := fmt.Sprintf("http://127.0.0.1:%d/", port)
	if browser := findAppBrowser(); browser != "" {
		profile := filepath.Join(data, "window")
		cmd := exec.Command(browser,
			"--app="+url,
			"--user-data-dir="+profile,
			"--no-first-run",
			"--no-default-browser-check",
			"--disable-features=Translate,msEdgeSidebar",
			"--window-size=1440,920",
		)
		hideWindow(cmd)
		err := cmd.Run()
		if server != nil {
			stopServer(server)
			_ = os.Remove(filepath.Join(data, "run.json"))
		}
		if err != nil && !errors.Is(err, exec.ErrNotFound) {
			var ee *exec.ExitError
			if !errors.As(err, &ee) {
				return fmt.Errorf("не удалось открыть окно: %v", err)
			}
		}
		return nil
	}
	return openDefaultBrowser(url)
}
