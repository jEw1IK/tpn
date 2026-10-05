# -*- coding: utf-8 -*-
"""Заглушка собственного поиска бота: ловит любой текст, как настоящий."""
from aiogram import F, Router
from aiogram.types import Message

kr_router = Router(name="kr")


@kr_router.message(F.text)
async def any_text(message: Message) -> None:
    await message.answer("KR: " + message.text)
