# -*- coding: utf-8 -*-
"""Роутер aiogram v3 для раздачи PDF-шпаргалок.

Подключение в существующий бот — две строки:

    from cheatsheets.bot.aiogram_router import cheatsheets_router
    dp.include_router(cheatsheets_router)

Команды: /shpory, /cheatsheets, /шпоры
Поиск:   /shpory гбн
"""
from __future__ import annotations

import logging

from aiogram import F, Router
from aiogram.enums import ParseMode
from aiogram.filters import Command, CommandObject
from aiogram.types import (
    BufferedInputFile,
    CallbackQuery,
    FSInputFile,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
)

from .catalog import Catalog, Cheatsheet

log = logging.getLogger(__name__)

cheatsheets_router = Router(name="cheatsheets")
catalog = Catalog()

CB_ROOT = "cs:root"
CB_CAT = "cs:cat:"
CB_GET = "cs:get:"


# --------------------------------------------------------------------------
# Клавиатуры
# --------------------------------------------------------------------------
def _root_keyboard() -> InlineKeyboardMarkup:
    rows = []
    for i, category in enumerate(catalog.categories()):
        count = len(catalog.by_category(category))
        rows.append([InlineKeyboardButton(
            text=f"{category} · {count}", callback_data=f"{CB_CAT}{i}",
        )])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _category_keyboard(index: int) -> InlineKeyboardMarkup:
    category = catalog.categories()[index]
    rows = [
        [InlineKeyboardButton(text=s.button, callback_data=f"{CB_GET}{s.id}")]
        for s in catalog.by_category(category)
    ]
    rows.append([InlineKeyboardButton(text="‹ Назад к разделам", callback_data=CB_ROOT)])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _results_keyboard(sheets: list[Cheatsheet]) -> InlineKeyboardMarkup:
    rows = [
        [InlineKeyboardButton(text=s.button, callback_data=f"{CB_GET}{s.id}")]
        for s in sheets
    ]
    rows.append([InlineKeyboardButton(text="‹ Все разделы", callback_data=CB_ROOT)])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _root_text() -> str:
    return (
        "<b>Шпаргалки неонатолога</b>\n"
        f"{len(catalog.sheets)} PDF · обновлено {catalog.generated}\n\n"
        "Выберите раздел. Поиск: <code>/shpory гбн</code>"
    )


# --------------------------------------------------------------------------
# Отправка PDF
# --------------------------------------------------------------------------
async def send_cheatsheet(message: Message, sheet: Cheatsheet) -> None:
    """Отправляет PDF, используя кэш file_id при повторных отправках."""
    cached = catalog.file_id(sheet.id)
    if cached:
        try:
            await message.answer_document(
                cached, caption=sheet.caption, parse_mode=ParseMode.HTML,
            )
            return
        except Exception:
            # file_id мог протухнуть (например, бот пересоздан) — зальём заново.
            log.warning("Кэшированный file_id для %s не сработал, заливаем файл", sheet.id)

    sent = await message.answer_document(
        FSInputFile(sheet.path, filename=f"{sheet.id}.pdf"),
        caption=sheet.caption,
        parse_mode=ParseMode.HTML,
    )
    if sent.document:
        catalog.remember_file_id(sheet.id, sent.document.file_id)


# --------------------------------------------------------------------------
# Хендлеры
# --------------------------------------------------------------------------
async def send_root(message: Message) -> None:
    """Корневое меню шпаргалок — общее для команды и кнопки на клавиатуре."""
    await message.answer(
        _root_text(), reply_markup=_root_keyboard(), parse_mode=ParseMode.HTML,
    )


@cheatsheets_router.message(Command("shpory", "cheatsheets", "шпоры"))
async def cmd_cheatsheets(message: Message, command: CommandObject) -> None:
    query = (command.args or "").strip()
    if query:
        hits = catalog.search(query)
        if not hits:
            await message.answer(
                f"По запросу «{query}» ничего не нашёл.\n"
                "Посмотрите список разделов: /shpory",
            )
            return
        if len(hits) == 1:
            await send_cheatsheet(message, hits[0])
            return
        await message.answer(
            f"Нашёл {len(hits)} шпаргалки по запросу «{query}»:",
            reply_markup=_results_keyboard(hits),
        )
        return

    await send_root(message)


@cheatsheets_router.callback_query(F.data == CB_ROOT)
async def cb_root(call: CallbackQuery) -> None:
    await call.message.edit_text(
        _root_text(), reply_markup=_root_keyboard(), parse_mode=ParseMode.HTML,
    )
    await call.answer()


@cheatsheets_router.callback_query(F.data.startswith(CB_CAT))
async def cb_category(call: CallbackQuery) -> None:
    try:
        index = int(call.data[len(CB_CAT):])
        category = catalog.categories()[index]
    except (ValueError, IndexError):
        await call.answer("Раздел не найден, откройте /shpory заново", show_alert=True)
        return

    lines = [f"<b>{category}</b>", ""]
    for s in catalog.by_category(category):
        lines.append(f"• <b>{s.title}</b>")
        if s.summary:
            lines.append(f"  {s.summary}")
    await call.message.edit_text(
        "\n".join(lines),
        reply_markup=_category_keyboard(index),
        parse_mode=ParseMode.HTML,
    )
    await call.answer()


@cheatsheets_router.callback_query(F.data.startswith(CB_GET))
async def cb_get(call: CallbackQuery) -> None:
    sheet = catalog.get(call.data[len(CB_GET):])
    if not sheet:
        await call.answer("Шпаргалка не найдена", show_alert=True)
        return
    await call.answer("Отправляю…")
    await send_cheatsheet(call.message, sheet)
