# -*- coding: utf-8 -*-
"""Клавиатура бота: мини-приложения в один тап.

Три мини-приложения, каждое своей кнопкой: энтеральное питание, седация
и шкалы оценки. Калькулятор парентерального питания из бота убран. Открываются в один тап, без промежуточного сообщения
«нажмите здесь».

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
from .enteral_router import ENTERAL_URL
from .sedation_router import SEDATION_URL

# Калькулятор ПП убран. Адрес теперь ведёт на страницу со списком мини-приложений;
# имя и tpn_button() оставлены, чтобы чужой bot.py с их импортом не упал на старте.
TPN_URL = os.environ.get("TPN_WEBAPP_URL", "https://jew1ik.github.io/tpn/")

DEFAULT_TEXT = "📊 Шкалы"
TPN_TEXT = "🧬 Парентеральное питание"
SEDATION_TEXT = "💉 Седация"
ENTERAL_TEXT = "🍼 Энтеральное питание"
SEARCH_TEXT = "🔎 Найти рекомендации"
SHEETS_TEXT = "📄 Шпаргалки"
ABOUT_TEXT = "ℹ️ О проекте"
HELP_TEXT_BTN = "❓ Помощь"


def scales_button(text: str = DEFAULT_TEXT, url: str = None) -> KeyboardButton:
    """Кнопка, открывающая мини-приложение на вкладке «Шкалы»."""
    return KeyboardButton(text=text, web_app=WebAppInfo(url=url or WEBAPP_URL))


def tpn_button(text: str = TPN_TEXT, url: str = None) -> KeyboardButton:
    """Устарело: калькулятора ПП больше нет, кнопка открывает список мини-приложений.

    Оставлена только для совместимости — в main_keyboard() её нет.
    """
    return KeyboardButton(text=text, web_app=WebAppInfo(url=url or TPN_URL))


def sedation_button(text: str = SEDATION_TEXT, url: str = None) -> KeyboardButton:
    """Кнопка калькулятора седации: до скольки развести мидазолам и фентанил."""
    return KeyboardButton(text=text, web_app=WebAppInfo(url=url or SEDATION_URL))


def enteral_button(text: str = ENTERAL_TEXT, url: str = None) -> KeyboardButton:
    """Кнопка анализа энтерального питания: ккал, белок, углеводы на смесях."""
    return KeyboardButton(text=text, web_app=WebAppInfo(url=url or ENTERAL_URL))


def main_keyboard(chat_type: str = ChatType.PRIVATE) -> ReplyKeyboardMarkup:
    """Основная клавиатура. В группах — без web_app, иначе Telegram её отклонит."""
    private = chat_type == ChatType.PRIVATE
    sedation = sedation_button() if private else KeyboardButton(text=SEDATION_TEXT)
    enteral = enteral_button() if private else KeyboardButton(text=ENTERAL_TEXT)
    scales = scales_button() if private else KeyboardButton(text=DEFAULT_TEXT)
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text=SEARCH_TEXT)],
            [enteral],
            [KeyboardButton(text=SHEETS_TEXT), scales, sedation],
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


def sedation_url() -> str:
    return SEDATION_URL
