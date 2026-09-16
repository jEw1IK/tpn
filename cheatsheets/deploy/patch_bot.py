#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Правит существующего бота под новую версию модуля — аккуратно и с откатом.

    sudo /opt/telegram-bot/.venv/bin/python \
         /opt/telegram-bot/cheatsheets/deploy/patch_bot.py /opt/telegram-bot/bot.py

Что делает:
    1. убирает импорт и подключение bilirubin_router — модуля больше нет,
       без этого бот упадёт на старте;
    2. меняет кнопку «🟡 Билирубин» на кнопку шкал;
    3. подключает scales_router ДО роутера, который ловит свободный текст;
    4. убирает /bili и /ozpk из меню команд и добавляет /scales.

Чего НЕ делает: не трогает тексты справки и не удаляет твои обработчики.
Вместо этого показывает их в конце — чтобы решение принимал человек.

Сначала снимает копию файла. Если после правок Python перестанет
разбирать файл, копия возвращается на место автоматически.
"""
from __future__ import annotations

import argparse
import datetime as dt
import difflib
import os
import py_compile
import re
import shutil
import sys
import tempfile

BILI_BUTTON = "🟡 Билирубин"
SCALES_IMPORT = "from cheatsheets.bot.keyboard import scales_button"
ROUTER_IMPORT = "from cheatsheets.bot.scales_router import scales_router"

RE_IMPORT_BILI = re.compile(r"^\s*(from\s+[\w.]*bilirubin_router\s+import|import\s+[\w.]*bilirubin_router)\b")
RE_INCLUDE_BILI = re.compile(r"^\s*\w+\.include_router\(\s*bilirubin_router\s*\)\s*,?\s*$")
RE_BUTTON = re.compile(r"KeyboardButton\(\s*(?:text\s*=\s*)?[\"']🟡\s*Билирубин[\"']\s*\)")
RE_INCLUDE_ANY = re.compile(r"^(\s*)(\w+)\.include_router\(\s*(\w+)\s*\)")
RE_CMD_DROP = re.compile(r"[\"'](bili|ozpk)[\"']")
RE_CMD_SHPORY = re.compile(r"[\"']shpory[\"']")
RE_TOP_IMPORT = re.compile(r"^(import|from)\s")

# Роутеры, которые ловят свободный текст: scales_router должен идти раньше них,
# иначе нажатие кнопки «Шкалы» уедет в поиск.
GREEDY_ROUTERS = ("kr_router", "search_router", "text_router", "fallback_router")

log: list = []


def note(mark: str, text: str) -> None:
    log.append(f"{mark} {text}")


def patch(lines: list, menu_only: bool = False) -> list:
    out = list(lines)
    if menu_only:
        return patch_menu(out)

    # 1. Импорт и подключение billirubin_router ------------------------------
    kept = []
    for i, line in enumerate(out, 1):
        if RE_IMPORT_BILI.match(line):
            note("✓", f"строка {i}: убран импорт bilirubin_router")
            continue
        if RE_INCLUDE_BILI.match(line):
            note("✓", f"строка {i}: убрано include_router(bilirubin_router)")
            continue
        kept.append(line)
    out = kept

    # 2. Кнопка на клавиатуре ------------------------------------------------
    found_button = False
    for i, line in enumerate(out):
        if RE_BUTTON.search(line):
            out[i] = RE_BUTTON.sub("scales_button()", line)
            found_button = True
            note("✓", f"строка {i + 1}: кнопка «{BILI_BUTTON}» заменена на scales_button()")
    if not found_button:
        where = [i + 1 for i, l in enumerate(out) if BILI_BUTTON in l]
        handlers = [i + 1 for i, l in enumerate(out)
                    if BILI_BUTTON in l and "F.text" in l]
        rest = [n for n in where if n not in handlers]
        if handlers:
            note("·", f"обработчик кнопки остался в строке "
                      f"{', '.join(map(str, handlers))} — он больше не вызывается, "
                      f"кнопки нет; можно удалить руками, можно оставить")
        if rest:
            note("!", f"«{BILI_BUTTON}» встречается в строках "
                      f"{', '.join(map(str, rest))} — посмотри их ниже")
        if not where:
            note("·", "кнопки «Билирубин» в файле нет — возможно, уже убрана")

    # 3. Подключение scales_router -------------------------------------------
    if any("include_router(scales_router)" in l for l in out):
        note("·", "scales_router уже подключён")
    else:
        target = None
        fallback = None
        for i, line in enumerate(out):
            m = RE_INCLUDE_ANY.match(line)
            if not m:
                continue
            indent, dispatcher, router = m.groups()
            if router in GREEDY_ROUTERS and target is None:
                target = (i, indent, dispatcher, router)
            if fallback is None:
                fallback = (i, indent, dispatcher, router)
        spot = target or fallback
        if spot:
            i, indent, dispatcher, router = spot
            out.insert(i, f"{indent}{dispatcher}.include_router(scales_router)\n")
            note("✓", f"строка {i + 1}: добавлен include_router(scales_router) "
                      f"перед {router}")
        else:
            note("!", "не нашёл ни одного include_router — подключи scales_router сам")

    # 4. Импорты --------------------------------------------------------------
    need = [imp for imp in (ROUTER_IMPORT, SCALES_IMPORT)
            if not any(imp in l for l in out)]
    if need:
        last = 0
        for i, line in enumerate(out[:80]):
            if RE_TOP_IMPORT.match(line):
                last = i
        for offset, imp in enumerate(need):
            out.insert(last + 1 + offset, imp + "\n")
            note("✓", f"добавлен импорт: {imp}")

    return patch_menu(out)


def patch_menu(out: list) -> list:
    """Только список команд — пригодится, если он вынесен в отдельный файл."""
    kept, dropped, shpory_line = [], 0, None
    for line in out:
        if RE_CMD_DROP.search(line) and ("BotCommand" in line or line.strip().startswith(("(", "[", '"', "'"))):
            dropped += 1
            continue
        if RE_CMD_SHPORY.search(line) and shpory_line is None and "BotCommand" in line:
            shpory_line = line
        kept.append(line)
    out = kept
    if dropped:
        note("✓", f"из меню команд убрано строк: {dropped} (/bili, /ozpk)")
    else:
        note("·", "в меню команд /bili и /ozpk не найдены")

    if not any('"scales"' in l or "'scales'" in l for l in out) and shpory_line:
        new = shpory_line.replace("shpory", "scales")
        new = re.sub(r'description\s*=\s*(["\']).*?\1',
                     'description="Шкалы: nSOFA, NIPS, N-PASS"', new)
        idx = out.index(shpory_line)
        out.insert(idx + 1, new)
        note("✓", f"строка {idx + 2}: в меню добавлена команда /scales")
    elif not shpory_line:
        note("!", "строку с /shpory в меню не нашёл — команду /scales добавь сам")

    return out


def show_fragments(lines: list) -> None:
    """Печатает места, которые должен посмотреть человек, а не скрипт."""
    marks = []
    for i, line in enumerate(lines, 1):
        low = line.lower()
        if "билирубин" in low or "/bili" in low or "/ozpk" in low or "озпк" in low:
            marks.append(i)
    if not marks:
        print("\nУпоминаний билирубина в файле не осталось.")
        return

    print("\n" + "─" * 60)
    print("ОСТАЛОСЬ В ТЕКСТАХ — это правит человек, не скрипт:")
    print("─" * 60)
    printed = set()
    for n in marks:
        if n in printed:            # этот кусок уже показан соседней меткой
            continue
        lo, hi = max(1, n - 2), min(len(lines), n + 2)
        print()
        for x in range(lo, hi + 1):
            printed.add(x)
            mark = "»" if x in marks else " "
            print(f"{mark}{x:>5}: {lines[x - 1].rstrip()}")


def main() -> int:
    ap = argparse.ArgumentParser(description="Правит bot.py под новую версию модуля")
    ap.add_argument("path", help="путь к файлу бота, обычно /opt/telegram-bot/bot.py")
    ap.add_argument("--dry", action="store_true", help="только показать, ничего не менять")
    ap.add_argument("--menu-only", action="store_true",
                    help="править только список команд (если он в отдельном файле)")
    args = ap.parse_args()

    if not os.path.isfile(args.path):
        print(f"Файла нет: {args.path}")
        return 1

    with open(args.path, encoding="utf-8") as f:
        original = f.readlines()

    patched = patch(original, menu_only=args.menu_only)

    print("\nЧто сделано:")
    for line in log:
        print("  " + line)

    diff = list(difflib.unified_diff(
        original, patched, fromfile="было", tofile="стало", n=1,
    ))
    if not diff:
        print("\nПравить нечего — файл уже в нужном виде.")
        show_fragments(patched)
        return 0

    print("\nИзменения:")
    for line in diff:
        print("  " + line.rstrip())

    if args.dry:
        print("\n--dry: файл не тронут.")
        show_fragments(patched)
        return 0

    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = f"{args.path}.bak-{stamp}"
    shutil.copy2(args.path, backup)

    with open(args.path, "w", encoding="utf-8") as f:
        f.writelines(patched)

    # Проверка: если Python больше не разбирает файл — откат, и точка.
    try:
        with tempfile.TemporaryDirectory() as tmp:
            py_compile.compile(args.path, cfile=os.path.join(tmp, "check.pyc"),
                               doraise=True)
    except py_compile.PyCompileError as exc:
        shutil.copy2(backup, args.path)
        print("\nПосле правок файл перестал разбираться — вернул как было.")
        print(exc)
        return 1

    print(f"\nГотово. Копия прежнего файла: {backup}")
    print("Синтаксис проверен, файл разбирается.")
    show_fragments(patched)
    print("\nДальше: sudo systemctl restart telegram-bot")
    return 0


if __name__ == "__main__":
    sys.exit(main())
