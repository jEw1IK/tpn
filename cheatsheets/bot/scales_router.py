# -*- coding: utf-8 -*-
"""Роутер aiogram v3: вход в мини-приложение со шкалами.

Подключение:

    from cheatsheets.bot.scales_router import scales_router
    dp.include_router(scales_router)

Одна команда — /scales. Открывает мини-приложение: nSOFA, NIPS и N-PASS
с подсчётом суммы и трактовкой. Считать шкалу текстом в чате смысла нет:
пунктов много, их удобнее отмечать пальцем.
"""
from __future__ import annotations

import os

from aiogram import F, Router
from aiogram.enums import ChatType, ParseMode
from aiogram.filters import Command
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    WebAppInfo,
)

scales_router = Router(name="scales")

WEBAPP_URL = os.environ.get("SCALES_WEBAPP_URL", "https://jew1ik.github.io/tpn/scales/")

INTRO = (
    "<b>Шкалы оценки новорождённого</b>\n\n"
    "<b>nSOFA</b> — степень полиорганной дисфункции, по приложению Г1 КР "
    "«Сепсис новорождённых». Оценивается ежедневно в ОРИТ.\n\n"
    "<b>NIPS</b> — острая и процедурная боль, 6 пунктов.\n\n"
    "<b>N-PASS</b> — боль, возбуждение и глубина седации: положительная сумма "
    "означает боль, отрицательная — седацию.\n\n"
    "Отмечаешь пункты — сумма и трактовка считаются сами."
)


def _keyboard(chat_type: str) -> InlineKeyboardMarkup:
    # Кнопка web_app работает только в личных чатах; в группах даём ссылку.
    button = (
        InlineKeyboardButton(text="📊 Открыть шкалы", web_app=WebAppInfo(url=WEBAPP_URL))
        if chat_type == ChatType.PRIVATE
        else InlineKeyboardButton(text="📊 Открыть шкалы", url=WEBAPP_URL)
    )
    return InlineKeyboardMarkup(inline_keyboard=[[button]])


# Подписи кнопки на реплай-клавиатуре. Сравнение точное, а не по вхождению:
# иначе роутер перехватывал бы поисковые запросы вроде «шкалы боли».
BUTTON_LABELS = {"📊 Шкалы", "Шкалы", "шкалы", "📊 Шкалы оценки", "Шкалы оценки"}


async def _send(message: Message) -> None:
    await message.answer(
        INTRO,
        reply_markup=_keyboard(message.chat.type),
        parse_mode=ParseMode.HTML,
    )


@scales_router.message(Command("scales", "shkaly"))
async def cmd_scales(message: Message) -> None:
    await _send(message)


@scales_router.message(F.text.in_(BUTTON_LABELS))
async def btn_scales(message: Message) -> None:
    """Нажатие кнопки на клавиатуре — чтобы не писать отдельный обработчик.

    ВАЖНО: подключать этот роутер ДО обработчика свободного текста, иначе
    поиск по клиническим рекомендациям перехватит нажатие первым.
    """
    await _send(message)
