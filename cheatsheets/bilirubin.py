# -*- coding: utf-8 -*-
"""Расчёт порогов билирубина.

Логика полностью повторяет калькулятор bili/index.html и работает на тех же
данных из data/bilirubin.json. Нужна, чтобы бот считал пороги текстом,
не открывая мини-приложение.

Две шкалы:
  kr_rf — критерии КР МЗ РФ («New 2017 revised Kobe University criteria»).
          Таблица СТУПЕНЧАТАЯ: значение действует на весь возрастной интервал,
          интерполировать нельзя. Три уровня: стандартная ФТ, интенсивная ФТ, ОЗПК.
  aap   — номограммы AAP 2004 для ГВ >= 35 нед, непрерывные, с интерполяцией
          и группами риска. Оставлены как справочная альтернатива.
"""
from __future__ import annotations

import json
import math
import os
from dataclasses import dataclass, field

DATA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "bilirubin.json")

with open(DATA_PATH, encoding="utf-8") as _f:
    DATA = json.load(_f)

MGDL_FACTOR = DATA["mgdl_factor"]
DEFAULT_SCALE = DATA["default_scale"]
SCALES = DATA["scales"]
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


def r(v: float) -> int:
    """Округление «половина вверх».

    Встроенный round() в Python банковский: round(162.5) == 162, тогда как
    Math.round в калькуляторе даёт 163. Расхождение в единицу на пороге
    билирубина недопустимо, поэтому округляем одинаково.
    """
    return math.floor(v + 0.5)


@dataclass
class Thresholds:
    phototherapy: float
    exchange: float
    scale: str
    band_label: str
    band_desc: str = ""
    # Только у шкалы КР РФ
    intensive: float | None = None
    intensive_effective: float | None = None
    hour_label: str = ""
    consilium: bool = False
    # Только у шкалы AAP
    group_id: str = ""

    @property
    def levels(self) -> list[tuple[str, float]]:
        out = [("Стандартная фототерапия" if self.intensive is not None else "Фототерапия",
                self.phototherapy)]
        if self.intensive is not None:
            out.append(("Интенсивная фототерапия", self.intensive))
        out.append(("ОЗПК", self.exchange))
        return out


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _interp(series: list, hours: list, h: float) -> float:
    h = _clamp(h, hours[0], hours[-1])
    for i in range(1, len(hours)):
        if h <= hours[i]:
            t = (h - hours[i - 1]) / (hours[i] - hours[i - 1])
            return series[i - 1] + t * (series[i] - series[i - 1])
    return series[-1]


def hour_band_index(hours: float, bands: list) -> int:
    """Индекс возрастного интервала ступенчатой таблицы."""
    for i, b in enumerate(bands):
        if b["max"] is None or hours < b["max"]:
            return i
    return len(bands) - 1


def ga_band(ga: float, bands: list) -> dict:
    for b in bands:
        if b["ga_max"] is None or ga < b["ga_max"]:
            return b
    return bands[-1]


def risk_group_id(ga: float, has_risk: bool) -> str:
    if ga >= 38:
        return "med" if has_risk else "low"
    return "high" if has_risk else "med"


def thresholds(ga: float, hours: float, has_risk: bool = False,
               scale: str = None) -> Thresholds:
    """Пороги в мкмоль/л.

    ga — гестационный (для недоношенного — скорригированный) возраст в неделях,
    hours — возраст в часах, has_risk — есть ли факторы риска (нужен только AAP).
    """
    scale = scale or DEFAULT_SCALE
    cfg = SCALES[scale]

    if cfg["kind"] == "steps":
        band = ga_band(ga, cfg["ga_bands"])
        i = hour_band_index(hours, cfg["hour_bands"])
        pt, inten, ex = band["phototherapy"][i], band["intensive"][i], band["exchange"][i]
        # КР: интенсивная ФТ показана и тогда, когда до порога ОЗПК осталось
        # менее 50 мкмоль/л, — это правило может сработать раньше таблицы.
        # Ограничиваем снизу порогом обычной ФТ: в интервале «менее 24 часов»
        # ex - 50 оказывается ниже порога стандартной ФТ, и без этого ограничения
        # лестница «стандартная -> интенсивная -> ОЗПК» переворачивалась бы.
        margin = cfg.get("intensive_within_of_exchange", 0)
        effective = max(pt, min(inten, ex - margin)) if margin else inten
        return Thresholds(
            phototherapy=pt, intensive=inten,
            intensive_effective=effective,
            exchange=ex, scale=scale,
            band_label=band["label"],
            band_desc=cfg.get("note", ""),
            hour_label=cfg["hour_bands"][i]["label"],
            consilium=ga < cfg.get("consilium_below_ga", 0),
        )

    # Непрерывные кривые AAP
    gid = risk_group_id(ga, has_risk)
    group = next(g for g in cfg["risk_groups"] if g["id"] == gid)
    return Thresholds(
        phototherapy=_interp(cfg["phototherapy"][gid], cfg["hours"], hours),
        exchange=_interp(cfg["exchange"][gid], cfg["hours"], hours),
        scale=scale, group_id=gid,
        band_label=group["label"], band_desc=group["desc"],
    )


def status(bili: float, t: Thresholds) -> tuple[str, str, str]:
    """-> (тон, заголовок, пояснение). Тона совпадают с калькулятором."""
    if bili >= t.exchange:
        return ("danger", "Порог ОЗПК достигнут",
                "Интенсивная ФТ, ВВИГ при изоиммунном гемолизе, заказ компонентов, "
                "готовность к ОЗПК."
                + (" ГВ менее 32 недель — решение принимает консилиум." if t.consilium else ""))

    if t.intensive_effective is not None and bili >= t.intensive_effective:
        by_margin = t.intensive is not None and t.intensive_effective < t.intensive
        why = (f"До порога ОЗПК осталось {r(t.exchange - bili)} мкмоль/л — менее 50, "
               f"это самостоятельное показание." if by_margin
               else f"Табличный порог интенсивной ФТ {r(t.intensive)} мкмоль/л превышен.")
        return ("danger", "Показана интенсивная фототерапия",
                f"{why} Несколько источников света, максимум открытой кожи. Контроль через 2–4 ч.")

    if bili >= t.exchange - 35 and t.intensive_effective is None:
        return ("danger", "Вплотную к порогу ОЗПК",
                f"До порога {r(t.exchange - bili)} мкмоль/л. Кровь заказать заранее, "
                f"контроль через 2–4 ч.")

    if bili >= t.phototherapy:
        label = "стандартная фототерапия" if t.intensive is not None else "фототерапия"
        return ("warn", f"Показана {label}",
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


def exchange_volumes(weight_kg: float, preterm: bool = False) -> dict:
    ev = DATA["exchange_volume"]
    total = ev["bcc_ml_per_kg"] * ev["volumes_bcc"] * weight_kg
    cycle = ev["cycle_ml_per_kg_preterm"] if preterm else ev["cycle_ml_per_kg_term"]
    return {
        "total": total,
        "rbc": total * ev["rbc_fraction"],
        "ffp": total * ev["ffp_fraction"],
        "cycle": [cycle[0] * weight_kg, cycle[1] * weight_kg],
        "calcium": ev["calcium_ml_per_kg"] * weight_kg,
        "partial": [ev["partial_ml_per_kg"][0] * weight_kg, ev["partial_ml_per_kg"][1] * weight_kg],
    }


def transfusion_volume(hb_now: float, hb_target: float, weight_kg: float) -> float:
    tr = DATA["transfusion"]
    return (hb_target - hb_now) * weight_kg * tr["bcc_ml_per_kg"] / tr["rbc_hb_g_l"]


def parse_risks(tokens: list[str]) -> list[str]:
    """Достаёт факторы риска из словесных хвостов команды."""
    found = []
    for tok in tokens:
        rid = RISK_ALIASES.get(tok.strip().strip(",").lower())
        if rid and rid not in found:
            found.append(rid)
    return found
