"""Реестр шпаргалок.

Чтобы добавить новую: создай рядом файл my_topic.py с переменной SHEET
и впиши имя модуля в MODULES ниже. Порядок в меню бота задаётся полем
`order` внутри самой шпаргалки, а не порядком в этом списке.
"""
from __future__ import annotations

import importlib

MODULES = [
    "rodzal",
    "rds_surfactant",
    "vent",
    "pphn",
    "gbn",
    "pneumonia_rnns",
    "hypoglycemia",
    "seizures",
    "pda",
    "nec",
    "hie_hypothermia",
    "inotropes",
    "fluids_tpn",
    "scales",
    "reference",
]


def load_all():
    sheets = []
    for name in MODULES:
        mod = importlib.import_module(f"content.{name}")
        sheet = getattr(mod, "SHEET")
        sheets.append(sheet)
    ids = [s.id for s in sheets]
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        raise ValueError(f"Повторяющиеся id шпаргалок: {sorted(dupes)}")
    sheets.sort(key=lambda s: (s.order, s.title))
    return sheets
