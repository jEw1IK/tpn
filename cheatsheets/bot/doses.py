# -*- coding: utf-8 -*-
"""Дозы препаратов из клинических рекомендаций — расчёт без aiogram.

Источники — те же JSON, из которых печатаются шпаргалки, так что таблица
в PDF и ответ в чате не могут разойтись. Сейчас покрыты:

    • антибиотики и антимикотики — приложение А3.4 КР «Сепсис новорождённых»
    • препараты сурфактанта — инструкции производителей

Масса в запросе необязательна: без неё бот показывает схему, с ней —
ещё и миллиграммы с миллилитрами на конкретного ребёнка.
"""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field

from .search import akin, normalize, stems

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

# Масса в граммах: меньше 300 г — не новорождённый, больше 7000 г — не он же.
MIN_G, MAX_G = 300, 7000
_WEIGHT_RE = re.compile(r"(\d+(?:[.,]\d+)?)")


def parse_weight(text: str) -> int | None:
    """Достаёт массу из запроса: «1200», «1,2 кг», «2.85» — всё в граммы."""
    for raw in _WEIGHT_RE.findall(text or ""):
        value = float(raw.replace(",", "."))
        if "." in raw or "," in raw:          # дробное — это килограммы
            value *= 1000
        elif value < 100:                     # «3» — тоже килограммы
            value *= 1000
        if MIN_G <= value <= MAX_G:
            return int(round(value))
    return None


def num(value: float, digits: int = 2) -> str:
    """Число по-русски: 3,5 — без хвостовых нулей, но и без потери половинок."""
    text = f"{round(value, digits):.{digits}f}".rstrip("0").rstrip(".")
    return (text or "0").replace(".", ",")


def _clean(text: str) -> str:
    """Снимает служебные пометки таблиц: «!! Тяжёлые инфекции» → «Тяжёлые…»."""
    for mark, sign in (("!! ", "⚠ "), ("! ", "⚠ "), ("+ ", ""), ("~ ", "")):
        if text.startswith(mark):
            return sign + text[len(mark):]
    return text


@dataclass
class DoseCard:
    title: str
    lines: list = field(default_factory=list)
    sheet_id: str = ""
    source: str = ""
    score: float = 0.0

    def text(self) -> str:
        parts = [f"<b>{self.title}</b>", ""] + self.lines
        if self.source:
            parts += ["", f"<i>{self.source}</i>"]
        return "\n".join(parts)


class Doses:
    def __init__(self, data_dir: str = DATA_DIR):
        with open(os.path.join(data_dir, "antibiotics.json"), encoding="utf-8") as f:
            self.ab = json.load(f)
        with open(os.path.join(data_dir, "surfactants.json"), encoding="utf-8") as f:
            self.surf = json.load(f)

    # -- сопоставление названия ------------------------------------------
    @staticmethod
    def _match(query: str, *names: str) -> float:
        q = normalize(query)
        if not q:
            return 0.0
        qs = stems(q)
        best = 0.0
        for name in names:
            if not name:
                continue
            n = normalize(name)
            if q == n:
                best = max(best, 100.0)
            elif q in n or n in q:
                best = max(best, 80.0)
            elif qs and all(any(akin(t, w) for w in n.split()) for t in qs):
                best = max(best, 60.0)
        return best

    # -- карточки ----------------------------------------------------------
    def _antibiotic_card(self, drug: dict, weight_g: int | None, score: float) -> DoseCard:
        lines = [f"<i>{drug['group']} · АТХ {drug['atc']}</i>", ""]
        for row in drug["rows"]:
            lines.append(f"• {_clean(row['when'])} — <b>{row['dose']}</b>, {row['freq']}")

        if weight_g:
            single = [
                r for r in self.ab["reckoner"]
                if normalize(r["name"]).startswith(normalize(drug["name"]))
            ]
            if single:
                kg = weight_g / 1000
                lines.append("")
                lines.append(f"<b>На массу {weight_g} г</b>")
                for r in single:
                    suffix = r["name"][len(drug["name"]):].strip()
                    tail = f" {suffix}" if suffix else ""
                    lines.append(f"• {r['label']}{tail} → <b>{num(r['mg_kg'] * kg, 1)} мг</b> на введение")

        return DoseCard(
            title=drug["name"],
            lines=lines,
            sheet_id="pneumonia_rnns",
            source=f"КР МЗ РФ «Сепсис новорождённых», ID {self.ab['kr_id']}, "
                   f"приложение {self.ab['appendix']}. Сверяйтесь с инструкцией препарата.",
            score=score,
        )

    def _surfactant_card(self, drug: dict, weight_g: int | None, score: float) -> DoseCard:
        title = drug["inn"]
        if drug["brand"] and drug["brand"] != drug["inn"]:
            title += f" ({drug['brand']})"
        conc = drug.get("conc_mg_ml")
        lines = []
        if conc:
            lines.append(f"<i>Концентрация {conc} мг/мл</i>")
            lines.append("")

        first = drug["first_mg_kg"]
        first_txt = f"{first[0]}–{first[1]} мг/кг" if first[0] != first[1] else f"{first[0]} мг/кг"
        lines.append(f"• Первая доза — <b>{first_txt}</b>")
        lines.append(f"• Повторная — <b>{drug['repeat_mg_kg']} мг/кг</b>, не раньше чем через {drug['interval_h']} ч")
        lines.append(f"• Не более {drug['max_doses']} доз и {drug['max_total_mg_kg']} мг/кг суммарно")

        if weight_g:
            kg = weight_g / 1000
            lines.append("")
            lines.append(f"<b>На массу {weight_g} г</b>")
            for mg_kg, label in ((first[0], "первая"), (first[1], "первая, высокая"),
                                 (drug["repeat_mg_kg"], "повторная")):
                if label == "первая, высокая" and first[0] == first[1]:
                    continue
                mg = mg_kg * kg
                ml = f" = {num(mg / conc)} мл" if conc else ""
                lines.append(f"• {label.capitalize()} {mg_kg} мг/кг → <b>{num(mg, 1)} мг</b>{ml}")

        if drug.get("note"):
            lines.append("")
            lines.append(drug["note"])

        named = drug["id"] in self.surf.get("kr_named", [])
        source = (
            "КР МЗ РФ «Синдром дыхательного расстройства», ID "
            f"{self.surf['kr_id']}: препарат назван в рекомендациях, дозы — "
            "по инструкции производителя."
            if named else
            "Дозы по инструкции производителя: в КР МЗ РФ этот препарат не назван."
        )
        return DoseCard(title=title, lines=lines, sheet_id="rds_surfactant",
                        source=source, score=score)

    # -- поиск -------------------------------------------------------------
    def find(self, query: str, limit: int = 3) -> list[DoseCard]:
        weight = parse_weight(query)
        # Массу убираем из строки, иначе «гентамицин 1200» ищется вместе с цифрами.
        name_query = _WEIGHT_RE.sub(" ", query or "").strip()
        cards = []

        for drug in self.ab["drugs"]:
            score = self._match(name_query, drug["name"], drug["atc"])
            if score:
                cards.append(self._antibiotic_card(drug, weight, score))

        for drug in self.surf["drugs"]:
            score = self._match(name_query, drug["inn"], drug["brand"], drug["id"])
            if score:
                cards.append(self._surfactant_card(drug, weight, score))

        cards.sort(key=lambda c: -c.score)
        return cards[:limit]

    def names(self) -> list[str]:
        """Что бот умеет посчитать — для подсказки в пустом ответе."""
        return ([d["name"] for d in self.ab["drugs"]]
                + [d["brand"] or d["inn"] for d in self.surf["drugs"]])
