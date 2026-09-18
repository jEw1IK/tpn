#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ПОСТ·НЕО — телеграм-бот неонатолога. Готовый к запуску, без доработок.

    pip install -r requirements-bot.txt
    export BOT_TOKEN=123456:AA...
    python -m cheatsheets.bot.app

Что внутри:

    /start      меню и клавиатура
    /search     поиск по 57 клиническим рекомендациям МЗ РФ
    /kr         реестр рекомендаций по разделам
    /doza       доза препарата, при желании — сразу в мг на массу
    /shpory     15 шпаргалок в PDF
    /scales     мини-приложение со шкалами (nSOFA, NIPS, N-PASS)
    /tpn        калькулятор парентерального питания
    /materials  список шпаргалок ссылками
    /about      о проекте
    /help       справка

Настройки — через переменные окружения:

    BOT_TOKEN           токен от @BotFather (обязательно)
    TPN_WEBAPP_URL      адрес калькулятора питания
    SCALES_WEBAPP_URL   адрес вкладки со шкалами
    CHANNEL_URL         ссылка на канал; без неё команда /channel скрыта
"""
from __future__ import annotations

import asyncio
import logging
import os
import sys

from aiogram import Bot, Dispatcher, F, Router
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ChatType, ParseMode
from aiogram.filters import Command, CommandStart
from aiogram.types import (
    BotCommand,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    WebAppInfo,
)

# Запуск как `python -m cheatsheets.bot.app` из любой директории.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from cheatsheets.bot.aiogram_router import (  # noqa: E402
    catalog, cheatsheets_router, send_root,
)
from cheatsheets.bot.brand import channel_url, credit_line  # noqa: E402
from cheatsheets.bot.help_text import HELP_TEXT  # noqa: E402
from cheatsheets.bot.keyboard import (  # noqa: E402
    ABOUT_TEXT, HELP_TEXT_BTN, SEARCH_TEXT, SHEETS_TEXT, TPN_TEXT, TPN_URL,
    main_keyboard,
)
from cheatsheets.bot.scales_router import scales_router  # noqa: E402
from cheatsheets.bot.search_router import ASK_QUERY, search_router  # noqa: E402

log = logging.getLogger("postneo")

main_router = Router(name="main")

# Переменная окружения важнее файла — на случай переезда канала.
CHANNEL_URL = channel_url()

COMMANDS = [
    BotCommand(command="start", description="Меню"),
    BotCommand(command="search", description="Поиск клинических рекомендаций"),
    BotCommand(command="kr", description="Реестр рекомендаций по разделам"),
    BotCommand(command="doza", description="Доза препарата"),
    BotCommand(command="shpory", description="Шпаргалки в PDF"),
    BotCommand(command="scales", description="Шкалы оценки"),
    BotCommand(command="tpn", description="Парентеральное питание"),
    BotCommand(command="materials", description="Список шпаргалок"),
    BotCommand(command="about", description="О проекте"),
    BotCommand(command="help", description="Справка"),
]
if CHANNEL_URL:
    COMMANDS.insert(-1, BotCommand(command="channel", description="Канал ПОСТ·НЕО"))


START_TEXT = (
    "<b>ПОСТ·НЕО</b> — инструменты неонатолога под рукой.\n\n"
    "Напишите диагноз или код МКБ-10 — найду клиническую рекомендацию "
    "и шпаргалку к ней. Остальное на кнопках снизу.\n\n"
    "Полная справка — /help."
)

ABOUT = (
    "<b>ПОСТ·НЕО</b>\n\n"
    "Шпаргалки, расчёты и шкалы для отделения новорождённых. "
    "Всё построено на действующих клинических рекомендациях МЗ РФ: "
    "в каждой шпаргалке указан ID рекомендации и дата размещения, "
    "чтобы можно было проверить источник.\n\n"
    "{count} шпаргалки в PDF · {kr} рекомендаций в поиске · "
    "калькулятор парентерального питания · семь шкал: nSOFA, NEOMOD, Сарнат, "
    "NIPS, N-PASS, VIS.\n\n"
    "{credit}\n\n"
    "<i>Материалы для быстрой сверки у постели пациента. Не заменяют "
    "действующие клинические рекомендации и назначение врача.</i>"
)


# --------------------------------------------------------------------------
# Команды
# --------------------------------------------------------------------------
@main_router.message(CommandStart())
async def cmd_start(message: Message) -> None:
    await message.answer(
        START_TEXT,
        reply_markup=main_keyboard(message.chat.type),
        parse_mode=ParseMode.HTML,
    )


@main_router.message(Command("help", "помощь"))
@main_router.message(F.text == HELP_TEXT_BTN)
async def cmd_help(message: Message) -> None:
    await message.answer(
        HELP_TEXT, parse_mode=ParseMode.HTML, disable_web_page_preview=True,
    )


@main_router.message(Command("about"))
@main_router.message(F.text == ABOUT_TEXT)
async def cmd_about(message: Message) -> None:
    from cheatsheets.bot.search_router import search

    await message.answer(
        ABOUT.format(count=len(catalog.sheets), kr=len(search.guidelines),
                     credit=credit_line()),
        parse_mode=ParseMode.HTML,
    )


@main_router.message(Command("channel", "канал"))
async def cmd_channel(message: Message) -> None:
    if not CHANNEL_URL:
        await message.answer(
            "Канал пока не подключён. Добавьте его адрес в переменную "
            "окружения <code>CHANNEL_URL</code> и перезапустите бота.",
            parse_mode=ParseMode.HTML,
        )
        return
    await message.answer(
        "Канал ПОСТ·НЕО — разборы, обновления шпаргалок и новые рекомендации.",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="Открыть канал", url=CHANNEL_URL),
        ]]),
    )


@main_router.message(Command("tpn", "pp", "питание"))
@main_router.message(F.text == TPN_TEXT)
async def cmd_tpn(message: Message) -> None:
    # web_app работает только в личке; в группе даём обычную ссылку.
    button = (
        InlineKeyboardButton(text="🧬 Открыть калькулятор", web_app=WebAppInfo(url=TPN_URL))
        if message.chat.type == ChatType.PRIVATE
        else InlineKeyboardButton(text="🧬 Открыть калькулятор", url=TPN_URL)
    )
    await message.answer(
        "<b>Парентеральное питание</b>\n\n"
        "Объёмы растворов, GIR, калораж и осмолярность по массе, "
        "суткам жизни и заданной дотации. Предупреждает, если доза "
        "вышла за рекомендованный диапазон.\n\n"
        "Шкалы оценки — отдельной кнопкой: /scales.",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[button]]),
        parse_mode=ParseMode.HTML,
    )


@main_router.message(Command("materials", "spisok"))
async def cmd_materials(message: Message) -> None:
    lines = [f"<b>Шпаргалки ПОСТ·НЕО</b> · обновлено {catalog.generated}", ""]
    for category in catalog.categories():
        lines.append(f"<b>{category}</b>")
        for sheet in catalog.by_category(category):
            lines.append(f'• <a href="{sheet.url}">{sheet.title}</a>')
        lines.append("")
    lines.append("Прислать файлом: /shpory")
    await message.answer(
        "\n".join(lines), parse_mode=ParseMode.HTML, disable_web_page_preview=True,
    )


@main_router.message(F.text == SEARCH_TEXT)
async def btn_search(message: Message) -> None:
    await message.answer(ASK_QUERY, parse_mode=ParseMode.HTML)


@main_router.message(F.text == SHEETS_TEXT)
async def btn_sheets(message: Message) -> None:
    await send_root(message)


# --------------------------------------------------------------------------
# Сборка
# --------------------------------------------------------------------------
def build_dispatcher() -> Dispatcher:
    """Порядок роутеров важен: свободный текст ловится последним."""
    dp = Dispatcher()
    dp.include_router(main_router)        # команды и подписи кнопок
    dp.include_router(scales_router)      # кнопка «Шкалы»
    dp.include_router(cheatsheets_router) # /shpory и его колбэки
    dp.include_router(search_router)      # поиск, реестр, дозы и весь прочий текст
    return dp


async def on_startup(bot: Bot) -> None:
    await bot.set_my_commands(COMMANDS)
    me = await bot.get_me()
    log.info("Запущен @%s · шпаргалок: %d", me.username, len(catalog.sheets))


async def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    token = os.environ.get("BOT_TOKEN", "").strip()
    if not token:
        raise SystemExit("Задайте переменную окружения BOT_TOKEN")

    bot = Bot(token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    dp = build_dispatcher()
    dp.startup.register(on_startup)
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
