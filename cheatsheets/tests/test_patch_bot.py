#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Правка bot.py на сервере — на модели живого файла, без сети.

    cd cheatsheets && python tests/test_patch_bot.py

1. Копируем tests/fixtures/bot_live.py во временную папку и прогоняем
   deploy/patch_bot.py — так же, как это делает deploy/apply.sh.
2. Запускаем получившийся бот в отдельном процессе на подставных апдейтах:
   есть ли кнопка «💉 Седация» рядом со шкалами, отвечает ли калькулятор
   на «мидазолам 1200» раньше, чем собственный поиск бота, попала ли /sed
   в меню команд.
3. Второй прогон патча не должен менять ничего.

Живой bot.py мог быть написан по-разному, поэтому всё это повторяется на
пяти вариантах записи клавиатуры (VARIANTS).
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
CHEATSHEETS = os.path.dirname(HERE)
REPO = os.path.dirname(CHEATSHEETS)
FIXTURES = os.path.join(HERE, "fixtures")
PATCH = os.path.join(CHEATSHEETS, "deploy", "patch_bot.py")

failures: list[str] = []
checks = 0


def ok(condition: bool, label: str) -> None:
    global checks
    checks += 1
    if condition:
        print(f"  ✓ {label}")
    else:
        failures.append(label)
        print(f"  ✗ {label}")


RUN_BOT = r'''
import asyncio, datetime as dt, importlib.util, json, sys
sys.path[:0] = [sys.argv[1], sys.argv[2], sys.argv[3]]     # папка бота, фикстуры, репозиторий
from aiogram.methods import SetMyCommands
from aiogram.types import Message, Update
from cheatsheets.tests.fake_bot import FakeBot, USER, chat

spec = importlib.util.spec_from_file_location("bot", sys.argv[4])
bot_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bot_module)

n = [0]
def update(text, kind="private"):
    n[0] += 1
    return Update(update_id=n[0], message=Message(
        message_id=n[0], date=dt.datetime.now(dt.timezone.utc),
        chat=chat(kind), from_user=USER, text=text))

async def main():
    out = {}
    fake = FakeBot()
    dp = bot_module.dp
    await dp.feed_update(fake, update("/start"))
    kb = fake.calls[0].reply_markup.keyboard
    out["start_text"] = fake.texts()[0]
    out["buttons"] = [[b.text, b.web_app.url if b.web_app else None] for row in kb for b in row]
    for text in ("мидазолам 1200", "фентанил 1180 0,1=1", "/sed", "желтуха"):
        fake.reset()
        await dp.feed_update(fake, update(text))
        out[text] = fake.texts()
    fake.reset()
    await bot_module.on_startup(fake)
    cmds = [c for c in fake.calls if isinstance(c, SetMyCommands)]
    out["commands"] = [c.command for c in cmds[0].commands] if cmds else []
    print(json.dumps(out, ensure_ascii=False))

asyncio.run(main())
'''


BASE_KB = """    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="🔎 Найти рекомендации")],
            [KeyboardButton(text="🧬 Парентеральное питание", web_app=WebAppInfo(url=TPN_URL))],
            [KeyboardButton(text="📄 Шпаргалки"), scales_button()],
            [KeyboardButton(text="ℹ️ О проекте"), KeyboardButton(text="❓ Помощь")],
        ],
        resize_keyboard=True,
    )"""


def _swap_kb(text: str, new_kb: str) -> str:
    assert BASE_KB in text, "фикстура поменялась — обнови BASE_KB"
    return text.replace(BASE_KB, new_kb)


def v_comments(text: str) -> str:
    """Комментарии в конце рядов и «]» внутри адреса — обычные регэкспы на этом спотыкаются."""
    text = text.replace('TPN_URL = "https://jew1ik.github.io/tpn/"',
                        'TPN_URL = "https://jew1ik.github.io/tpn/"\nURLS = {"tpn": TPN_URL}')
    return _swap_kb(text, BASE_KB
                    .replace('web_app=WebAppInfo(url=TPN_URL))],',
                             'web_app=WebAppInfo(url=URLS["tpn"]))],  # питание')
                    .replace('scales_button()],', 'scales_button()],  # шкалы'))


def v_multiline(text: str) -> str:
    """Ряды разбиты на несколько строк."""
    return _swap_kb(text, BASE_KB
                    .replace('            [KeyboardButton(text="📄 Шпаргалки"), scales_button()],',
                             '            [\n'
                             '                KeyboardButton(text="📄 Шпаргалки"),\n'
                             '                scales_button(),\n'
                             '            ],')
                    .replace('            [KeyboardButton(text="🧬 Парентеральное питание", web_app=WebAppInfo(url=TPN_URL))],',
                             '            [KeyboardButton(\n'
                             '                text="🧬 Парентеральное питание",\n'
                             '                web_app=WebAppInfo(url=TPN_URL),\n'
                             '            )],'))


def v_builder(text: str) -> str:
    """Клавиатура через ReplyKeyboardBuilder."""
    text = text.replace("from aiogram.filters import Command, CommandStart",
                        "from aiogram.filters import Command, CommandStart\n"
                        "from aiogram.utils.keyboard import ReplyKeyboardBuilder")
    return _swap_kb(text, """    kb = ReplyKeyboardBuilder()
    kb.row(KeyboardButton(text="🔎 Найти рекомендации"))
    kb.row(KeyboardButton(text="🧬 Парентеральное питание", web_app=WebAppInfo(url=TPN_URL)))
    kb.row(KeyboardButton(text="📄 Шпаргалки"), scales_button())
    kb.row(KeyboardButton(text="ℹ️ О проекте"), KeyboardButton(text="❓ Помощь"))
    return kb.as_markup(resize_keyboard=True)""")


def v_misplaced(text: str) -> str:
    """Прошлый прогон поставил кнопку в клавиатуру, которой /start не пользуется."""
    text = text.replace("from cheatsheets.bot.keyboard import scales_button",
                        "from cheatsheets.bot.keyboard import scales_button\n"
                        "from cheatsheets.bot.keyboard import sedation_button")
    return text.replace("MENU = (", "def old_kb():\n    return [\n        [sedation_button()],\n    ]\n\n\nMENU = (", 1)


VARIANTS = [
    ("как модель живого бота", lambda t: t),
    ("комментарии и «]» в адресе", v_comments),
    ("многострочные ряды", v_multiline),
    ("ReplyKeyboardBuilder", v_builder),
    ("кнопка уже стояла не там", v_misplaced),
]


def patch(path: str) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, PATCH, path], capture_output=True, text=True, timeout=60)


def run_variant(name: str, transform) -> None:
    import json

    with tempfile.TemporaryDirectory() as tmp:
        bot = os.path.join(tmp, "bot.py")
        with open(os.path.join(FIXTURES, "bot_live.py"), encoding="utf-8") as f:
            source = transform(f.read())
        with open(bot, "w", encoding="utf-8") as f:
            f.write(source)

        print(f"\n{name}")
        first = patch(bot)
        ok(first.returncode == 0, f"{name}: патч отработал")
        if first.returncode:
            print(first.stdout, first.stderr)
            return
        text = open(bot, encoding="utf-8").read()
        ok("from cheatsheets.bot.keyboard import sedation_button" in text, f"{name}: импорт кнопки")
        ok('command="sed"' in text, f"{name}: /sed в меню команд")
        ok("💉 <b>Седация</b>" in text, f"{name}: строка про седацию в /start")
        ok("include_router(sedation_router)" not in text,
           f"{name}: sedation_router отдельно не подключается")

        second = patch(bot)
        ok("Править нечего" in second.stdout, f"{name}: второй прогон ничего не меняет")

        run = subprocess.run(
            [sys.executable, "-c", RUN_BOT, tmp, FIXTURES, REPO, bot],
            capture_output=True, text=True, timeout=120,
        )
        ok(run.returncode == 0, f"{name}: бот запускается")
        if run.returncode:
            print(run.stderr[-2000:])
            return
        res = json.loads(run.stdout.strip().splitlines()[-1])
        sed = [b for b in res["buttons"] if b[0] == "💉 Седация"]
        ok(len(sed) == 1 and bool(sed[0][1]) and sed[0][1].rstrip("/").endswith("sedation"),
           f"{name}: в клавиатуре /start ровно одна кнопка «💉 Седация», и она открывает приложение")
        apps = [b[0] for b in res["buttons"] if b[1]]
        ok(apps.index("💉 Седация") > apps.index("📊 Шкалы") if "💉 Седация" in apps and "📊 Шкалы" in apps else False,
           f"{name}: седация стоит среди приложений, рядом со шкалами")
        ok("💉" in res["start_text"] and "/sed" in res["start_text"], f"{name}: в /start есть седация")
        mid = res["мидазолам 1200"]
        ok(bool(mid) and "Развести до 41,7 мл" in mid[0],
           f"{name}: «мидазолам 1200» отвечает калькулятор, а не поиск")
        fen = res["фентанил 1180 0,1=1"]
        ok(bool(fen) and "Развести до 8,5 мл" in fen[0], f"{name}: «фентанил 1180 0,1=1» → до 8,5 мл")
        ok(bool(res["/sed"]) and "до скольки развести" in res["/sed"][0], f"{name}: /sed работает")
        ok(res["желтуха"] == ["KR: желтуха"], f"{name}: остальной текст уходит в поиск бота")
        ok("sed" in res["commands"] and "scales" in res["commands"], f"{name}: /sed в меню при запуске")


def main() -> int:
    print("Правка bot.py на разных способах записать клавиатуру")
    for name, transform in VARIANTS:
        run_variant(name, transform)
    print(f"\nПроверок: {checks}, провалов: {len(failures)}")
    for f in failures:
        print(f"  ✗ {f}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
