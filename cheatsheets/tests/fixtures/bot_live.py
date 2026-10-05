# -*- coding: utf-8 -*-
"""Модель bot.py с сервера: те же импорты, клавиатура, меню команд и порядок
роутеров, что у живого бота после прошлого обновления.

Нужна tests/test_patch_bot.py: на ней проверяется, что deploy/patch_bot.py
правит такой файл аккуратно, а бот после правки отвечает как надо.
"""
import asyncio
import logging
import os

from aiogram import Bot, Dispatcher, F
from aiogram.filters import Command, CommandStart
from aiogram.types import (
    BotCommand, KeyboardButton, Message, ReplyKeyboardMarkup, WebAppInfo,
)

from cheatsheets.bot.aiogram_router import cheatsheets_router
from bot_kr.kr_router import kr_router
from cheatsheets.bot.scales_router import scales_router
from cheatsheets.bot.keyboard import scales_button

TPN_URL = "https://jew1ik.github.io/tpn/"

HELP = (
    "<b>Как пользоваться</b>\n\n"
    "<b>1. Поиск</b>\n"
    "Напиши диагноз.\n\n"
    "<b>2. Шпаргалки</b>\n"
    "Команда /shpory.\n\n"
    "<b>3. Шкалы</b>\n"
    "Пороги ФТ и ОЗПК по КР.\n\n"
    "<b>4. Питание</b>\n"
    "Калькулятор ПП.\n\n"
)

MENU = (
    "🔎 <b>Поиск</b> · напиши диагноз\n\n"
    "📊 <b>Шкалы</b> · nSOFA, NEOMOD, Сарнат, VIS: <code>/scales</code>\n\n"
    "🧬 <b>Питание</b> · калькулятор\n\n"
)


def main_kb() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="🔎 Найти рекомендации")],
            [KeyboardButton(text="🧬 Парентеральное питание", web_app=WebAppInfo(url=TPN_URL))],
            [KeyboardButton(text="📄 Шпаргалки"), scales_button()],
            [KeyboardButton(text="ℹ️ О проекте"), KeyboardButton(text="❓ Помощь")],
        ],
        resize_keyboard=True,
    )


dp = Dispatcher()


@dp.message(CommandStart())
async def start(message: Message) -> None:
    await message.answer(MENU, reply_markup=main_kb())


@dp.message(F.text == "🟡 Билирубин")
async def btn_bili(message: Message) -> None:
    await message.answer("Пороги билирубина: /bili")


dp.include_router(cheatsheets_router)

dp.include_router(scales_router)
dp.include_router(kr_router)


async def on_startup(bot: Bot) -> None:
    await bot.set_my_commands([
        BotCommand(command="start", description="Главное меню"),
        BotCommand(command="search", description="Найти клинические рекомендации"),
        BotCommand(command="shpory", description="Шпаргалки PDF по разделам"),
        BotCommand(command="scales", description="Шкалы: nSOFA, NEOMOD, Сарнат, VIS"),
        BotCommand(command="tpn", description="Парентеральное питание"),
        BotCommand(command="help", description="Как пользоваться ботом"),
    ])


async def main() -> None:
    await dp.start_polling(Bot(os.environ["BOT_TOKEN"]))
