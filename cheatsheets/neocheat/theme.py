"""Палитра, шрифты и стили абзацев для PDF-шпаргалок.

Цвета намеренно совпадают с mini-app (index.html), чтобы шпаргалки
и калькулятор выглядели одним продуктом.
"""
from __future__ import annotations

import json
import os

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# --------------------------------------------------------------------------
# Цвета
# --------------------------------------------------------------------------
TEXT = colors.HexColor("#14181f")
MUTED = colors.HexColor("#6b7280")
LINE = colors.HexColor("#dfe3e8")
LINE_SOFT = colors.HexColor("#eef1f4")
PAPER = colors.HexColor("#ffffff")

ACCENT = colors.HexColor("#2f7ad6")
ACCENT_SOFT = colors.HexColor("#eaf2fc")

OK = colors.HexColor("#1c7c50")
OK_SOFT = colors.HexColor("#e6f4ec")

WARN = colors.HexColor("#9a6300")
WARN_SOFT = colors.HexColor("#fdf3e0")

DANGER = colors.HexColor("#b3261e")
DANGER_SOFT = colors.HexColor("#fdecea")

ZEBRA = colors.HexColor("#f7f8fa")

# Роль callout -> (рамка/заголовок, фон)
TONES = {
    "info": (ACCENT, ACCENT_SOFT),
    "ok": (OK, OK_SOFT),
    "warn": (WARN, WARN_SOFT),
    "danger": (DANGER, DANGER_SOFT),
    "muted": (MUTED, ZEBRA),
}

# Подсветка отдельных ячеек таблицы: маркер в начале текста -> тон
CELL_TONES = {
    "!!": "danger",
    "!": "warn",
    "+": "ok",
    "~": "info",
}

# --------------------------------------------------------------------------
# Геометрия страницы
# --------------------------------------------------------------------------
# Подпись автора и проекта: единственное место, где она задаётся.
def _load_brand() -> dict:
    path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "brand.json"
    )
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


BRAND = _load_brand()


PAGE_MARGIN_X = 13 * mm
PAGE_MARGIN_TOP = 26 * mm
PAGE_MARGIN_BOTTOM = 15 * mm

# --------------------------------------------------------------------------
# Шрифты
# --------------------------------------------------------------------------
FONT = "NeoSans"
FONT_BOLD = "NeoSans-Bold"

_BUNDLED = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "fonts")

# Ищем шрифты сначала в репозитории, потом в системе. Нужна кириллица,
# поэтому DejaVu / Liberation / Noto / FreeSans, в таком порядке.
_FONT_CANDIDATES = [
    (os.path.join(_BUNDLED, "DejaVuSans.ttf"), os.path.join(_BUNDLED, "DejaVuSans-Bold.ttf")),
    (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ),
    (
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ),
    (
        "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
        "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf",
    ),
    (
        "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
    ),
    ("/Library/Fonts/Arial Unicode.ttf", "/Library/Fonts/Arial Unicode.ttf"),
    ("C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/arialbd.ttf"),
]

_registered = False


def register_fonts() -> None:
    """Регистрирует пару regular/bold с кириллицей. Идемпотентно."""
    global _registered
    if _registered:
        return
    for regular, bold in _FONT_CANDIDATES:
        if os.path.exists(regular) and os.path.exists(bold):
            pdfmetrics.registerFont(TTFont(FONT, regular))
            pdfmetrics.registerFont(TTFont(FONT_BOLD, bold))
            pdfmetrics.registerFontFamily(FONT, normal=FONT, bold=FONT_BOLD)
            _registered = True
            return
    raise RuntimeError(
        "Не найден TTF-шрифт с кириллицей. Положи DejaVuSans.ttf и "
        f"DejaVuSans-Bold.ttf в {_BUNDLED} или установи пакет fonts-dejavu."
    )


# --------------------------------------------------------------------------
# Стили абзацев
# --------------------------------------------------------------------------
def _p(name, size, leading, **kw):
    return ParagraphStyle(
        name,
        fontName=kw.pop("fontName", FONT),
        fontSize=size,
        leading=leading,
        textColor=kw.pop("textColor", TEXT),
        **kw,
    )


def build_styles() -> dict:
    register_fonts()
    return {
        # Титул на первой странице
        "title": _p("title", 20, 24, fontName=FONT_BOLD, spaceAfter=2),
        "subtitle": _p("subtitle", 10.5, 14, textColor=MUTED, spaceAfter=0),
        # Колонтитулы
        "runhead": _p("runhead", 8, 10, textColor=MUTED),
        "runfoot": _p("runfoot", 7.2, 9, textColor=MUTED),
        # Заголовки разделов
        "h1": _p("h1", 12.5, 15, fontName=FONT_BOLD, textColor=colors.white),
        "h2": _p("h2", 10, 13, fontName=FONT_BOLD, textColor=ACCENT, spaceBefore=6, spaceAfter=2),
        # Основной текст
        "body": _p("body", 8.8, 12, spaceAfter=3),
        "bullet": _p("bullet", 8.8, 12, leftIndent=9, bulletIndent=1, spaceAfter=1.5),
        "step": _p("step", 8.8, 12, leftIndent=13, spaceAfter=1.5),
        "note": _p("note", 7.6, 10, textColor=MUTED, spaceBefore=2, spaceAfter=3),
        # Таблицы
        "th": _p("th", 7.8, 10, fontName=FONT_BOLD, textColor=colors.white),
        "td": _p("td", 8.2, 10.5),
        "td_b": _p("td_b", 8.2, 10.5, fontName=FONT_BOLD),
        "td_c": _p("td_c", 8.2, 10.5, alignment=TA_CENTER),
        "td_r": _p("td_r", 8.2, 10.5, alignment=TA_RIGHT),
        "th_c": _p("th_c", 7.8, 10, fontName=FONT_BOLD, textColor=colors.white, alignment=TA_CENTER),
        "th_r": _p("th_r", 7.8, 10, fontName=FONT_BOLD, textColor=colors.white, alignment=TA_RIGHT),
        # Callout
        "callout_title": _p("callout_title", 8.8, 11.5, fontName=FONT_BOLD),
        "callout_body": _p("callout_body", 8.4, 11.5),
        # Формула
        "formula": _p("formula", 10, 14, fontName=FONT_BOLD, alignment=TA_CENTER, textColor=ACCENT),
        "formula_note": _p("formula_note", 7.4, 9.5, alignment=TA_CENTER, textColor=MUTED),
        # Пары ключ-значение
        "kv_k": _p("kv_k", 8.4, 11, textColor=MUTED),
        "kv_v": _p("kv_v", 8.4, 11, fontName=FONT_BOLD),
        # Источники
        "src": _p("src", 7.2, 9.5, textColor=MUTED, leftIndent=8, alignment=TA_LEFT, spaceAfter=1),
    }
