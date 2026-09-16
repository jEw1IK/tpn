# -*- coding: utf-8 -*-
"""Роутер aiogram v3: поиск по клиническим рекомендациям и дозам.

    from cheatsheets.bot.search_router import search_router
    dp.include_router(search_router)

ВАЖНО: подключать последним. Здесь живёт обработчик свободного текста —
он перехватит всё, до чего доберётся, включая подписи кнопок.

Команды: /search, /kr, /doza
"""
from __future__ import annotations

from aiogram import F, Router
from aiogram.enums import ParseMode
from aiogram.filters import Command, CommandObject
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
)

from .aiogram_router import CB_GET, catalog, send_cheatsheet
from .doses import Doses
from .search import Result, Search

search_router = Router(name="search")

search = Search(catalog)
doses = Doses()

CB_KR = "kr:show:"
CB_GRP = "kr:grp:"
CB_GRP_ROOT = "kr:grp"

# Разделы реестра — по первой букве кода МКБ-10. Это не выдумка бота,
# а структура самой классификации, поэтому раздел у КР всегда честный.
GROUPS = [
    ("P", "🍼 Перинатальный период"),
    ("Q", "🫀 Врождённые аномалии"),
    ("E", "🧪 Обмен и эндокринология"),
    ("A", "🦠 Инфекции"),
    ("B", "🦠 Инфекции"),
    ("G", "🧠 Нервная система"),
    ("H", "👁 Глаз и ухо"),
    ("D", "🩸 Кровь и иммунитет"),
    ("O", "🤰 Беременность и роды"),
]
OTHER = "📋 Прочее"


def _group_of(guideline) -> str:
    codes = guideline.codes
    letter = codes[0][:1].upper() if codes else ""
    for key, title in GROUPS:
        if letter == key:
            return title
    return OTHER


def _groups() -> dict:
    out = {}
    for g in search.guidelines.values():
        out.setdefault(_group_of(g), []).append(g)
    for items in out.values():
        items.sort(key=lambda g: g.name)
    # Порядок разделов фиксируем: перинатальный период всегда сверху.
    order = [t for _, t in GROUPS] + [OTHER]
    return {t: out[t] for t in dict.fromkeys(order) if t in out}


# --------------------------------------------------------------------------
# Ответ на поисковый запрос
# --------------------------------------------------------------------------
NOT_FOUND = (
    "Ничего не нашёл по запросу «{query}».\n\n"
    "Попробуйте иначе: <code>желтуха</code>, <code>ГБН</code>, "
    "<code>P23.0</code>, <code>сурфактант</code>, <code>сепсис</code>.\n"
    "Весь реестр рекомендаций — /kr, шпаргалки — /shpory."
)


def _answer(result: Result) -> tuple[str, InlineKeyboardMarkup | None]:
    if result.empty:
        return NOT_FOUND.format(query=result.query), None

    rows = []
    if result.guidelines:
        top = result.guidelines[0]
        text = top.guideline.card()
        rest = result.guidelines[1:4]
        if rest:
            text += "\n\n<b>Ещё по запросу:</b>"
            for hit in rest:
                text += f"\n• {hit.guideline.name}"
            rows += [
                [InlineKeyboardButton(
                    text=f"🔎 {hit.guideline.name[:55]}", callback_data=f"{CB_KR}{hit.guideline.id}",
                )]
                for hit in rest
            ]
    else:
        text = f"По запросу «{result.query}» рекомендаций не нашёл, но есть шпаргалки:"

    if result.sheets:
        rows = [
            [InlineKeyboardButton(text=f"📄 {s.title}", callback_data=f"{CB_GET}{s.id}")]
            for s in result.sheets[:3]
        ] + rows

    return text, InlineKeyboardMarkup(inline_keyboard=rows) if rows else None


async def reply_search(message: Message, query: str) -> None:
    text, markup = _answer(search.lookup(query))
    await message.answer(
        text, reply_markup=markup, parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


# --------------------------------------------------------------------------
# Команды
# --------------------------------------------------------------------------
ASK_QUERY = (
    "Что ищем? Напишите диагноз, код МКБ-10 или сокращение — "
    "<code>ГБН</code>, <code>P23.0</code>, <code>сурфактант</code>.\n"
    "Можно и просто сообщением в чат, без команды."
)


@search_router.message(Command("search", "poisk", "найти"))
async def cmd_search(message: Message, command: CommandObject) -> None:
    query = (command.args or "").strip()
    if not query:
        await message.answer(ASK_QUERY, parse_mode=ParseMode.HTML)
        return
    await reply_search(message, query)


@search_router.message(Command("kr", "кр"))
async def cmd_kr(message: Message, command: CommandObject) -> None:
    query = (command.args or "").strip()
    if query:
        await reply_search(message, query)
        return
    groups = _groups()
    rows = [
        [InlineKeyboardButton(text=f"{title} · {len(items)}", callback_data=f"{CB_GRP}{i}")]
        for i, (title, items) in enumerate(groups.items())
    ]
    await message.answer(
        f"<b>Клинические рекомендации МЗ РФ</b>\n"
        f"{len(search.guidelines)} документов профиля «Неонатология» и смежных.\n\n"
        "Выберите раздел или сразу напишите запрос.",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=rows),
        parse_mode=ParseMode.HTML,
    )


@search_router.message(Command("doza", "doses", "доза"))
async def cmd_doza(message: Message, command: CommandObject) -> None:
    query = (command.args or "").strip()
    if not query:
        await message.answer(
            "<b>Доза препарата</b>\n"
            "Напишите препарат и, если нужно, массу:\n"
            "<code>/doza гентамицин 1200</code>\n"
            "<code>/doza куросурф 1,2 кг</code>\n\n"
            "Есть: " + ", ".join(doses.names()) + ".",
            parse_mode=ParseMode.HTML,
        )
        return

    cards = doses.find(query)
    if not cards:
        await message.answer(
            f"Такого препарата у меня нет: «{query}».\n"
            "Посчитать могу: " + ", ".join(doses.names()) + ".",
        )
        return

    for card in cards:
        sheet = catalog.get(card.sheet_id)
        markup = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(
            text=f"📄 {sheet.title}", callback_data=f"{CB_GET}{sheet.id}",
        )]]) if sheet else None
        await message.answer(card.text(), reply_markup=markup, parse_mode=ParseMode.HTML)


# --------------------------------------------------------------------------
# Колбэки реестра
# --------------------------------------------------------------------------
@search_router.callback_query(F.data.startswith(CB_GRP))
async def cb_group(call: CallbackQuery) -> None:
    groups = _groups()
    try:
        title = list(groups)[int(call.data[len(CB_GRP):])]
    except (ValueError, IndexError):
        await call.answer("Раздел не найден, откройте /kr заново", show_alert=True)
        return
    items = groups[title]
    rows = [
        [InlineKeyboardButton(text=g.name[:60], callback_data=f"{CB_KR}{g.id}")]
        for g in items
    ]
    rows.append([InlineKeyboardButton(text="‹ Все разделы", callback_data=CB_GRP_ROOT)])
    await call.message.edit_text(
        f"<b>{title}</b>\n{len(items)} рекомендаций",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=rows),
        parse_mode=ParseMode.HTML,
    )
    await call.answer()


@search_router.callback_query(F.data == CB_GRP_ROOT)
async def cb_group_root(call: CallbackQuery) -> None:
    groups = _groups()
    rows = [
        [InlineKeyboardButton(text=f"{title} · {len(items)}", callback_data=f"{CB_GRP}{i}")]
        for i, (title, items) in enumerate(groups.items())
    ]
    await call.message.edit_text(
        f"<b>Клинические рекомендации МЗ РФ</b>\n{len(search.guidelines)} документов.",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=rows),
        parse_mode=ParseMode.HTML,
    )
    await call.answer()


@search_router.callback_query(F.data.startswith(CB_KR))
async def cb_guideline(call: CallbackQuery) -> None:
    guideline = search.guidelines.get(call.data[len(CB_KR):])
    if not guideline:
        await call.answer("Рекомендация не найдена", show_alert=True)
        return
    sheets = catalog.by_guideline(guideline.id)
    rows = [
        [InlineKeyboardButton(text=f"📄 {s.title}", callback_data=f"{CB_GET}{s.id}")]
        for s in sheets
    ]
    await call.message.answer(
        guideline.card(),
        reply_markup=InlineKeyboardMarkup(inline_keyboard=rows) if rows else None,
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )
    await call.answer()


# --------------------------------------------------------------------------
# Свободный текст — последним обработчиком во всём боте
# --------------------------------------------------------------------------
@search_router.message(F.text & ~F.text.startswith("/"))
async def free_text(message: Message) -> None:
    await reply_search(message, message.text)
