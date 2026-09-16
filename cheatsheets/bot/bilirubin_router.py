# -*- coding: utf-8 -*-
"""Роутер aiogram v3: вход в калькулятор билирубина.

Подключение:

    from cheatsheets.bot.bilirubin_router import bilirubin_router
    dp.include_router(bilirubin_router)

Одна команда — /bili. Она открывает мини-приложение: пороги фототерапии и
ОЗПК по таблицам КР МЗ РФ, номограмма, почасовой прирост, объём ОЗПК и
расчёт трансфузии. Расчёта текстом в чате нет намеренно: набирать команду
с аргументами у постели пациента неудобно, а в боте всё остальное кнопочное.
"""
from __future__ import annotations

import os

from aiogram import Router
from aiogram.enums import ChatType, ParseMode
from aiogram.filters import Command
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    WebAppInfo,
)

bilirubin_router = Router(name="bilirubin")

WEBAPP_URL = os.environ.get("BILI_WEBAPP_URL", "https://jew1ik.github.io/tpn/bili/")

INTRO = (
    "<b>Билирубин</b>\n\n"
    "Пороги фототерапии и ОЗПК по таблицам клинических рекомендаций МЗ РФ: "
    "строка по гестационному возрасту, колонка по часам жизни.\n\n"
    "В калькуляторе также номограмма, почасовой прирост, отношение "
    "билирубин/альбумин, объём ОЗПК и расчёт трансфузии эритроцитной взвеси."
)


def _keyboard(chat_type: str) -> InlineKeyboardMarkup:
    # Кнопка web_app работает только в личных чатах; в группах даём ссылку.
    button = (
        InlineKeyboardButton(text="🧮 Открыть калькулятор",
                             web_app=WebAppInfo(url=WEBAPP_URL))
        if chat_type == ChatType.PRIVATE
        else InlineKeyboardButton(text="🧮 Открыть калькулятор", url=WEBAPP_URL)
    )
    return InlineKeyboardMarkup(inline_keyboard=[[button]])


@bilirubin_router.message(Command("bili", "bilirubin", "билирубин"))
async def cmd_bili(message: Message) -> None:
    await message.answer(
        INTRO,
        reply_markup=_keyboard(message.chat.type),
        parse_mode=ParseMode.HTML,
    )
