# -*- coding: utf-8 -*-
"""Готовая кнопка «Шкалы» для реплай-клавиатуры бота.

Открывает мини-приложение сразу на вкладке со шкалами — в один тап,
как кнопка парентерального питания, без промежуточного сообщения.

    from cheatsheets.bot.keyboard import scales_button

    ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="🔎 Найти рекомендации")],
            [KeyboardButton(text="🧬 Парентеральное питание", web_app=WebAppInfo(url=TPN_URL))],
            [KeyboardButton(text="📄 Шпаргалки"), scales_button()],
            [KeyboardButton(text="ℹ️ О проекте"), KeyboardButton(text="❓ Помощь")],
        ],
        resize_keyboard=True,
    )

ВАЖНО: кнопки web_app в реплай-клавиатуре работают только в личных чатах.
Если бот отдаёт эту клавиатуру в группе, Telegram её отклонит — для групп
используйте обычную KeyboardButton с текстом «📊 Шкалы»: её поймает
scales_router и ответит сообщением с инлайн-кнопкой.
"""
from __future__ import annotations

from aiogram.types import KeyboardButton, WebAppInfo

from .scales_router import WEBAPP_URL

DEFAULT_TEXT = "📊 Шкалы"


def scales_button(text: str = DEFAULT_TEXT, url: str = None) -> KeyboardButton:
    """Кнопка, открывающая мини-приложение на вкладке «Шкалы»."""
    return KeyboardButton(text=text, web_app=WebAppInfo(url=url or WEBAPP_URL))


def scales_url() -> str:
    """Адрес вкладки со шкалами — если кнопку собираете сами."""
    return WEBAPP_URL
