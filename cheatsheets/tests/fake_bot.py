# -*- coding: utf-8 -*-
"""Подставной Bot: перехватывает вызовы Telegram API и складывает их в список.

Нужен, чтобы прогнать бота целиком без сети и без настоящего токена:
подаём обновления в диспетчер и смотрим, что бот попытался отправить.
"""
from __future__ import annotations

import datetime as dt

from aiogram import Bot
from aiogram.methods import (
    AnswerCallbackQuery, EditMessageText, GetMe, SendDocument, SendMessage,
    SetMyCommands,
)
from aiogram.types import Chat, Document, Message, User

TOKEN = "111111:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"

USER = User(id=42, is_bot=False, first_name="Врач", username="doc")
BOT_USER = User(id=1, is_bot=True, first_name="ПОСТ·НЕО", username="postneo1_bot")


def chat(chat_type: str = "private") -> Chat:
    return Chat(id=42 if chat_type == "private" else -100, type=chat_type)


class FakeBot(Bot):
    """Вместо запроса в Telegram — запись в self.calls."""

    def __init__(self):
        super().__init__(TOKEN)
        self.calls: list = []
        self._next_id = 1000

    async def __call__(self, method, request_timeout=None):
        self.calls.append(method)
        self._next_id += 1
        now = dt.datetime.now(dt.timezone.utc)

        if isinstance(method, (SendMessage, EditMessageText)):
            return Message(
                message_id=self._next_id, date=now, chat=chat(), from_user=BOT_USER,
                text=getattr(method, "text", ""),
            )
        if isinstance(method, SendDocument):
            return Message(
                message_id=self._next_id, date=now, chat=chat(), from_user=BOT_USER,
                document=Document(file_id="FILE_ID", file_unique_id="U"),
                caption=getattr(method, "caption", None),
            )
        if isinstance(method, GetMe):
            return BOT_USER
        if isinstance(method, (AnswerCallbackQuery, SetMyCommands)):
            return True
        return True

    # -- удобные выборки ---------------------------------------------------
    def texts(self) -> list[str]:
        return [
            m.text for m in self.calls
            if isinstance(m, (SendMessage, EditMessageText)) and m.text
        ]

    def documents(self) -> list:
        return [m for m in self.calls if isinstance(m, SendDocument)]

    def last(self):
        return self.calls[-1] if self.calls else None

    def reset(self) -> None:
        self.calls.clear()
