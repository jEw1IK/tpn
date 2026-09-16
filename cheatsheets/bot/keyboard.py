# -*- coding: utf-8 -*-
"""Клавиатура бота: мини-приложения в один тап.

Два инструмента живут в одном мини-приложении, на разных вкладках:
парентеральное питание и шкалы. Кнопка сразу открывает нужную вкладку —
без промежуточного сообщения «нажмите здесь».

    from cheatsheets.bot.keyboard import main_keyboard, scales_button

    await message.answer("…", reply_markup=main_keyboard(message.chat.type))

ВАЖНО: кнопки web_app в реплай-клавиатуре работают только в личных чатах.
В группе Telegram отклонит такую клавиатуру целиком, поэтому там
main_keyboard() отдаёт те же кнопки обычным текстом: их ловят роутеры
и отвечают сообщением со ссылкой.
"""
from __future__ import annotations

import os

from aiogram.enums import ChatType
from aiogram.types import KeyboardButton, ReplyKeyboardMarkup, WebAppInfo

from .scales_router import WEBAPP_URL

TPN_URL = os.environ.get("TPN_WEBAPP_URL", "https://jew1ik.github.io/tpn/")

DEFAULT_TEXT = "📊 Шкалы"
TPN_TEXT = "🧬 Парентеральное питание"
SEARCH_TEXT = "🔎 Найти рекомендации"
SHEETS_TEXT = "📄 Шпаргалки"
ABOUT_TEXT = "ℹ️ О проекте"
HELP_TEXT_BTN = "❓ Помощь"


def scales_button(text: str = DEFAULT_TEXT, url: str = None) -> KeyboardButton:
    """Кнопка, открывающая мини-приложение на вкладке «Шкалы»."""
    return KeyboardButton(text=text, web_app=WebAppInfo(url=url or WEBAPP_URL))


def tpn_button(text: str = TPN_TEXT, url: str = None) -> KeyboardButton:
    """Кнопка, открывающая калькулятор парентерального питания."""
    return KeyboardButton(text=text, web_app=WebAppInfo(url=url or TPN_URL))


def main_keyboard(chat_type: str = ChatType.PRIVATE) -> ReplyKeyboardMarkup:
    """Основная клавиатура. В группах — без web_app, иначе Telegram её отклонит."""
    private = chat_type == ChatType.PRIVATE
    tpn = tpn_button() if private else KeyboardButton(text=TPN_TEXT)
    scales = scales_button() if private else KeyboardButton(text=DEFAULT_TEXT)
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text=SEARCH_TEXT)],
            [tpn],
            [KeyboardButton(text=SHEETS_TEXT), scales],
            [KeyboardButton(text=ABOUT_TEXT), KeyboardButton(text=HELP_TEXT_BTN)],
        ],
        resize_keyboard=True,
        input_field_placeholder="Диагноз, код МКБ-10 или препарат",
    )


def scales_url() -> str:
    """Адрес вкладки со шкалами — если кнопку собираете сами."""
    return WEBAPP_URL


def tpn_url() -> str:
    return TPN_URL
