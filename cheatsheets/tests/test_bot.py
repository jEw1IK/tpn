#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Прогон бота целиком без сети:

    cd cheatsheets && python tests/test_bot.py

Подаём в диспетчер настоящие апдейты, смотрим, что бот пытается отправить.
Проверяются команды, подписи кнопок, инлайн-колбэки и поиск.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CHEATSHEETS = os.path.dirname(HERE)
sys.path.insert(0, CHEATSHEETS)
sys.path.insert(0, os.path.dirname(CHEATSHEETS))

from aiogram.methods import SendDocument, SendMessage  # noqa: E402
from aiogram.types import CallbackQuery, Message, Update  # noqa: E402

from tests.fake_bot import BOT_USER, FakeBot, USER, chat  # noqa: E402

from cheatsheets.bot.app import COMMANDS, build_dispatcher  # noqa: E402

failures: list[str] = []
checks = 0


def check(condition: bool, label: str) -> None:
    global checks
    checks += 1
    if not condition:
        failures.append(label)
        print(f"  ✗ {label}")
    else:
        print(f"  ✓ {label}")


_uid = [0]


def _next() -> int:
    _uid[0] += 1
    return _uid[0]


def text_update(text: str, chat_type: str = "private") -> Update:
    return Update(update_id=_next(), message=Message(
        message_id=_next(), date=dt.datetime.now(dt.timezone.utc),
        chat=chat(chat_type), from_user=USER, text=text,
    ))


def callback_update(data: str) -> Update:
    message = Message(
        message_id=_next(), date=dt.datetime.now(dt.timezone.utc),
        chat=chat(), from_user=BOT_USER, text="…",
    )
    return Update(update_id=_next(), callback_query=CallbackQuery(
        id=str(_next()), from_user=USER, chat_instance="1",
        message=message, data=data,
    ))


async def send(dp, bot: FakeBot, update: Update) -> FakeBot:
    bot.reset()
    await dp.feed_update(bot, update)
    return bot


async def main() -> None:
    dp = build_dispatcher()
    bot = FakeBot()

    print("\nКоманды")
    await send(dp, bot, text_update("/start"))
    out = bot.texts()
    check(bool(out) and "ПОСТ·НЕО" in out[0], "/start отвечает приветствием")
    markup = bot.calls[0].reply_markup
    labels = [b.text for row in markup.keyboard for b in row]
    check("📊 Шкалы" in labels, "на клавиатуре есть «Шкалы»")
    check(not any("илирубин" in b for b in labels), "билирубина на клавиатуре нет")
    web = [b for row in markup.keyboard for b in row if b.web_app]
    check(len(web) == 2, "две кнопки открывают мини-приложение")
    check(any(b.web_app.url.endswith("#scales") for b in web), "одна из них — вкладка «Шкалы»")

    await send(dp, bot, text_update("/help"))
    out = bot.texts()
    check(bool(out) and "/bili" not in out[0] and "/ozpk" not in out[0],
          "в справке нет удалённых команд")
    check("nSOFA" in out[0], "в справке есть шкалы")

    await send(dp, bot, text_update("/about"))
    check("15 шпаргалки" in bot.texts()[0] or "шпаргал" in bot.texts()[0], "/about отвечает")

    await send(dp, bot, text_update("/materials"))
    check("jew1ik.github.io" in bot.texts()[0], "/materials даёт ссылки")

    await send(dp, bot, text_update("/tpn"))
    check(bot.calls[0].reply_markup.inline_keyboard[0][0].web_app is not None,
          "/tpn открывает калькулятор кнопкой web_app")

    await send(dp, bot, text_update("/scales"))
    check("nSOFA" in bot.texts()[0], "/scales рассказывает про шкалы")

    await send(dp, bot, text_update("/shpory"))
    check("Шпаргалки неонатолога" in bot.texts()[0], "/shpory показывает разделы")

    await send(dp, bot, text_update("/shpory гбн"))
    check(bool(bot.documents()), "/shpory гбн сразу присылает PDF")

    print("\nПоиск")
    for query, expect in [
        ("желтуха", "Неонатальная желтуха"),
        ("ГБН", "Гемолитическая болезнь"),
        ("P23.0", "Врожденная пневмония"),
        ("сурфактант", "Синдром дыхательного расстройства"),
        ("ytjyfnfkmyfz;tknde[f", "Неонатальная желтуха"),
        ("пнвмония", "Врожденная пневмония"),
        ("917_1", "Гипербилирубинемия"),
    ]:
        await send(dp, bot, text_update(query))
        out = bot.texts()
        check(bool(out) and expect in out[0], f"«{query}» → {expect}")

    await send(dp, bot, text_update("абракадабра шмуцтитул"))
    check("Ничего не нашёл" in bot.texts()[0], "пустой ответ на бессмыслицу")

    await send(dp, bot, text_update("желтуха"))
    rows = bot.calls[0].reply_markup.inline_keyboard
    check(any(b.callback_data.startswith("cs:get:") for row in rows for b in row),
          "к найденной КР приложена шпаргалка")

    print("\nДозы")
    await send(dp, bot, text_update("/doza гентамицин 1200"))
    out = bot.texts()
    check(bool(out) and "6 мг" in out[0], "гентамицин 5 мг/кг на 1200 г = 6 мг")
    await send(dp, bot, text_update("/doza куросурф 1,2 кг"))
    out = bot.texts()
    check("3 мл" in out[0], "куросурф 200 мг/кг на 1,2 кг = 3 мл")
    await send(dp, bot, text_update("/doza аспирин"))
    check("нет" in bot.texts()[0].lower(), "неизвестный препарат — честный ответ")

    print("\nРеестр рекомендаций")
    await send(dp, bot, text_update("/kr"))
    check("Клинические рекомендации" in bot.texts()[0], "/kr показывает разделы")
    await send(dp, bot, callback_update("kr:grp:0"))
    check("Перинатальный период" in bot.texts()[0], "раздел открывается")
    await send(dp, bot, callback_update("kr:show:916_1"))
    check("Неонатальная желтуха" in bot.texts()[0], "карточка КР открывается")

    print("\nКнопки клавиатуры")
    for label, expect in [
        ("🔎 Найти рекомендации", "Что ищем"),
        ("📄 Шпаргалки", "Шпаргалки неонатолога"),
        ("📊 Шкалы", "nSOFA"),
        ("ℹ️ О проекте", "ПОСТ·НЕО"),
        ("❓ Помощь", "ПОСТ·НЕО"),
        ("🧬 Парентеральное питание", "Парентеральное питание"),
    ]:
        await send(dp, bot, text_update(label))
        out = bot.texts()
        check(bool(out) and expect in out[0], f"кнопка «{label}»")

    print("\nОтправка файлов")
    await send(dp, bot, callback_update("cs:get:gbn"))
    docs = bot.documents()
    check(bool(docs), "колбэк присылает PDF")
    await send(dp, bot, callback_update("cs:get:gbn"))
    check(bool(bot.documents()), "повторная отправка работает (кэш file_id)")

    print("\nГруппа вместо лички")
    await send(dp, bot, text_update("/start", chat_type="supergroup"))
    markup = bot.calls[0].reply_markup
    check(not any(b.web_app for row in markup.keyboard for b in row),
          "в группе нет кнопок web_app — Telegram их не принимает")
    await send(dp, bot, text_update("/scales", chat_type="supergroup"))
    check(bot.calls[0].reply_markup.inline_keyboard[0][0].url is not None,
          "в группе шкалы отдаются ссылкой")

    print("\nМеню команд")
    names = [c.command for c in COMMANDS]
    check("bili" not in names and "ozpk" not in names, "в меню нет удалённых команд")
    check({"start", "search", "kr", "doza", "shpory", "scales", "tpn", "help"} <= set(names),
          "все основные команды в меню")

    print(f"\nПроверок: {checks}, провалов: {len(failures)}")
    for f in failures:
        print(f"  ✗ {f}")
    raise SystemExit(1 if failures else 0)


if __name__ == "__main__":
    asyncio.run(main())
