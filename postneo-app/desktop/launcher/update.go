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

const defaultUpdateURL = "http://89.169.32.9/download/kart-version.json"

type versionInfo struct {
	Commit string `json:"commit"`
	AppURL string `json:"app_url"`
	SHA256 string `json:"sha256"`
	Size   int64  `json:"size"`
	Built  string `json:"built"`
}

func updateURL(base string) string {
	if u := strings.TrimSpace(os.Getenv("POSTNEO_UPDATE_URL")); u != "" {
		return u
	}
	if b, err := os.ReadFile(filepath.Join(base, "update-url.txt")); err == nil {
		if u := strings.TrimSpace(string(b)); u != "" {
			return u
		}
	}
	return defaultUpdateURL
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
	url := updateURL(base)
	if url == "off" {
		return
	}
	client := http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return
	}
	var v versionInfo
	if json.NewDecoder(io.LimitReader(resp.Body, 1<<16)).Decode(&v) != nil || v.Commit == "" || v.AppURL == "" || len(v.SHA256) != 64 {
		return
	}
	cur := readCommit(filepath.Join(base, "app"))
	next := filepath.Join(base, "app.next")
	if v.Commit == cur || v.Commit == readCommit(next) {
		return
	}
	// относительная ссылка считается от адреса version.json
	appURL := v.AppURL
	if !strings.HasPrefix(appURL, "http") {
		appURL = url[:strings.LastIndex(url, "/")+1] + appURL
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
