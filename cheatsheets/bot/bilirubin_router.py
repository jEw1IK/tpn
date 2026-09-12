# -*- coding: utf-8 -*-
"""Роутер aiogram v3: калькулятор билирубина.

Подключение:

    from cheatsheets.bot.bilirubin_router import bilirubin_router
    dp.include_router(bilirubin_router)

Два режима:
  /bili                      — кнопка, открывающая мини-приложение
  /bili 36 24 190 гбн        — мгновенный расчёт текстом, без открытия окна
                               (ГВ в неделях, часы жизни, билирубин, факторы риска)
"""
from __future__ import annotations

import os

from aiogram import Router
from aiogram.enums import ChatType, ParseMode
from aiogram.filters import Command, CommandObject
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    WebAppInfo,
)

from ..bilirubin import (
    DATA,
    RISK_FACTORS,
    exchange_volumes,
    hourly_rise_band,
    parse_risks,
    r,
    status,
    thresholds,
)

bilirubin_router = Router(name="bilirubin")

WEBAPP_URL = os.environ.get("BILI_WEBAPP_URL", "https://jew1ik.github.io/tpn/bili/")

TONE_ICON = {"ok": "✅", "info": "ℹ️", "warn": "⚠️", "danger": "🔴"}

USAGE = (
    "<b>Калькулятор билирубина</b>\n\n"
    "Открой мини-приложение кнопкой ниже — там пороги, номограмма, "
    "почасовой прирост, объём ОЗПК и расчёт трансфузии.\n\n"
    "Или посчитай пороги прямо здесь:\n"
    "<code>/bili ГВ ЧАСЫ БИЛИРУБИН [факторы риска]</code>\n\n"
    "Примеры:\n"
    "<code>/bili 38 60 250</code>\n"
    "<code>/bili 36 24 190 гбн</code>\n"
    "<code>/bili 30 48 180 гбн сепсис</code>\n\n"
    "Факторы риска: гбн, г6фд, асфиксия, сепсис, ацидоз, летаргия, альбумин."
)


def _keyboard(chat_type: str) -> InlineKeyboardMarkup:
    # Кнопка web_app работает только в личных чатах; в группах даём обычную ссылку.
    if chat_type == ChatType.PRIVATE:
        button = InlineKeyboardButton(
            text="🧮 Открыть калькулятор", web_app=WebAppInfo(url=WEBAPP_URL)
        )
    else:
        button = InlineKeyboardButton(text="🧮 Открыть калькулятор", url=WEBAPP_URL)
    return InlineKeyboardMarkup(inline_keyboard=[[button]])


def _format(ga: float, hours: float, bili: float, risk_ids: list[str]) -> str:
    t = thresholds(ga, hours, bool(risk_ids))
    tone, head, detail = status(bili, t)

    ga_txt = f"{ga:g}".replace(".", ",")
    risks_txt = ", ".join(RISK_FACTORS[i]["short"] for i in risk_ids) if risk_ids else "не указаны"

    lines = [
        "<b>Билирубин: пороги</b>",
        "",
        f"Пациент: ГВ {ga_txt} нед, {r(hours)} ч жизни",
        f"Факторы риска: {risks_txt}",
    ]
    if t.mode == "term":
        lines.append(f"Группа риска: <b>{t.group_label.lower()}</b> — {t.group_desc}")
    else:
        lines.append(f"Недоношенный {t.group_label} — {t.group_desc}")

    lines += [
        "",
        f"Порог фототерапии: <b>{r(t.phototherapy)}</b> мкмоль/л",
        f"Порог ОЗПК: <b>{r(t.exchange)}</b> мкмоль/л",
        f"Текущий билирубин: <b>{r(bili)}</b> мкмоль/л",
        "",
        f"{TONE_ICON[tone]} <b>{head}</b>",
        detail,
    ]

    if hours < 24:
        lines += ["", "⚠️ Первые сутки: любая видимая желтуха патологическая, "
                      "кривые в этом интервале наименее надёжны — решать клинически."]
    if t.mode == "term" and not risk_ids and ga < 38:
        lines += ["", "ℹ️ При 35–37⁶ нед любой фактор риска переводит в высокий риск "
                      "и заметно снижает пороги — проверь, точно ли их нет."]
    return "\n".join(lines)


@bilirubin_router.message(Command("bili", "bilirubin", "билирубин"))
async def cmd_bili(message: Message, command: CommandObject) -> None:
    args = (command.args or "").split()
    kb = _keyboard(message.chat.type)

    if not args:
        await message.answer(USAGE, reply_markup=kb, parse_mode=ParseMode.HTML)
        return

    numbers, words = [], []
    for tok in args:
        try:
            numbers.append(float(tok.replace(",", ".")))
        except ValueError:
            words.append(tok)

    if len(numbers) < 3:
        await message.answer(
            "Нужны три числа: гестационный возраст в неделях, часы жизни и билирубин.\n\n"
            + USAGE,
            reply_markup=kb, parse_mode=ParseMode.HTML,
        )
        return

    ga, hours, bili = numbers[0], numbers[1], numbers[2]
    if not (22 <= ga <= 44):
        await message.answer("Гестационный возраст должен быть от 22 до 44 недель.")
        return
    if not (0 <= hours <= 336):
        await message.answer("Возраст в часах должен быть от 0 до 336 (14 суток).")
        return
    if not (0 < bili <= 900):
        await message.answer("Билирубин должен быть от 1 до 900 мкмоль/л.")
        return

    unknown = [w for w in words if not parse_risks([w])]
    risk_ids = parse_risks(words)
    text = _format(ga, hours, bili, risk_ids)
    if unknown:
        text += "\n\n<i>Не понял и пропустил: " + ", ".join(unknown) + "</i>"

    await message.answer(text, reply_markup=kb, parse_mode=ParseMode.HTML)


@bilirubin_router.message(Command("ozpk", "озпк"))
async def cmd_ozpk(message: Message, command: CommandObject) -> None:
    """Быстрый расчёт объёма ОЗПК: /ozpk 3200 (масса в граммах или килограммах)."""
    args = (command.args or "").split()
    if not args:
        await message.answer(
            "Объём ОЗПК по массе тела:\n<code>/ozpk 3200</code> — в граммах\n"
            "<code>/ozpk 3,2</code> — в килограммах",
            parse_mode=ParseMode.HTML,
        )
        return
    try:
        value = float(args[0].replace(",", "."))
    except ValueError:
        await message.answer("Не понял массу тела. Пример: <code>/ozpk 3200</code>",
                             parse_mode=ParseMode.HTML)
        return

    kg = value / 1000 if value > 50 else value
    if not (0.3 <= kg <= 8):
        await message.answer("Масса тела должна быть от 300 г до 8 кг.")
        return

    v = exchange_volumes(kg)
    ev = DATA["exchange_volume"]
    await message.answer(
        f"<b>ОЗПК при массе {str(round(kg, 2)).replace('.', ',')} кг</b>\n\n"
        f"Общий объём ({ev['volumes_bcc']} ОЦК): <b>{r(v['total'])} мл</b>\n"
        f"Эритроцитная взвесь (2/3): <b>{r(v['rbc'])} мл</b>\n"
        f"СЗП (1/3): <b>{r(v['ffp'])} мл</b>\n\n"
        f"За цикл: {r(min(5 * kg, 20))} мл · вся процедура 2–3 ч\n"
        f"Кальция глюконат 10 %: 1–2 мл на каждые 100 мл\n\n"
        f"Частичное ОЗПК при отёчной форме: {r(v['partial'][0])}–{r(v['partial'][1])} мл "
        f"эритроцитов O(I) Rh−\n\n"
        f"<i>Ht смеси 0,45–0,50. Эритроциты не старше 3 суток, облучённые, "
        f"лейкоредуцированные, подогретые до 36–37 °C.</i>",
        parse_mode=ParseMode.HTML,
    )
