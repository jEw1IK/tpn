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

# Часы, которые показываем в PDF (в JSON опорных точек больше — они нужны
# калькулятору для интерполяции).
PDF_HOURS = [24, 48, 72, 96, 120]


def _at(series: list, hour: int) -> int:
    return series[BILI["term"]["hours"].index(hour)]


def risk_groups_table() -> Table:
    return Table(
        caption="Группы риска",
        head=None,
        widths=[1, 4],
        zebra=False,
        rows=[[f"<b>{g['label']}</b>", g["desc"]] for g in BILI["term"]["risk_groups"]],
    )


def risk_factors_sentence() -> str:
    # Строчной делаем только первую букву каждого пункта: сплошной .lower()
    # испортил бы аббревиатуры (ГБН, Г6ФД, FiO₂).
    labels = [f["label"][:1].lower() + f["label"][1:] for f in BILI["risk_factors"]]
    return (
        "Факторы риска: " + ", ".join(labels) + ". "
        "Практически любой ребёнок с ГБН попадает минимум в средний риск, "
        "а недоношенный с ГБН — в высокий."
    )


def _threshold_table(kind: str, caption: str, tones: dict) -> Table:
    term = BILI["term"]
    head = ["Риск"] + [f"{h} ч" if h != PDF_HOURS[-1] else f"≥ {h} ч" for h in PDF_HOURS]
    rows = []
    for group in term["risk_groups"]:
        series = term[kind][group["id"]]
        prefix = tones.get(group["id"], "")
        rows.append([group["label"]] + [f"{prefix}{_at(series, h)}" for h in PDF_HOURS])
    return Table(
        caption=caption,
        head=head,
        widths=[1.2] + [1] * len(PDF_HOURS),
        align="l" + "c" * len(PDF_HOURS),
        rows=rows,
    )


def phototherapy_table() -> Table:
    return _threshold_table("phototherapy", "Порог начала фототерапии", {})


def exchange_table() -> Table:
    return _threshold_table(
        "exchange",
        "Порог ОЗПК (на фоне уже проводимой интенсивной ФТ)",
        {"low": "! ", "med": "! ", "high": "!! "},
    )


def preterm_table() -> Table:
    rows = []
    for i, band in enumerate(BILI["preterm"]["bands"]):
        pt = band["phototherapy"]
        ex = band["exchange"]
        tone = "!! " if i < 2 else "! "
        rows.append([band["label"], f"{pt[0]}–{pt[1]}", f"{tone}{ex[0]}–{ex[1]}"])
    return Table(
        head=["Гестационный возраст", "Фототерапия", "ОЗПК"],
        widths=[1.6, 1.4, 1.4],
        align="lcc",
        rows=rows,
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
