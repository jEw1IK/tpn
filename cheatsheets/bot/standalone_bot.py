#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Минимальный самостоятельный бот — для проверки шпаргалок без основного бота.

    pip install aiogram
    export BOT_TOKEN=123456:AA...
    python -m cheatsheets.bot.standalone_bot
"""
from __future__ import annotations

import asyncio
import logging
import os
import sys

from aiogram import Bot, Dispatcher
from aiogram.filters import CommandStart
from aiogram.types import Message

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from cheatsheets.bot.aiogram_router import cheatsheets_router  # noqa: E402
from cheatsheets.bot.bilirubin_router import bilirubin_router  # noqa: E402

dp = Dispatcher()
dp.include_router(cheatsheets_router)
dp.include_router(bilirubin_router)


@dp.message(CommandStart())
async def start(message: Message) -> None:
    await message.answer(
        "Привет!\n"
        "/shpory — шпаргалки в PDF\n"
        "/bili — калькулятор билирубина"
    )


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    token = os.environ.get("BOT_TOKEN")
    if not token:
        raise SystemExit("Задайте переменную окружения BOT_TOKEN")
    await dp.start_polling(Bot(token))


if __name__ == "__main__":
    asyncio.run(main())
