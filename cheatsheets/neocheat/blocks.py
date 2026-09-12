"""Блочный DSL для шпаргалок.

Файл контента описывает шпаргалку декларативно, без единой строчки
верстки. Всё, что нужно знать, чтобы добавить свою шпору:

    from neocheat.blocks import *

    SHEET = Sheet(
        id="gbn",
        title="Гемолитическая болезнь новорождённых",
        subtitle="Фототерапия · ОЗПК · трансфузия",
        category="Гематология и билирубин",
        order=10,
        blocks=[
            H("Раздел"),
            P("Абзац текста, можно <b>жирным</b>."),
            UL("пункт", "ещё пункт"),
            OL("сначала это", "потом это"),
            Table(head=["A", "B"], rows=[["1", "2"]], widths=[2, 1]),
            Callout("danger", "Заголовок", "Текст"),
            Formula("V = ...", "пояснение"),
            KV(("Доза", "10 мг/кг"), ("Путь", "в/в")),
            Note("мелкая сноска"),
            PageBreak(),
        ],
        sources=["Клинические рекомендации ..."],
    )

Подсветка ячеек таблицы — маркером в начале текста ячейки:
    "!! красный"   "! жёлтый"   "+ зелёный"   "~ синий"
Маркер съедается при рендере, в PDF его не видно.

Выравнивание колонок задаётся строкой align: "l" / "c" / "r" на колонку,
например align="lccr".
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Sequence

__all__ = [
    "Sheet", "H", "P", "UL", "OL", "Table", "Callout", "Formula",
    "KV", "Note", "Spacer", "PageBreak", "Rule",
]


@dataclass
class H:
    """Заголовок раздела — синяя плашка во всю ширину."""
    text: str
    tone: str = "info"


@dataclass
class P:
    """Абзац. Поддерживает мини-разметку reportlab: <b>, <i>, <font color=…>."""
    text: str


@dataclass
class UL:
    """Маркированный список."""
    items: tuple

    def __init__(self, *items: str):
        self.items = tuple(items)


@dataclass
class OL:
    """Нумерованный список — для пошаговых алгоритмов."""
    items: tuple

    def __init__(self, *items: str):
        self.items = tuple(items)


@dataclass
class Table:
    """Таблица.

    head    — список заголовков колонок (может быть None для таблицы без шапки)
    rows    — список строк
    widths  — относительные доли ширины колонок, например [3, 1, 1]
    align   — строка вида "lcr" по одной букве на колонку
    caption — подпись над таблицей
    zebra   — чередование фона строк
    """
    head: Sequence[str] | None
    rows: Sequence[Sequence[str]]
    widths: Sequence[float] | None = None
    align: str | None = None
    caption: str | None = None
    zebra: bool = True
    font_size: float | None = None


@dataclass
class Callout:
    """Выделенный блок: tone = info | ok | warn | danger | muted."""
    tone: str
    title: str
    text: str = ""


@dataclass
class Formula:
    """Формула по центру в рамке."""
    text: str
    note: str = ""


@dataclass
class KV:
    """Компактная сетка «ключ — значение» в две колонки пар."""
    pairs: tuple

    def __init__(self, *pairs):
        self.pairs = tuple(pairs)


@dataclass
class Note:
    """Мелкая серая сноска."""
    text: str


@dataclass
class Spacer:
    height: float = 4.0


@dataclass
class Rule:
    """Тонкая горизонтальная линия."""
    pass


@dataclass
class PageBreak:
    pass


@dataclass
class Sheet:
    """Одна шпаргалка = один PDF."""
    id: str
    title: str
    blocks: list
    subtitle: str = ""
    category: str = "Разное"
    order: int = 100
    sources: list = field(default_factory=list)
    # Кнопка в телеграм-меню; можно оставить пустым
    button: str = ""
    # Короткое описание для меню бота и для index.html
    summary: str = ""

    def button_label(self) -> str:
        return self.button or self.title
