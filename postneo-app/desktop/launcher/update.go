// Автообновление: лаунчер спрашивает у сервера раздачи версию приложения, в фоне скачивает архив папки app/,
// проверяет контрольную сумму и раскладывает в app.next; подмена происходит при следующем запуске, когда сервер не работает.
package main

import (
	"archive/zip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Сначала HTTPS по IP: больничный фильтр режет открытый HTTP к адресу, а TLS без имени пропускает. HTTP остаётся запасным.
var defaultUpdateURLs = []string{"https://89.169.32.9/download/kart-version.json", "http://89.169.32.9/download/kart-version.json"}

type versionInfo struct {
	Commit    string `json:"commit"`
	AppURL    string `json:"app_url"`
	SHA256    string `json:"sha256"`
	Size      int64  `json:"size"`
	Built     string `json:"built"`
	ExeURL    string `json:"exe_url"`
	ExeSHA256 string `json:"exe_sha256"`
	ExeSize   int64  `json:"exe_size"`
}

func fileSHA256(p string) string {
	f, err := os.Open(p)
	if err != nil {
		return ""
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return ""
	}
	return hex.EncodeToString(h.Sum(nil))
}

// applyPendingExe: рядом лежит скачанный новый лаунчер (<exe>.new) — текущий переименовывается в .old,
// новый встаёт на его место и запускается. Работающий exe в Windows переименовать можно, удалить нельзя.
func applyPendingExe(exe, data string) bool {
	next := exe + ".new"
	if !fileExists(next) {
		return false
	}
	old := exe + ".old"
	_ = os.Remove(old)
	if err := os.Rename(exe, old); err != nil {
		ulog(data, "не удалось отложить текущий лаунчер: %v", err)
		return false
	}
	if err := os.Rename(next, exe); err != nil {
		_ = os.Rename(old, exe)
		ulog(data, "не удалось поставить новый лаунчер: %v", err)
		return false
	}
	ulog(data, "лаунчер обновлён")
	if err := relaunch(exe); err != nil {
		ulog(data, "новый лаунчер не запустился: %v, возвращаю старый", err)
		_ = os.Rename(exe, next)
		_ = os.Rename(old, exe)
		return false
	}
	return true
}

// updateExe качает новый лаунчер, если его контрольная сумма отличается от текущей.
func updateExe(base, data, baseURL string, v versionInfo) {
	if v.ExeURL == "" || len(v.ExeSHA256) != 64 {
		return
	}
	exe, err := os.Executable()
	if err != nil {
		return
	}
	_ = os.Remove(exe + ".old")
	if strings.EqualFold(fileSHA256(exe), v.ExeSHA256) || strings.EqualFold(fileSHA256(exe+".new"), v.ExeSHA256) {
		return
	}
	url := v.ExeURL
	if !strings.HasPrefix(url, "http") {
		url = baseURL + url
	}
	tmp := exe + ".download"
	if err := download(url, tmp, v.ExeSHA256, v.ExeSize); err != nil {
		ulog(data, "лаунчер: загрузка не удалась: %v", err)
		_ = os.Remove(tmp)
		return
	}
	if err := os.Rename(tmp, exe+".new"); err != nil {
		_ = os.Remove(tmp)
		return
	}
	ulog(data, "новый лаунчер скачан, встанет при следующем запуске")
}

func updateURLs(base string) []string {
	if u := strings.TrimSpace(os.Getenv("POSTNEO_UPDATE_URL")); u != "" {
		return []string{u}
	}
	if b, err := os.ReadFile(filepath.Join(base, "update-url.txt")); err == nil {
		var out []string
		for _, line := range strings.Split(string(b), "\n") {
			if u := strings.TrimSpace(line); u != "" {
				out = append(out, u)
			}
		}
		if len(out) > 0 {
			return out
		}
	}
	return defaultUpdateURLs
}

// fetchVersion пробует адреса по очереди и возвращает первый ответивший.
func fetchVersion(base string) (versionInfo, string, bool) {
	client := http.Client{Timeout: 15 * time.Second}
	for _, url := range updateURLs(base) {
		if url == "off" {
			return versionInfo{}, "", false
		}
		resp, err := client.Get(url)
		if err != nil {
			continue
		}
		var v versionInfo
		ok := resp.StatusCode == 200 && json.NewDecoder(io.LimitReader(resp.Body, 1<<16)).Decode(&v) == nil && v.Commit != "" && v.AppURL != "" && len(v.SHA256) == 64
		resp.Body.Close()
		if ok {
			return v, url, true
		}
	}
	return versionInfo{}, "", false
}

func readCommit(dir string) string {
	b, err := os.ReadFile(filepath.Join(dir, "COMMIT"))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(b))
}

func ulog(data string, format string, a ...any) {
	f, err := os.OpenFile(filepath.Join(data, "logs", "update.log"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return
	}
	defer f.Close()
	fmt.Fprintf(f, time.Now().Format("2006-01-02 15:04:05")+" "+format+"\n", a...)
}

// applyPendingUpdate подменяет app/ на app.next/, если скачанное обновление готово. Вызывается, пока сервер не запущен.
func applyPendingUpdate(base, data string) {
	next := filepath.Join(base, "app.next")
	cur := filepath.Join(base, "app")
	old := filepath.Join(base, "app.old")
	nc := readCommit(next)
	if nc == "" {
		return
	}
	if nc == readCommit(cur) {
		_ = os.RemoveAll(next)
		return
	}
	if _, err := os.Stat(filepath.Join(next, "server.js")); err != nil {
		ulog(data, "app.next без server.js, удаляю")
		_ = os.RemoveAll(next)
		return
	}
	_ = os.RemoveAll(old)
	if err := os.Rename(cur, old); err != nil {
		ulog(data, "не удалось отложить текущую версию: %v", err)
		return
	}
	if err := os.Rename(next, cur); err != nil {
		ulog(data, "не удалось поставить новую версию: %v, возвращаю старую", err)
		_ = os.Rename(old, cur)
		return
	}
	ulog(data, "обновление применено: %s → %s", readCommit(old), nc)
}

// rollbackUpdate возвращает app.old, если новая версия не запустилась.
func rollbackUpdate(base, data string) bool {
	cur := filepath.Join(base, "app")
	old := filepath.Join(base, "app.old")
	if _, err := os.Stat(filepath.Join(old, "server.js")); err != nil {
		return false
	}
	bad := filepath.Join(base, "app.bad")
	_ = os.RemoveAll(bad)
	if err := os.Rename(cur, bad); err != nil {
		return false
	}
	if err := os.Rename(old, cur); err != nil {
		_ = os.Rename(bad, cur)
		return false
	}
	ulog(data, "новая версия %s не запустилась, вернул %s", readCommit(bad), readCommit(cur))
	return true
}

// checkForUpdate работает в фоне: без интернета молча выходит.
func checkForUpdate(base, data string) {
	defer func() { _ = recover() }()
	v, url, ok := fetchVersion(base)
	if !ok {
		return
	}
	baseURL := url[:strings.LastIndex(url, "/")+1]
	updateExe(base, data, baseURL, v)
	cur := readCommit(filepath.Join(base, "app"))
	next := filepath.Join(base, "app.next")
	if v.Commit == cur || v.Commit == readCommit(next) {
		return
	}
	// относительная ссылка считается от адреса version.json
	appURL := v.AppURL
	if !strings.HasPrefix(appURL, "http") {
		appURL = baseURL + appURL
	}
	ulog(data, "доступна версия %s (сейчас %s), качаю %s", v.Commit, cur, appURL)
	tmpZip := filepath.Join(base, "app.next.zip")
	if err := download(appURL, tmpZip, v.SHA256, v.Size); err != nil {
		ulog(data, "загрузка не удалась: %v", err)
		_ = os.Remove(tmpZip)
		return
	}
	tmpDir := filepath.Join(base, "app.next.tmp")
	_ = os.RemoveAll(tmpDir)
	if err := unzipTo(tmpZip, tmpDir); err != nil {
		ulog(data, "распаковка не удалась: %v", err)
		_ = os.RemoveAll(tmpDir)
		_ = os.Remove(tmpZip)
		return
	}
	_ = os.Remove(tmpZip)
	if readCommit(tmpDir) != v.Commit {
		ulog(data, "в архиве версия %q, ожидалась %s", readCommit(tmpDir), v.Commit)
		_ = os.RemoveAll(tmpDir)
		return
	}
	_ = os.RemoveAll(next)
	if err := os.Rename(tmpDir, next); err != nil {
		ulog(data, "не удалось подготовить app.next: %v", err)
		return
	}
	ulog(data, "версия %s готова, встанет при следующем запуске", v.Commit)
}

func download(url, dest, wantSHA string, wantSize int64) error {
	client := http.Client{Timeout: 10 * time.Minute}
	resp, err := client.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	f, err := os.Create(dest)
	if err != nil {
		return err
	}
	h := sha256.New()
	n, err := io.Copy(io.MultiWriter(f, h), io.LimitReader(resp.Body, 512<<20))
	f.Close()
	if err != nil {
		return err
	}
	if wantSize > 0 && n != wantSize {
		return fmt.Errorf("размер %d, ожидался %d", n, wantSize)
	}
	if got := hex.EncodeToString(h.Sum(nil)); !strings.EqualFold(got, wantSHA) {
		return fmt.Errorf("контрольная сумма не совпала")
	}
	return nil
}

func unzipTo(zipPath, dir string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer r.Close()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	root, _ := filepath.Abs(dir)
	for _, f := range r.File {
		name := filepath.FromSlash(f.Name)
		p := filepath.Join(dir, name)
		if abs, _ := filepath.Abs(p); !strings.HasPrefix(abs, root+string(os.PathSeparator)) && abs != root {
			return fmt.Errorf("подозрительный путь в архиве: %s", f.Name)
		}
		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(p, 0o755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		out, err := os.OpenFile(p, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, f.Mode()|0o600)
		if err != nil {
			rc.Close()
			return err
		}
		_, err = io.Copy(out, rc)
		out.Close()
		rc.Close()
		if err != nil {
			return err
		}
	}
	return nil
}
