# -*- coding: utf-8 -*-
"""Расчёт порогов билирубина.

Точная копия логики калькулятора bili/index.html, работающая на тех же
данных из data/bilirubin.json. Нужна, чтобы бот мог посчитать пороги
текстом, не открывая мини-приложение.
"""
from __future__ import annotations

import json
import math
import os
from dataclasses import dataclass

DATA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "bilirubin.json")

with open(DATA_PATH, encoding="utf-8") as _f:
    DATA = json.load(_f)

MGDL_FACTOR = DATA["mgdl_factor"]
RISK_FACTORS = {f["id"]: f for f in DATA["risk_factors"]}

# Синонимы для разбора текстовой команды: «/bili 36 24 190 гбн сепсис»
RISK_ALIASES = {
    "гбн": "hemolysis", "гемолиз": "hemolysis", "кумбс": "hemolysis",
    "г6фд": "g6pd", "g6pd": "g6pd",
    "асфиксия": "asphyxia",
    "сепсис": "sepsis",
    "ацидоз": "acidosis",
    "летаргия": "lethargy",
    "альбумин": "albumin", "гипоальбуминемия": "albumin",
}


@dataclass
class Thresholds:
    phototherapy: float
    exchange: float
    mode: str          # "term" | "preterm"
    group_label: str
    group_desc: str


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def r(v: float) -> int:
    """Округление «половина вверх».

    Встроенный round() в Python банковский: round(162.5) == 162, тогда как
    Math.round в калькуляторе даёт 163. Расхождение в единицу на пороге
    билирубина недопустимо, поэтому округляем одинаково.
    """
    return math.floor(v + 0.5)


def _interp(series: list, hours: list, h: float) -> float:
    h = _clamp(h, hours[0], hours[-1])
    for i in range(1, len(hours)):
        if h <= hours[i]:
            t = (h - hours[i - 1]) / (hours[i] - hours[i - 1])
            return series[i - 1] + t * (series[i] - series[i - 1])
    return series[-1]


def risk_group_id(ga: float, has_risk: bool) -> str:
    if ga >= 38:
        return "med" if has_risk else "low"
    return "high" if has_risk else "med"


def thresholds(ga: float, hours: float, has_risk: bool) -> Thresholds:
    """Пороги ФТ и ОЗПК в мкмоль/л.

    ga — гестационный возраст в неделях (можно дробный),
    hours — возраст в часах, has_risk — есть ли хоть один фактор риска.
    """
    term = DATA["term"]
    if ga >= term["ga_min"]:
        gid = risk_group_id(ga, has_risk)
        group = next(g for g in term["risk_groups"] if g["id"] == gid)
        return Thresholds(
            phototherapy=_interp(term["phototherapy"][gid], term["hours"], hours),
            exchange=_interp(term["exchange"][gid], term["hours"], hours),
            mode="term",
            group_label=group["label"],
            group_desc=group["desc"],
        )

    bands = DATA["preterm"]["bands"]
    band = next((b for b in bands if ga < b["ga_max"]), bands[-1])
    # Нижняя граница диапазона — для больного или нестабильного ребёнка.
    idx = 0 if has_risk else 1
    return Thresholds(
        phototherapy=band["phototherapy"][idx],
        exchange=band["exchange"][idx],
        mode="preterm",
        group_label=band["label"],
        group_desc=(
            "нестабилен — нижняя граница диапазона" if has_risk
            else "стабилен — верхняя граница диапазона"
        ),
    )


def status(bili: float, t: Thresholds) -> tuple[str, str, str]:
    """-> (тон, заголовок, пояснение). Тона совпадают с калькулятором."""
    if bili >= t.exchange:
        return ("danger", "Порог ОЗПК достигнут",
                "Интенсивная ФТ, ВВИГ при изоиммунном гемолизе, заказ компонентов, готовность к ОЗПК.")
    if bili >= t.exchange - 35:
        return ("danger", "Вплотную к порогу ОЗПК",
                f"До порога {r(t.exchange - bili)} мкмоль/л. Кровь заказать заранее, контроль через 2–4 ч.")
    if bili >= t.phototherapy:
        return ("warn", "Показана фототерапия",
                f"Порог превышен на {r(bili - t.phototherapy)} мкмоль/л. Контроль через 4–6 ч.")
    if bili >= t.phototherapy - 35:
        return ("info", "Близко к порогу фототерапии",
                f"До порога {r(t.phototherapy - bili)} мкмоль/л. Контроль через 6–12 ч.")
    return ("ok", "Ниже порога фототерапии",
            f"Запас до ФТ {r(t.phototherapy - bili)} мкмоль/л. Плановый контроль.")


def hourly_rise_band(rise: float) -> dict:
    for band in DATA["hourly_rise"]:
        if band["max"] is None or rise < band["max"]:
            return band
    return DATA["hourly_rise"][-1]


def exchange_volumes(weight_kg: float) -> dict:
    ev = DATA["exchange_volume"]
    total = ev["bcc_ml_per_kg"] * ev["volumes_bcc"] * weight_kg
    return {
        "total": total,
        "rbc": total * ev["rbc_fraction"],
        "ffp": total * ev["ffp_fraction"],
        "partial": [ev["partial_ml_per_kg"][0] * weight_kg, ev["partial_ml_per_kg"][1] * weight_kg],
    }


def transfusion_volume(hb_now: float, hb_target: float, weight_kg: float) -> float:
    tr = DATA["transfusion"]
    return (hb_target - hb_now) * weight_kg * tr["bcc_ml_per_kg"] / tr["rbc_hb_g_l"]


def parse_risks(tokens: list[str]) -> list[str]:
    """Достаёт факторы риска из словесных хвостов команды."""
    found = []
    for tok in tokens:
        key = tok.strip().strip(",").lower()
        rid = RISK_ALIASES.get(key)
        if rid and rid not in found:
            found.append(rid)
    return found
