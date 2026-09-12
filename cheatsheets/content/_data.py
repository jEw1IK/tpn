# -*- coding: utf-8 -*-
"""Общие данные для шпаргалок.

Пороги билирубина лежат в data/bilirubin.json и оттуда же берутся
калькулятором bili/. Здесь — конструкторы таблиц для PDF, чтобы
цифры в шпаргалке и в калькуляторе физически не могли разойтись.
"""
from __future__ import annotations

import json
import os

from neocheat.blocks import Table

DATA_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data"
)


def load(name: str) -> dict:
    with open(os.path.join(DATA_DIR, f"{name}.json"), encoding="utf-8") as f:
        return json.load(f)


BILI = load("bilirubin")
KR = load("guidelines")["guidelines"]


def kr_sources(*ids: str) -> list:
    """Строки для раздела «Источники» по ID из рубрикатора КР МЗ РФ."""
    out = []
    for cid in ids:
        g = KR.get(cid)
        if g is None:
            raise KeyError(f"Нет КР с ID {cid} в data/guidelines.json")
        out.append(
            f"Клинические рекомендации МЗ РФ «{g['name']}» — ID {g['id']}, "
            f"размещены {g['date']}. {g['url']}"
        )
    return out

# Часы, которые показываем в PDF (в JSON опорных точек больше — они нужны
# калькулятору для интерполяции).
def risk_factors_sentence() -> str:
    # Строчной делаем только первую букву каждого пункта: сплошной .lower()
    # испортил бы аббревиатуры (ГБН, Г6ФД, FiO₂).
    labels = [f["label"][:1].lower() + f["label"][1:] for f in BILI["risk_factors"]]
    return (
        "Факторы риска: " + ", ".join(labels) + ". "
        "Практически любой ребёнок с ГБН попадает минимум в средний риск, "
        "а недоношенный с ГБН — в высокий."
    )


KR_SCALE = BILI["scales"]["kr_rf"]
AAP = BILI["scales"]["aap"]


def _validate_bilirubin() -> None:
    """Проверяет согласованность таблиц порогов при каждой сборке.

    Опечатка в одной цифре data/bilirubin.json иначе тихо уедет и в PDF,
    и в калькулятор, и в бота — поэтому падаем сразу.
    """
    n = len(KR_SCALE["hour_bands"])
    for band in KR_SCALE["ga_bands"]:
        for key in ("phototherapy", "intensive", "exchange"):
            got = len(band[key])
            if got != n:
                raise ValueError(
                    f"{band['label']}, {key}: {got} значений вместо {n}"
                )
        for i in range(n):
            pt, inten, ex = (band[k][i] for k in ("phototherapy", "intensive", "exchange"))
            if not pt < inten < ex:
                raise ValueError(
                    f"{band['label']}, {KR_SCALE['hour_bands'][i]['label']}: нарушена "
                    f"лестница порогов — станд. ФТ {pt}, интенс. ФТ {inten}, ОЗПК {ex}"
                )
        for key in ("phototherapy", "intensive", "exchange"):
            row = band[key]
            if any(row[i] > row[i + 1] for i in range(n - 1)):
                raise ValueError(
                    f"{band['label']}, {key}: порог убывает с возрастом — {row}"
                )

    for gid in (g["id"] for g in AAP["risk_groups"]):
        for key in ("phototherapy", "exchange"):
            if len(AAP[key][gid]) != len(AAP["hours"]):
                raise ValueError(f"AAP {key}/{gid}: длина ряда не совпадает с hours")
        if any(p >= e for p, e in zip(AAP["phototherapy"][gid], AAP["exchange"][gid])):
            raise ValueError(f"AAP {gid}: порог ФТ не ниже порога ОЗПК")


_validate_bilirubin()


def _kr_table(level_id: str, caption: str, tone: str = "") -> Table:
    """Ступенчатая таблица КР МЗ РФ: строки — ГВ/СВ, колонки — интервалы часов."""
    head = ["ГВ / СВ"] + [f"{hb['short']} ч" for hb in KR_SCALE["hour_bands"]]
    rows = [
        [f"<b>{b['label']}</b>"] + [f"{tone}{v}" for v in b[level_id]]
        for b in KR_SCALE["ga_bands"]
    ]
    return Table(
        caption=caption,
        head=head,
        widths=[1.5] + [1] * len(KR_SCALE["hour_bands"]),
        align="l" + "c" * len(KR_SCALE["hour_bands"]),
        rows=rows,
        font_size=7.8,
    )


def kr_phototherapy_table() -> Table:
    return _kr_table("phototherapy", "Стандартная фототерапия")


def kr_intensive_table() -> Table:
    return _kr_table("intensive", "Интенсивная фототерапия", tone="! ")


def kr_exchange_table() -> Table:
    return _kr_table("exchange", "Операция заменного переливания крови", tone="!! ")


def aap_table(kind: str, caption: str, tone: str = "") -> Table:
    """Справочные кривые AAP 2004 в опорных точках (в РФ приоритет у КР)."""
    hours = [24, 48, 72, 96, 120]
    idx = [AAP["hours"].index(h) for h in hours]
    head = ["Группа риска"] + [f"{h} ч" if h != hours[-1] else f"≥ {h} ч" for h in hours]
    rows = [
        [g["label"]] + [f"{tone}{AAP[kind][g['id']][i]}" for i in idx]
        for g in AAP["risk_groups"]
    ]
    return Table(caption=caption, head=head, widths=[1.4] + [1] * len(hours),
                 align="l" + "c" * len(hours), rows=rows)


def aap_risk_groups_table() -> Table:
    return Table(
        caption="Группы риска AAP",
        head=None, widths=[1, 4], zebra=False,
        rows=[[f"<b>{g['label']}</b>", g["desc"]] for g in AAP["risk_groups"]],
    )


def hourly_rise_table() -> Table:
    tone_marks = {"ok": "+ ", "info": "~ ", "warn": "! ", "danger": "!! "}
    rows = []
    prev = None
    for band in BILI["hourly_rise"]:
        top = band["max"]
        if prev is None:
            label = f"&lt; {top}".replace(".", ",")
        elif top is None:
            label = f"&gt; {prev}".replace(".", ",")
        else:
            label = f"{prev}–{top}".replace(".", ",")
        rows.append([
            f"{tone_marks[band['tone']]}{label}",
            band["title"],
            band["action"],
        ])
        prev = top
    return Table(
        head=["Прирост, мкмоль/л/ч", "Что это значит", "Действие"],
        widths=[1.2, 2.2, 2.6],
        align="cll",
        rows=rows,
    )


def transfusion_table() -> Table:
    t = BILI["transfusion"]
    def cell(pair):
        hb, ht = pair
        return f"Hb &lt; {hb} (Ht &lt; {ht:.2f})".replace(".", ",")

    rows = [
        [row["week"], cell(row["ventilated"]), cell(row["support"]), cell(row["none"])]
        for row in t["thresholds"]
    ]
    return Table(
        head=["Возраст", "ИВЛ или FiO₂ &gt; 0,35", "CPAP / FiO₂ ≤ 0,35",
              "Без респираторной поддержки"],
        widths=[1.1, 1.6, 1.6, 1.7],
        align="lccc",
        rows=rows,
    )
