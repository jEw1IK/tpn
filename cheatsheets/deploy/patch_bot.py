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
    4. убирает /bili и /ozpk из меню команд и добавляет /scales;
    5. ставит кнопку «💉 Седация» в ряд к кнопке шкал — к остальным
       мини-приложениям, добавляет /sed в меню команд и строку про седацию
       в стартовое сообщение;
    6. ставит кнопку «🍼 Энтеральное питание» отдельным рядом под кнопкой
       парентерального питания, добавляет /enteral в меню и строку в /start.
       Сам калькулятор подключать не нужно: он вложен в cheatsheets_router.

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
SCALES_LABEL = "📊 Шкалы"
SCALES_IMPORT = "from cheatsheets.bot.keyboard import scales_button"
ROUTER_IMPORT = "from cheatsheets.bot.scales_router import scales_router"
SEDATION_IMPORT = "from cheatsheets.bot.keyboard import sedation_button"
SEDATION_LABEL = "💉 Седация"
SEDATION_MENU = ("💉 <b>Седация</b> · до скольки развести мидазолам и фентанил: "
                 "<code>/sed</code>\\n\\n")
SEDATION_COMMAND = 'description="Седация: мидазолам, фентанил"'
ENTERAL_IMPORT = "from cheatsheets.bot.keyboard import enteral_button"
ENTERAL_LABEL = "🍼 Энтеральное питание"
ENTERAL_MENU = ("🍼 <b>Энтеральное питание</b> · ккал, белок и углеводы на смесях: "
                "<code>/enteral</code>\\n\\n")
ENTERAL_COMMAND = 'description="Энтеральное питание: ккал, белок"'

# Ряд клавиатуры с кнопкой питания, записанный одной строкой: [KeyboardButton(...)],
RE_TPN_ROW = re.compile(
    r"^(\s*)\[.*(?:Парентеральное питание|tpn_button\().*\]\s*,?\s*(?:#.*)?$"
)
RE_STRING_LINE = re.compile(r'^\s*"[^"]*"\s*$')

# Импорт модуля билирубина пишут по-разному, и это важно ловить полностью:
#   from cheatsheets.bot.bilirubin_router import bilirubin_router
#   from cheatsheets.bot import bilirubin_router as bili_module
#   import cheatsheets.bot.bilirubin_router
RE_IMPORT_BILI = re.compile(
    r"^\s*(?:from\s+[\w.]*bilirubin_router\s+import\b"
    r"|from\s+[\w.]+\s+import\s+[^#]*\bbilirubin_router\b"
    r"|import\s+[\w.]*bilirubin_router\b)"
)
# Имя, под которым модуль оказался в коде: ... import bilirubin_router as ЭТО
RE_IMPORT_ALIAS = re.compile(r"\bbilirubin_router\s+as\s+(\w+)")
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


# --------------------------------------------------------------------------
# Тексты: что в справке говорится про билирубин
# --------------------------------------------------------------------------
# Правила подобраны по живому боту. "drop" — строка удаляется целиком,
# "sub" — замена куска текста, "inner" — переписывается содержимое строковой
# константы, а отступ, кавычки и запятая остаются на месте.
TEXT_RULES = [
    ("sub", "3. Билирубин", "3. Шкалы"),
    ("sub", "Пороги фототерапии и ОЗПК по таблицам КР МЗ РФ — прямо в чате:",
            "nSOFA, NEOMOD, Сарнат, NIPS, N-PASS и VIS — отмечаете пункты, сумма и трактовка считаются сами."),
    ("drop", "/bili 38 48 250"),
    ("drop", "/bili 36 24 190"),
    ("drop", "/ozpk 3200"),
    ("inner", "Без чисел <code>/bili</code>",
              "Открыть: кнопка <b>📊 Шкалы</b> или <code>/scales</code>. "
              "Пороги ФТ и ОЗПК остались в шпаргалке: <code>/shpory гбн</code>.\\n\\n"),
    ("inner", "/bili — пороги билирубина",
              "/scales — шкалы: nSOFA, NEOMOD, Сарнат, VIS\\n"),
    ("inner", "🟡 <b>Билирубин</b>",
              "📊 <b>Шкалы</b> · nSOFA, NEOMOD, Сарнат, VIS: <code>/scales</code>\\n\\n"),
    ("sub", "калькулятор билирубина (/bili, /ozpk)", "шкалы оценки (/scales)"),
]


def replace_inner(line: str, new_inner: str) -> str:
    """Меняет содержимое строковой константы, не трогая обрамление."""
    first, last = line.find('"'), line.rfind('"')
    if first < 0 or last <= first:
        return line
    return line[:first + 1] + new_inner + line[last:]


def patch_texts(out: list) -> list:
    result, dropped = [], 0
    for i, line in enumerate(out, 1):
        new = line
        skip = False
        for rule in TEXT_RULES:
            kind, needle = rule[0], rule[1]
            if needle not in new:
                continue
            if kind == "drop":
                note("✓", f"строка {i}: убрана строка справки про {needle}")
                skip = True
                dropped += 1
                break
            if kind == "sub":
                new = new.replace(needle, rule[2])
                note("✓", f"строка {i}: текст «{needle[:40]}…» обновлён")
            elif kind == "inner":
                new = replace_inner(new, rule[2])
                note("✓", f"строка {i}: строка справки переписана под шкалы")
        if not skip:
            result.append(new)
    return result


# --------------------------------------------------------------------------
# Обработчик кнопки «Билирубин»
# --------------------------------------------------------------------------
def drop_handler(out: list, aliases) -> list:
    """Удаляет обработчик кнопки вместе с его декораторами.

    Начало — первая строка подряд идущих декораторов над функцией.
    Конец — там, где кончился отступ, то есть началась следующая
    конструкция нулевого уровня. Сколько строк внутри — неважно.
    """
    blocks = []
    for i, line in enumerate(out):
        if not re.match(r"^(async\s+)?def\s+\w*bili\w*", line, re.IGNORECASE):
            continue

        end = i + 1
        while end < len(out) and (out[end].strip() == "" or out[end][:1].isspace()):
            end += 1
        while end > i + 1 and out[end - 1].strip() == "":
            end -= 1

        body = out[i + 1:end]
        # Тело должно обращаться к модулю билирубина — иначе это чужая
        # функция с похожим именем, и трогать её нельзя.
        names = {aliases} if isinstance(aliases, str) else set(aliases or ())
        if names and not any(
            re.search(rf"\b{re.escape(n)}\b", b) for b in body for n in names
        ):
            continue

        start = i
        while start > 0 and out[start - 1].lstrip().startswith("@"):
            start -= 1

        blocks.append((start, end))

    for start, end in reversed(blocks):
        note("✓", f"строки {start + 1}–{end}: удалён обработчик кнопки "
                  f"«{BILI_BUTTON}» ({end - start} строк)")
        del out[start:end]
    return out


def bili_users(lines: list) -> tuple:
    """Находит импорты модуля билирубина и все места, где им пользуются.

    Возвращает (имена_в_коде, строки_импорта, строки_использования).
    Имён может быть несколько: модуль нередко импортируют дважды —
    и целиком под псевдонимом, и отдельным роутером.
    """
    names, imports = set(), []
    for i, line in enumerate(lines, 1):
        if not RE_IMPORT_BILI.match(line):
            continue
        imports.append(i)
        alias = RE_IMPORT_ALIAS.search(line)
        names.add(alias.group(1) if alias else "bilirubin_router")
    if not names:
        return set(), [], []

    used = []
    for i, line in enumerate(lines, 1):
        if i in imports:
            continue
        for name in names:
            if not re.search(rf"\b{re.escape(name)}\b", line):
                continue
            # Подключение роутера скрипт умеет убирать сам — это не «использование».
            if re.match(rf"^\s*\w+\.include_router\(\s*{re.escape(name)}\s*\)", line):
                continue
            used.append(i)
            break
    return names, imports, used


def remaining_after_handler(lines: list) -> tuple:
    """Что останется от модуля билирубина, если убрать обработчик кнопки."""
    probe = list(lines)
    names, imports, used = bili_users(probe)
    if used:
        silent = len(log)
        probe = drop_handler(probe, names)
        del log[silent:]          # это разведка, в отчёт она не идёт
        names, imports, used = bili_users(probe)
    return names, imports, used


def patch(lines: list, menu_only: bool = False) -> list:
    out = list(lines)
    if menu_only:
        return patch_menu(out)

    # 1. Импорт и подключение billirubin_router ------------------------------
    names, imports, used = bili_users(out)
    if used:
        # Сначала убираем обработчик кнопки — обычно он и есть единственный,
        # кто дёргает модуль напрямую.
        out = drop_handler(out, names)
        names, imports, used = bili_users(out)

    if used:
        # Модуль не просто подключён роутером, а ещё где-то вызывается.
        # Выдернуть импорт молча — значит поменять падение на старте
        # на падение в руках у врача. Не трогаем и говорим прямо.
        note("!", f"модуль билирубина в коде зовётся «{', '.join(sorted(names))}» и используется в "
                  f"строках {', '.join(map(str, used))} — импорт не трогаю")
        note("!", "пока эти строки не убраны вручную, старый модуль должен "
                  "остаться на месте, иначе бот не запустится")
        return patch_enteral_text(patch_sedation_text(patch_texts(patch_rest(out, skip_imports=True))))

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

    return patch_enteral_text(patch_sedation_text(patch_texts(patch_rest(out))))


def add_import(out: list, imp: str) -> None:
    """Добавляет импорт после последнего верхнего import, если его ещё нет."""
    if any(imp in l for l in out):
        return
    last = 0
    for i, line in enumerate(out[:80]):
        if RE_TOP_IMPORT.match(line):
            last = i
    out.insert(last + 1, imp + "\n")
    note("✓", f"добавлен импорт: {imp}")


def _call_end(line: str, open_paren: int) -> int | None:
    """Индекс сразу за скобкой, закрывающей вызов, открытый в open_paren."""
    depth = 0
    for i in range(open_paren, len(line)):
        if line[i] == "(":
            depth += 1
        elif line[i] == ")":
            depth -= 1
            if depth == 0:
                return i + 1
    return None


def scales_slot(line: str) -> int | None:
    """Позиция сразу за scales_button(...), если вызов стоит в ряду клавиатуры.

    Ряд — это список [...], вызов builder.row(...)/.add(...) или отдельный
    элемент многострочного списка. Присваивание «btn = scales_button()» не
    трогаем: дописанная запятая превратила бы кнопку в кортеж.
    """
    m = re.search(r"\bscales_button\(", line)
    if not m:
        return None
    end = _call_end(line, m.end() - 1)
    if end is None or line[end:].lstrip()[:1] not in (",", "]", ")"):
        return None
    before = line[:m.start()]
    in_list = before.rfind("[") > before.rfind("]")
    in_call = (before.count("(") > before.count(")")
               and re.search(r"\.(?:row|add|insert)\(", before) is not None)
    alone = before.strip() == ""
    return end if (in_list or in_call or alone) else None


def patch_sedation(out: list) -> list:
    """Кнопка калькулятора седации — в ряд к кнопке шкал, к остальным приложениям.

    Ряд со шкалами в файле есть наверняка: его ставит этот же скрипт.
    Если его всё же нет — новым рядом под кнопкой питания.
    """
    rows = [i for i, line in enumerate(out) if scales_slot(line) is not None]
    placed = [i for i, line in enumerate(out)
              if "sedation_button(" in line and not RE_TOP_IMPORT.match(line.lstrip())]

    if rows:
        i = rows[0]
        near = [j for j in placed if abs(j - i) <= 8]
        if near:
            note("·", f"кнопка «{SEDATION_LABEL}» уже среди приложений (строка {near[0] + 1})")
            return out
        if placed:
            note("·", f"кнопка седации нашлась в строке {placed[0] + 1}, но не в той "
                      "клавиатуре, что у /start, — ставлю и туда")
        pos = scales_slot(out[i])
        out[i] = out[i][:pos] + ", sedation_button()" + out[i][pos:]
        note("✓", f"строка {i + 1}: кнопка «{SEDATION_LABEL}» встала в ряд к «{SCALES_LABEL}»")
        add_import(out, SEDATION_IMPORT)
        return out

    if placed:
        note("·", f"кнопка «{SEDATION_LABEL}» уже на клавиатуре (строка {placed[0] + 1})")
        return out

    for i, line in enumerate(out):
        m = RE_TPN_ROW.match(line)
        if m:
            out.insert(i + 1, f"{m.group(1)}[sedation_button()],\n")
            note("✓", f"строка {i + 2}: кнопка «{SEDATION_LABEL}» поставлена под кнопкой питания")
            add_import(out, SEDATION_IMPORT)
            return out

    note("!", f"не нашёл, куда поставить кнопку «{SEDATION_LABEL}». Калькулятор всё равно "
              "работает: /sed и «мидазолам 1200» в чате. Пришли строки ниже — поставлю точечно:")
    shown = 0
    for i, line in enumerate(out):
        if shown >= 15:
            break
        if any(k in line for k in ("KeyboardButton", "ReplyKeyboard", "Keyboard", "Шкалы", "Парентеральное")):
            note(" ", f"{i + 1:>5}: {line.rstrip()}")
            shown += 1
    return out


def tpn_row_copy(line: str) -> str | None:
    """Копия однострочного ряда с кнопкой питания, где вместо неё — enteral_button().

    Подходит для «[KeyboardButton(...)],», «rows.append([KeyboardButton(...)])»
    и «kb.row(KeyboardButton(...))». Если ряд разбит на строки — None.
    """
    if "Парентеральное питание" not in line and "tpn_button(" not in line:
        return None
    span = None
    for m in re.finditer(r"\b(?:KeyboardButton|tpn_button)\(", line):
        end = _call_end(line, m.end() - 1)
        if end and ("Парентеральное питание" in line[m.start():end]
                    or line[m.start():].startswith("tpn_button(")):
            span = (m.start(), end)
            break
    if not span:
        return None
    new = line[:span[0]] + "enteral_button()" + line[span[1]:]
    new = re.sub(r"\s*#.*$", "", new.rstrip("\n")) + "\n"
    if not re.search(r"[\[(]\s*enteral_button\(\)\s*[\])]", new):
        return None
    return new


def patch_enteral(out: list) -> list:
    """Кнопка энтерального питания — отдельным рядом под парентеральным."""
    if any("enteral_button(" in l and not RE_TOP_IMPORT.match(l.lstrip()) for l in out):
        note("·", f"кнопка «{ENTERAL_LABEL}» уже на клавиатуре")
        return out
    for i, line in enumerate(out):
        copy = tpn_row_copy(line)
        if copy:
            out.insert(i + 1, copy)
            note("✓", f"строка {i + 2}: кнопка «{ENTERAL_LABEL}» встала под парентеральным питанием")
            add_import(out, ENTERAL_IMPORT)
            return out
    rows = [i for i, l in enumerate(out) if scales_slot(l) is not None]
    if rows:
        i = rows[0]
        m = re.search(r"\bsedation_button\(\)", out[i])
        pos = m.end() if m else scales_slot(out[i])
        out[i] = out[i][:pos] + ", enteral_button()" + out[i][pos:]
        note("✓", f"строка {i + 1}: кнопка «{ENTERAL_LABEL}» встала в ряд к шкалам")
        add_import(out, ENTERAL_IMPORT)
        return out
    note("!", f"не нашёл, куда поставить кнопку «{ENTERAL_LABEL}» — приложение открывается "
              "командой /enteral")
    return out


def patch_enteral_text(out: list) -> list:
    """Строка про энтеральное питание в /start — под седацией или под шкалами."""
    if any("🍼 <b>Энтеральное питание</b>" in l for l in out):
        note("·", "строка про энтеральное питание в стартовом сообщении уже есть")
        return out
    for marker in ("💉 <b>Седация</b>", "📊 <b>Шкалы</b>"):
        for i, line in enumerate(out):
            if marker in line and RE_STRING_LINE.match(line.rstrip("\n")):
                out.insert(i + 1, replace_inner(line, ENTERAL_MENU))
                note("✓", f"строка {i + 2}: в стартовое сообщение добавлено энтеральное питание")
                return out
    note("·", "место для строки про энтеральное питание в /start не нашёл — не трогаю")
    return out


def patch_sedation_text(out: list) -> list:
    """Строка про седацию в стартовом сообщении — под строкой про шкалы.

    Идёт после patch_texts: строку «📊 Шкалы» пишет именно он.
    """
    if any("💉 <b>Седация</b>" in l for l in out):
        note("·", "строка про седацию в стартовом сообщении уже есть")
    else:
        for i, line in enumerate(out):
            if "📊 <b>Шкалы</b>" in line and RE_STRING_LINE.match(line.rstrip("\n")):
                out.insert(i + 1, replace_inner(line, SEDATION_MENU))
                note("✓", f"строка {i + 2}: в стартовое сообщение добавлена седация")
                break
        else:
            note("·", "строку «📊 Шкалы» в текстах не нашёл — стартовое сообщение не трогаю")
    return out


def patch_rest(out: list, skip_imports: bool = False) -> list:
    # 2. Кнопка на клавиатуре ------------------------------------------------
    found_button = False
    used_helper = False
    for i, line in enumerate(out):
        if RE_BUTTON.search(line):
            out[i] = RE_BUTTON.sub("scales_button()", line)
            found_button = True
            used_helper = True
            note("✓", f"строка {i + 1}: кнопка «{BILI_BUTTON}» заменена на scales_button()")
    if not found_button:
        # Клавиатура бывает собрана и без KeyboardButton(...): списком строк
        # или билдером. Тогда меняем саму подпись — нажатие поймает
        # scales_router и ответит кнопкой мини-приложения.
        for i, line in enumerate(out):
            if BILI_BUTTON not in line or "F.text" in line or "<" in line:
                continue
            out[i] = line.replace(BILI_BUTTON, SCALES_LABEL)
            found_button = True
            note("✓", f"строка {i + 1}: подпись кнопки заменена на «{SCALES_LABEL}»")

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

    # 4. Импорты — только те, что действительно понадобились ------------------
    wanted = [ROUTER_IMPORT] + ([SCALES_IMPORT] if used_helper else [])
    need = [imp for imp in wanted if not any(imp in l for l in out)]
    if need:
        last = 0
        for i, line in enumerate(out[:80]):
            if RE_TOP_IMPORT.match(line):
                last = i
        for offset, imp in enumerate(need):
            out.insert(last + 1 + offset, imp + "\n")
            note("✓", f"добавлен импорт: {imp}")

    out = patch_sedation(out)
    out = patch_enteral(out)
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
                     'description="Шкалы: nSOFA, NEOMOD, Сарнат, VIS"', new)
        idx = out.index(shpory_line)
        out.insert(idx + 1, new)
        note("✓", f"строка {idx + 2}: в меню добавлена команда /scales")
    elif not shpory_line:
        note("!", "строку с /shpory в меню не нашёл — команду /scales добавь сам")

    if any(re.search(r"[\"']sed[\"']", l) for l in out):
        note("·", "/sed в меню уже есть")
    else:
        anchor = None
        for key in ("scales", "tpn", "shpory"):
            anchor = next((l for l in out if "BotCommand" in l
                           and re.search(rf"[\"']{key}[\"']", l)), None)
            if anchor:
                break
        if anchor:
            new = re.sub(r"([\"'])(scales|tpn|shpory)\1", r"\1sed\1", anchor, count=1)
            new = re.sub(r'description\s*=\s*(["\']).*?\1', SEDATION_COMMAND, new)
            idx = out.index(anchor)
            out.insert(idx + 1, new)
            note("✓", f"строка {idx + 2}: в меню добавлена команда /sed")
        else:
            note("!", "меню команд не нашёл — /sed добавь сам")

    if any(re.search(r"[\"']enteral[\"']", l) for l in out):
        note("·", "/enteral в меню уже есть")
    else:
        anchor = None
        for key in ("sed", "scales", "tpn"):
            anchor = next((l for l in out if "BotCommand" in l
                           and re.search(rf"[\"']{key}[\"']", l)), None)
            if anchor:
                break
        if anchor:
            new = re.sub(r"([\"'])(sed|scales|tpn)\1", r"\1enteral\1", anchor, count=1)
            new = re.sub(r'description\s*=\s*(["\']).*?\1', ENTERAL_COMMAND, new)
            idx = out.index(anchor)
            out.insert(idx + 1, new)
            note("✓", f"строка {idx + 2}: в меню добавлена команда /enteral")
        else:
            note("!", "меню команд не нашёл — /enteral добавь сам")

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
    ap.add_argument("--check", action="store_true",
                    help="только проверить, безопасно ли обновлять модуль (ничего не меняет)")
    ap.add_argument("--menu-only", action="store_true",
                    help="править только список команд (если он в отдельном файле)")
    args = ap.parse_args()

    if not os.path.isfile(args.path):
        print(f"Файла нет: {args.path}")
        return 1

    with open(args.path, encoding="utf-8") as f:
        original = f.readlines()

    if args.check:
        names, imports, used = remaining_after_handler(original)
        if not imports:
            print("Проверка: модуль билирубина в коде не используется — можно обновлять.")
            return 0
        if not used:
            print(f"Проверка: модуль билирубина подключён (строки "
                  f"{', '.join(map(str, imports))}), но больше нигде не вызывается — "
                  f"скрипт уберёт его сам.")
            return 0
        print("Проверка не пройдена.\n")
        print(f"Модуль билирубина импортируется в строках "
              f"{', '.join(map(str, imports))} под именем «{', '.join(sorted(names))}» и вызывается "
              f"в строках: {', '.join(map(str, used))}.")
        print("\nЕсли удалить модуль, бот упадёт на старте. Сначала нужно убрать "
              "эти строки из кода — руками, потому что там ваши обработчики, "
              "а не шаблонный код.")
        for n in used[:12]:
            print(f"  {n:>5}: {original[n - 1].rstrip()}")
        return 2

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
