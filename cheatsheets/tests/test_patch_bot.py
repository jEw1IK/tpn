#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Правка bot.py на сервере — на модели живого файла, без сети.

    cd cheatsheets && python tests/test_patch_bot.py

1. Копируем tests/fixtures/bot_live.py во временную папку и прогоняем
   deploy/patch_bot.py — так же, как это делает deploy/apply.sh.
2. Запускаем получившийся бот в отдельном процессе на подставных апдейтах:
   есть ли кнопка «💉 Седация», отвечает ли калькулятор на «мидазолам 1200»
   раньше, чем собственный поиск бота, попала ли /sed в меню команд.
3. Второй прогон патча не должен менять ничего.
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


def patch(path: str) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, PATCH, path], capture_output=True, text=True, timeout=60)


def main() -> int:
    import json

    with tempfile.TemporaryDirectory() as tmp:
        bot = os.path.join(tmp, "bot.py")
        shutil.copy(os.path.join(FIXTURES, "bot_live.py"), bot)

        print("Патч живого bot.py")
        first = patch(bot)
        ok(first.returncode == 0, "патч отработал без ошибок")
        if first.returncode:
            print(first.stdout, first.stderr)
        text = open(bot, encoding="utf-8").read()
        ok("[sedation_button()]," in text, "на клавиатуру добавлена кнопка седации")
        ok("from cheatsheets.bot.keyboard import sedation_button" in text, "и её импорт")
        ok('command="sed"' in text, "/sed в меню команд")
        ok("💉 <b>Седация</b>" in text, "строка про седацию в стартовом сообщении")
        ok("include_router(sedation_router)" not in text,
           "sedation_router отдельно не подключается — он внутри шпаргалок")

        second = patch(bot)
        ok("Править нечего" in second.stdout, "второй прогон ничего не меняет")

        print("\nБот после патча")
        run = subprocess.run(
            [sys.executable, "-c", RUN_BOT, tmp, FIXTURES, REPO, bot],
            capture_output=True, text=True, timeout=120,
        )
        ok(run.returncode == 0, "бот запускается")
        if run.returncode:
            print(run.stderr[-2000:])
            print(f"\nПроверок: {checks}, провалов: {len(failures)}")
            return 1
        res = json.loads(run.stdout.strip().splitlines()[-1])
        sed = [b for b in res["buttons"] if b[0] == "💉 Седация"]
        ok(bool(sed) and bool(sed[0][1]) and sed[0][1].rstrip("/").endswith("sedation"),
           "кнопка «💉 Седация» открывает мини-приложение")
        ok("💉" in res["start_text"] and "/sed" in res["start_text"], "в /start есть седация")
        mid = res["мидазолам 1200"]
        ok(bool(mid) and "Развести до 41,7 мл" in mid[0],
           "«мидазолам 1200» отвечает калькулятор, а не поиск")
        fen = res["фентанил 1180 0,1=1"]
        ok(bool(fen) and "Развести до 8,5 мл" in fen[0], "«фентанил 1180 0,1=1» → до 8,5 мл")
        ok(bool(res["/sed"]) and "до скольки развести" in res["/sed"][0], "/sed работает")
        ok(res["желтуха"] == ["KR: желтуха"], "остальной текст по-прежнему уходит в поиск бота")
        ok("sed" in res["commands"] and "scales" in res["commands"], "/sed в меню при запуске")

    print(f"\nПроверок: {checks}, провалов: {len(failures)}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
