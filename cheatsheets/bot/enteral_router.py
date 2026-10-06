# -*- coding: utf-8 -*-
"""Роутер aiogram v3: вход в мини-приложение «Энтеральное питание».

Вложен в cheatsheets_router (см. конец aiogram_router.py), как и седация:
работает в любом боте, где подключены шпаргалки.

    /enteral      что умеет и кнопка мини-приложения

Состав смесей и нормы — data/enteral.json, тот же файл, что у приложения.
"""
from __future__ import annotations

import json
import os

from aiogram import F, Router
from aiogram.enums import ChatType, ParseMode
from aiogram.filters import Command
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message, WebAppInfo

enteral_router = Router(name="enteral")

ENTERAL_URL = os.environ.get("ENTERAL_WEBAPP_URL", "https://jew1ik.github.io/tpn/enteral/")
DATA_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                         "data", "enteral.json")

BUTTON_LABELS = {"🍼 Энтеральное питание", "Энтеральное питание", "энтеральное питание"}


def _num(v: float) -> str:
    return f"{v:g}".replace(".", ",")


def intro() -> str:
    with open(DATA_FILE, encoding="utf-8") as f:
        data = json.load(f)
    rows = ["<pre>смесь          ккал белок углев.",
            *[f"{x['short']:<14} {_num(x['kcal']):>4} {x['protein']:>5.1f} {x['carbs']:>6.1f}"
              .replace(".", ",") for x in data["formulas"]],
            "</pre>"]
    return (
        "<b>🍼 Энтеральное питание</b>\n\n"
        "Масса, смесь и объём — приложение считает калории, белок, углеводы "
        "и жиры на кг в сутки, сравнивает с нормой и подсказывает, сколько "
        "мл/кг нужно до нижней границы. Нормы: недоношенные &lt; 1800 г — "
        "ESPGHAN 2022, доношенные — МР 2.3.1.0253-21.\n\n"
        "Состав на 100 мл:\n" + "\n".join(rows)
    )


def _keyboard(chat_type: str) -> InlineKeyboardMarkup:
    button = (InlineKeyboardButton(text="🍼 Открыть", web_app=WebAppInfo(url=ENTERAL_URL))
              if chat_type == ChatType.PRIVATE
              else InlineKeyboardButton(text="🍼 Открыть", url=ENTERAL_URL))
    return InlineKeyboardMarkup(inline_keyboard=[[button]])


async def send_intro(message: Message) -> None:
    await message.answer(intro(), reply_markup=_keyboard(message.chat.type),
                         parse_mode=ParseMode.HTML)


@enteral_router.message(Command("enteral", "ep", "энтеральное"))
async def cmd_enteral(message: Message) -> None:
    await send_intro(message)


@enteral_router.message(F.text.in_(BUTTON_LABELS))
async def btn_enteral(message: Message) -> None:
    await send_intro(message)
