#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Собирает безопасную выжимку по проекту бота, чтобы её можно было прислать.

Запусти в папке с ботом:

    python collect.py

Рядом появится bot-summary.txt — структура проекта, зависимости и точки входа.
Токены, пароли и ключи вырезаются автоматически. Перед отправкой всё равно
пробеги файл глазами: он маленький и читаемый специально для этого.
"""
from __future__ import annotations

import os
import re
import sys

SKIP_DIRS = {
    ".git", ".venv", "venv", "env", "__pycache__", "node_modules",
    ".idea", ".vscode", ".mypy_cache", ".pytest_cache", "site-packages",
    "dist", "build", ".ruff_cache", ".eggs",
}
SKIP_EXT = {
    ".pyc", ".pyo", ".so", ".dll", ".exe", ".zip", ".tar", ".gz", ".7z",
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".mp3", ".mp4",
    ".db", ".sqlite", ".sqlite3", ".log",
}
ENTRY_NAMES = {
    "main.py", "bot.py", "app.py", "run.py", "__main__.py", "start.py",
    "handlers.py", "config.py", "settings.py",
}
DEP_FILES = {
    "requirements.txt", "pyproject.toml", "Pipfile", "poetry.lock",
    "package.json", "requirements-dev.txt",
}

# Всё, что похоже на секрет, заменяем заглушкой.
SECRET_PATTERNS = [
    (re.compile(r"\b\d{8,10}:[A-Za-z0-9_-]{30,}\b"), "<ТОКЕН-БОТА-ВЫРЕЗАН>"),
    (re.compile(r"""(?i)\b(token|api_key|apikey|secret|password|passwd|pwd|
                     bot_token|access_key|private_key|dsn|webhook_url)\b
                     (\s*[:=]\s*)(['"]?)([^\s'"#,)]{6,})(['"]?)""", re.X),
     lambda m: f"{m.group(1)}{m.group(2)}{m.group(3)}<ВЫРЕЗАНО>{m.group(5)}"),
    (re.compile(r"(?i)\b(postgres|postgresql|mysql|mongodb|redis|amqp)://[^\s'\"]+"),
     r"\1://<ВЫРЕЗАНО>"),
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----",
                re.S), "<ПРИВАТНЫЙ-КЛЮЧ-ВЫРЕЗАН>"),
]

MAX_FILE_CHARS = 12000


def redact(text: str) -> str:
    for pattern, repl in SECRET_PATTERNS:
        text = pattern.sub(repl, text)
    return text


def walk(root: str):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames
                             if d not in SKIP_DIRS and not d.startswith("."))
        yield dirpath, sorted(filenames)


def tree(root: str) -> list[str]:
    lines, total, skipped = [], 0, 0
    for dirpath, filenames in walk(root):
        rel = os.path.relpath(dirpath, root)
        depth = 0 if rel == "." else rel.count(os.sep) + 1
        if rel != ".":
            lines.append("  " * (depth - 1) + os.path.basename(dirpath) + "/")
        for name in filenames:
            ext = os.path.splitext(name)[1].lower()
            if ext in SKIP_EXT or name.startswith("."):
                skipped += 1
                continue
            try:
                size = os.path.getsize(os.path.join(dirpath, name))
            except OSError:
                continue
            total += 1
            lines.append("  " * depth + f"{name}  ({size / 1024:.1f} КБ)")
    lines.append("")
    lines.append(f"Всего файлов: {total} (пропущено бинарных и скрытых: {skipped})")
    return lines


def collect_files(root: str) -> list[tuple[str, str]]:
    out = []
    for dirpath, filenames in walk(root):
        for name in filenames:
            if name not in ENTRY_NAMES and name not in DEP_FILES:
                continue
            path = os.path.join(dirpath, name)
            try:
                with open(path, encoding="utf-8", errors="replace") as f:
                    body = f.read()
            except OSError as e:
                body = f"<не удалось прочитать: {e}>"
            if len(body) > MAX_FILE_CHARS:
                body = body[:MAX_FILE_CHARS] + f"\n\n… обрезано, всего {len(body)} символов"
            out.append((os.path.relpath(path, root), redact(body)))
    return out


def main() -> None:
    root = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")
    parts = [
        "СТРУКТУРА ПРОЕКТА",
        "=" * 60,
        f"Корень: {os.path.basename(root)}",
        "",
        *tree(root),
        "",
    ]

    files = collect_files(root)
    if files:
        parts += ["", "КЛЮЧЕВЫЕ ФАЙЛЫ", "=" * 60, ""]
        for rel, body in files:
            parts += [f"--- {rel} " + "-" * max(0, 56 - len(rel)), "", body, ""]
    else:
        parts += ["Не нашёл ни main.py/bot.py, ни requirements.txt — "
                  "видимо, файлы называются иначе. Пришли их вручную."]

    text = "\n".join(parts)
    dest = os.path.join(root, "bot-summary.txt")
    with open(dest, "w", encoding="utf-8") as f:
        f.write(text)

    print(f"Готово: {dest}")
    print(f"Размер: {len(text) / 1024:.1f} КБ, файлов включено: {len(files)}")
    print("\nПробеги глазами и пришли — секреты уже вырезаны, но лишняя проверка не помешает.")


if __name__ == "__main__":
    main()
