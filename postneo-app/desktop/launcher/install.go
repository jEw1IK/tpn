// Первый запуск с сетевого диска, флешки или папки загрузок: программа копируется в локальную папку пользователя
// (%LOCALAPPDATA%\POSTNEO\program) и запускается оттуда. Node читает тысячи файлов при старте, по сети это минуты,
// а в локальную папку есть права на запись для автообновления.
package main

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// programDir — постоянное место программы на этом компьютере.
func programDir() string {
	if d := os.Getenv("POSTNEO_PROGRAM_DIR"); d != "" {
		return d
	}
	return filepath.Join(filepath.Dir(dataDir()), "program")
}

// ensureLocalInstall возвращает путь к exe, который надо запустить вместо текущего, если программа ещё не локальна.
func ensureLocalInstall(exe, base, data string) (string, bool) {
	if os.Getenv("POSTNEO_PORTABLE") == "1" {
		return "", false
	}
	target := programDir()
	if samePath(base, target) {
		return "", false
	}
	// переносим только то, что лежит не на локальном диске или в папке загрузок/архиве; локальную папку вроде C:\POSTNEO не трогаем
	if !shouldRelocate(base) {
		return "", false
	}
	want := readCommit(filepath.Join(base, "app"))
	have := readCommit(filepath.Join(target, "app"))
	targetExe := filepath.Join(target, filepath.Base(exe))
	nodeOK := fileExists(filepath.Join(target, "node", nodeBinary()))
	if have != "" && nodeOK && fileExists(targetExe) && (have == want || readCommit(filepath.Join(target, "app.next")) == want) {
		return targetExe, true
	}
	notify(fmt.Sprintf("Первый запуск: программа копируется в папку пользователя\n%s\n\nЭто займёт около минуты, окно откроется само.", target))
	if err := os.MkdirAll(target, 0o755); err != nil {
		ulog(data, "не удалось создать %s: %v", target, err)
		return "", false
	}
	if !nodeOK {
		if err := copyTree(filepath.Join(base, "node"), filepath.Join(target, "node")); err != nil {
			ulog(data, "копирование node не удалось: %v", err)
			return "", false
		}
	}
	if have == "" {
		if err := copyTree(filepath.Join(base, "app"), filepath.Join(target, "app")); err != nil {
			ulog(data, "копирование app не удалось: %v", err)
			return "", false
		}
	} else if have != want {
		// другая версия уже стоит: кладём новую рядом, подмена пройдёт обычным путём обновления
		stage := filepath.Join(target, "app.next")
		_ = os.RemoveAll(stage)
		if err := copyTree(filepath.Join(base, "app"), stage); err != nil {
			ulog(data, "копирование новой версии не удалось: %v", err)
		}
	}
	for _, name := range []string{filepath.Base(exe), "README.txt", "update-url.txt"} {
		src := filepath.Join(base, name)
		if fileExists(src) {
			_ = copyFile(src, filepath.Join(target, name))
		}
	}
	ulog(data, "программа скопирована из %s в %s", base, target)
	return targetExe, true
}

func shouldRelocate(base string) bool {
	if isRemotePath(base) {
		return true
	}
	low := strings.ToLower(base)
	for _, marker := range []string{"\\downloads\\", "\\загрузки\\", "\\desktop\\", "\\рабочий стол\\", "\\temp\\", "\\tmp\\", "\\onedrive\\", "/downloads/", "/tmp/"} {
		if strings.Contains(low, marker) {
			return true
		}
	}
	return false
}

func samePath(a, b string) bool {
	aa, _ := filepath.Abs(a)
	bb, _ := filepath.Abs(b)
	return strings.EqualFold(filepath.Clean(aa), filepath.Clean(bb))
}

func fileExists(p string) bool { _, err := os.Stat(p); return err == nil }

func copyTree(src, dst string) error {
	tmp := dst + ".copying"
	_ = os.RemoveAll(tmp)
	err := filepath.Walk(src, func(p string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(src, p)
		out := filepath.Join(tmp, rel)
		if info.IsDir() {
			return os.MkdirAll(out, 0o755)
		}
		return copyFile(p, out)
	})
	if err != nil {
		_ = os.RemoveAll(tmp)
		return err
	}
	_ = os.RemoveAll(dst)
	return os.Rename(tmp, dst)
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

// relaunch запускает локальную копию и выходит.
func relaunch(exe string) error {
	cmd := exec.Command(exe, os.Args[1:]...)
	cmd.Dir = filepath.Dir(exe)
	return cmd.Start()
}
