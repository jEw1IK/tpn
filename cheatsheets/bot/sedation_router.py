# -*- coding: utf-8 -*-
"""Роутер aiogram v3: разведение мидазолама и фентанила.

Подключать отдельно не нужно: роутер вложен в cheatsheets_router
(см. конец aiogram_router.py), а тот в боте уже подключён и стоит раньше
поиска по свободному тексту. Так калькулятор заработает после обычного
обновления модуля, даже если правка bot.py не прошла.

    /sed                     что умеет и кнопка мини-приложения
    /sed 1200                мидазолам и фентанил на 1200 г по правилам по умолчанию
    мидазолам 468 0,1=0,03   прямо в чат, без команды
    фентанил 1180 2 амп
    мидазолам 5 мг до 6 мл скорость 0,2 3090   — проверить готовый шприц

Расчёт — bot/dilution.py, тот же, что в мини-приложении sedation/.
"""
from __future__ import annotations

import os
import re
from urllib.parse import urlencode

from aiogram import F, Router
from aiogram.enums import ChatType, ParseMode
from aiogram.filters import Command, CommandObject
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    WebAppInfo,
)

from .dilution import DRUGS, SETTINGS, Plan, check, dilute, num, parse_query

sedation_router = Router(name="sedation")

SEDATION_URL = os.environ.get("SEDATION_WEBAPP_URL", "https://jew1ik.github.io/tpn/sedation/")

# Подписи кнопки: точное совпадение, а не вхождение — иначе роутер
# перехватывал бы поисковые запросы вроде «седация при ИВЛ».
BUTTON_LABELS = {"💉 Седация", "Седация", "седация"}

INTRO = (
    "<b>💉 Седация: до скольки развести</b>\n\n"
    "Мидазолам 5 мг/мл и фентанил 50 мкг/мл. Задаёте правило «скорость = доза» — "
    "калькулятор говорит, до скольки развести, сколько набрать или какая доза "
    "идёт в уже готовом шприце.\n\n"
    "Можно прямо в чат:\n"
    "<code>мидазолам 1200</code>\n"
    "<code>фентанил 1180 0,1=1</code>\n"
    "<code>мидазолам 468 0,1=0,03 1 мг</code>\n"
    "<code>мидазолам 5 мг до 6 мл скорость 0,2 3090</code>\n\n"
    "Масса — в граммах, правило — через «=», количество — с единицами: "
    "2 амп, 1 мг, 100 мкг."
)


# --------------------------------------------------------------------------
# Кнопка мини-приложения
# --------------------------------------------------------------------------
def app_url(drug=None, weight_g=None, plan: Plan | None = None, **extra) -> str:
    """Ссылка на мини-приложение с уже введёнными числами."""
    params = {}
    if drug:
        params["drug"] = drug.id
    if weight_g:
        params["w"] = str(weight_g)
    if plan is not None:
        params["mode"] = plan.mode
        if plan.rule:
            params["rate"], params["dose"] = (f"{x:g}" for x in plan.rule)
        if plan.mode in ("dilute", "check"):
            params["amount"] = f"{plan.amount:g}"
        if plan.mode == "check":
            params["vol"] = f"{plan.volume:g}"
    params.update({k: f"{v:g}" for k, v in extra.items() if v})
    return SEDATION_URL + ("?" + urlencode(params) if params else "")


def app_button(chat_type: str, url: str = SEDATION_URL,
               text: str = "💉 Открыть калькулятор") -> InlineKeyboardButton:
    # web_app работает только в личке; в группе — обычная ссылка.
    if chat_type == ChatType.PRIVATE:
        return InlineKeyboardButton(text=text, web_app=WebAppInfo(url=url))
    return InlineKeyboardButton(text=text, url=url)


# --------------------------------------------------------------------------
# Текст карточки
# --------------------------------------------------------------------------
def _plural(n: int, one: str, few: str, many: str) -> str:
    a, b = abs(n) % 100, abs(n) % 10
    if 10 < a < 20:
        return many
    if 1 < b < 5:
        return few
    return one if b == 1 else many


def amount_phrase(drug, amount: float, draw_ml: float) -> str:
    """«1 ампула (5 мг = 1 мл)» или «0,2 мл (1 мг)»."""
    n = amount / drug.amp_amount
    units = f"{drug.amount(amount)} {drug.unit}"
    if abs(n - round(n)) < 1e-6 and round(n) >= 1:
        k = int(round(n))
        return f"{k} {_plural(k, 'ампула', 'ампулы', 'ампул')} ({units} = {num(draw_ml)} мл)"
    return f"{num(draw_ml)} мл ({units})"


def hours_text(hours: float) -> str:
    if not hours:
        return "—"
    return f"{num(hours / 24, 0)} сут" if hours >= 72 else f"{num(hours, 0)} ч"


def _table(plan: Plan) -> str:
    drug = plan.drug
    head = f"{'мл/ч':<7}{drug.dose_unit:<10}хватит"
    lines = [head]
    for r in plan.rows:
        rate = num(r.rate) + (" ◀" if r.current else "")
        dose = drug.dose(r.dose) + (" ⚠" if r.over else "")
        lines.append(f"{rate:<7}{dose:<10}{hours_text(r.hours)}")
    return "<pre>" + "\n".join(lines) + "</pre>"


def card(plan: Plan) -> str:
    drug = plan.drug
    head = f"💉 <b>{drug.name}</b> · {plan.weight_g} г"
    if not plan.ok:
        return f"{head}\n\n{plan.error}"

    out = [head]
    if plan.rule:
        out.append(f"Правило: {num(plan.rule[0])} мл/ч = {drug.dose(plan.rule[1])} {drug.dose_unit}")
    out.append("")

    conc = num(plan.conc, 3 if plan.conc < 1 else 2 if plan.conc < 10 else 1)
    if plan.mode == "dilute":
        out.append(f"<b>Развести до {num(plan.volume, 2)} мл</b>")
        out.append(f"{amount_phrase(drug, plan.amount, plan.draw_ml)} + "
                   f"{num(plan.diluent_ml, 2)} мл {SETTINGS.diluent}")
    elif plan.rows and any(r.current for r in plan.rows):
        # Врач спросил про скорость, которая стоит сейчас, — её и отвечаем первой.
        out.append(f"<b>{num(plan.work_rate)} мл/ч = {drug.dose(plan.work_dose)} {drug.dose_unit}</b>")
        out.append(f"{drug.amount(plan.amount)} {drug.unit} в {num(plan.volume, 2)} мл · "
                   f"1 мл/ч = {drug.dose(plan.per_rate)} {drug.dose_unit}")
    else:
        out.append(f"<b>1 мл/ч = {drug.dose(plan.per_rate)} {drug.dose_unit}</b>")
        out.append(f"{drug.amount(plan.amount)} {drug.unit} в {num(plan.volume, 2)} мл")
    syringe = f"шприц {plan.syringe_ml} мл" if plan.syringe_ml else "в шприц не влезает"
    out.append(f"Концентрация {conc} {drug.unit}/мл · {syringe}")
    if plan.rule:
        out.append(f"Проверка: {num(plan.rule[0])} мл/ч → "
                   f"{drug.dose(plan.rule_dose_actual)} {drug.dose_unit}")
    out.append(f"Хватит на {hours_text(plan.hours)} при {num(plan.work_rate)} мл/ч")

    if plan.alternative:
        alt = plan.alternative
        out.append("")
        out.append(f"💡 Удобнее: {amount_phrase(drug, alt.amount, alt.draw_ml)} "
                   f"до {num(alt.volume, 2)} мл — та же концентрация, хватит на "
                   f"{hours_text(alt.hours)}. {plan.alternative_why}")

    for warning in plan.warnings:
        out.append(f"⚠ {warning}")

    out.append("")
    out.append(_table(plan))
    return "\n".join(out)


FOOTER = (
    "<i>Другое правило или количество — допишите: "
    "<code>0,1=0,03</code>, <code>2 амп</code>, <code>1 мг</code>. "
    "Расчёт для сверки у постели, не заменяет назначение врача.</i>"
)


# --------------------------------------------------------------------------
# Ответы
# --------------------------------------------------------------------------
async def send_intro(message: Message) -> None:
    await message.answer(
        INTRO,
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[app_button(message.chat.type)]]),
        parse_mode=ParseMode.HTML,
    )


async def reply_calc(message: Message, text: str) -> None:
    q = parse_query(text)
    if q.problems:
        hint = "\n".join(f"• {p}" for p in q.problems)
        await message.answer(
            f"{hint}\n\nНапример: <code>мидазолам 1200</code>, "
            "<code>фентанил 1180 0,1=1</code>.",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[[app_button(message.chat.type)]]),
            parse_mode=ParseMode.HTML,
        )
        return

    drugs = [q.drug] if q.drug else list(DRUGS.values())
    for i, drug in enumerate(drugs):
        if q.mode == "check":
            amount = q.amount if q.amount else drug.amp_amount
            plan = check(drug, q.weight_g, amount, q.volume, rate=q.rate)
        else:
            plan = dilute(drug, q.weight_g, q.amount, q.rule)
        text_out = card(plan)
        if i == len(drugs) - 1:
            text_out += "\n\n" + FOOTER
        url = app_url(drug, q.weight_g, plan if plan.ok else None,
                      cur=q.rate if q.mode == "check" else None)
        await message.answer(
            text_out,
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
                app_button(message.chat.type, url, "💉 Открыть в калькуляторе"),
            ]]),
            parse_mode=ParseMode.HTML,
        )


# --------------------------------------------------------------------------
# Хендлеры
# --------------------------------------------------------------------------
@sedation_router.message(Command("sed", "sedation", "sedaciya", "седация"))
async def cmd_sed(message: Message, command: CommandObject) -> None:
    args = (command.args or "").strip()
    if not args:
        await send_intro(message)
        return
    await reply_calc(message, args)


@sedation_router.message(F.text.in_(BUTTON_LABELS))
async def btn_sed(message: Message) -> None:
    await send_intro(message)


_WORD_RE = re.compile(r"[a-zа-яё]+", re.IGNORECASE)


def mentions_drug(text: str) -> bool:
    """Короткое сообщение, которое начинается с препарата: «мидазолам 1200».

    Длинные фразы не трогаем — их разбирает поиск: молча угадать смысл
    в длинном тексте опаснее, чем не ответить калькулятором.
    """
    if not text or text.startswith("/") or len(text) > 80:
        return False
    words = _WORD_RE.findall(text.lower())
    if not words or len(text.split()) > 10:
        return False
    from .dilution import find_drug
    return any(find_drug(w) for w in words[:2])


@sedation_router.message(F.text.func(mentions_drug))
async def free_drug(message: Message) -> None:
    q = parse_query(message.text)
    if q.weight_g is None and not any(ch.isdigit() for ch in message.text):
        # Просто «фентанил» — расскажем, что можно, и попросим массу.
        await send_intro(message)
        return
    await reply_calc(message, message.text)
