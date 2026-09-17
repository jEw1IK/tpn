# -*- coding: utf-8 -*-
"""Поиск по клиническим рекомендациям и шпаргалкам — без зависимости от aiogram.

Врач у постели пациента пишет не то, что написано в рубрикаторе. Он пишет
«гбн», «P23.0», «сурфактант», «гипербилирубинемия» с опечаткой или вовсе
в латинской раскладке. Модуль разбирает все эти случаи в таком порядке:

    1. ID рекомендации         917_1
    2. Код МКБ-10              P23.0, Р23 (даже кириллицей), p22
    3. Словарь синонимов       гбн → «Резус-изоиммунизация…» + шпаргалка
    4. Вхождение в название    «пневмон» → «Врожденная пневмония»
    5. Совпадение по словам    «желтуха новорожденных»
    6. Нечёткое сравнение      «пнвмония» → «пневмония»

Каждый шаг даёт свой балл, побеждает максимальный. Так точное совпадение
кода никогда не проигрывает случайному нечёткому.
"""
from __future__ import annotations

import difflib
import json
import os
import re
from dataclasses import dataclass, field

from .catalog import Catalog, Cheatsheet

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(os.path.dirname(HERE), "data")

# --------------------------------------------------------------------------
# Нормализация запроса
# --------------------------------------------------------------------------

# Раскладка: врач набрал по-русски, не переключив язык.
_LAYOUT = str.maketrans(
    'qwertyuiop[]asdfghjkl;\'zxcvbnm,.QWERTYUIOP{}ASDFGHJKL:"ZXCVBNM<>',
    'йцукенгшщзхъфывапролджэячсмитьбюЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ',
)

# Кириллические двойники латиницы — для кодов МКБ, набранных русской раскладкой.
_LOOKALIKE = str.maketrans("АВЕКМНОРСТХУ", "ABEKMHOPCTXY")

_WORD_RE = re.compile(r"[^0-9a-zа-я_]+")
_ICD_RE = re.compile(r"\b([A-Z])\s?(\d{2})(?:[.,](\d))?\b")
_KR_ID_RE = re.compile(r"\b(\d{1,4})_(\d)\b")


def fix_layout(text: str) -> str:
    """Переводит латиницу в кириллицу, если кириллицы в запросе нет.

    Оговорка: строки без кириллицы, но осмысленные латиницей (nSOFA, CPAP,
    MIST), словарь синонимов ловит до перевода — там они записаны латиницей.
    """
    if re.search(r"[а-яё]", text, re.IGNORECASE):
        return text
    return text.translate(_LAYOUT)


def normalize(text: str) -> str:
    """Нижний регистр, ё→е, всё лишнее — в пробел."""
    text = text.lower().replace("ё", "е")
    return _WORD_RE.sub(" ", text).strip()


# Окончания русских слов: «боли» и «боль», «шкала» и «шкалы» должны
# совпадать. Полноценный стеммер тут избыточен — хватает отсечения хвоста.
_ENDINGS = (
    "иями", "ями", "ами", "ией", "иях", "ах", "ях", "ой", "ей", "ом", "ем",
    "ых", "их", "ые", "ие", "ый", "ий", "ая", "яя", "ое", "ее", "ов", "ев",
    "ам", "ям", "ы", "и", "а", "я", "о", "е", "у", "ю", "ь",
)


def stem(word: str) -> str:
    for end in _ENDINGS:
        if word.endswith(end) and len(word) - len(end) >= 3:
            return word[: -len(end)]
    return word


def tokens(text: str) -> list[str]:
    return [t for t in normalize(text).split() if t]


def stems(text: str) -> list[str]:
    return [stem(t) for t in tokens(text)]


def akin(a: str, b: str) -> bool:
    """Слова одного корня — с точностью, достаточной для поиска по названию."""
    a, b = stem(a), stem(b)
    return a == b or (len(a) >= 4 and len(b) >= 4 and (a.startswith(b) or b.startswith(a)))


def icd_codes(text: str) -> list[str]:
    """Коды МКБ-10 из запроса: «р23.0» → P23.0, «p22» → P22."""
    upper = text.upper().translate(_LOOKALIKE)
    out = []
    for letter, digits, sub in _ICD_RE.findall(upper):
        code = f"{letter}{digits}" + (f".{sub}" if sub else "")
        if code not in out:
            out.append(code)
    return out


# --------------------------------------------------------------------------
# Данные
# --------------------------------------------------------------------------
@dataclass
class Guideline:
    id: str
    name: str
    url: str
    icd10: str
    date: str
    specialties: str = ""
    age: str = ""

    @property
    def codes(self) -> list[str]:
        return [c.strip() for c in self.icd10.split(",") if c.strip()]

    def card(self) -> str:
        """Карточка КР для сообщения в телеграм (HTML)."""
        lines = [f"<b>{self.name}</b>"]
        meta = []
        if self.codes:
            meta.append("МКБ-10: " + ", ".join(self.codes))
        if self.age:
            meta.append(self.age)
        if meta:
            lines.append(" · ".join(meta))
        lines.append(f"ID {self.id} · размещены {self.date}")
        lines.append(f'<a href="{self.url}">Открыть на сайте Минздрава</a>')
        return "\n".join(lines)


@dataclass
class Hit:
    guideline: Guideline
    score: float
    sheets: list = field(default_factory=list)


@dataclass
class Result:
    query: str
    guidelines: list = field(default_factory=list)   # list[Hit]
    sheets: list = field(default_factory=list)       # list[Cheatsheet]

    @property
    def empty(self) -> bool:
        return not self.guidelines and not self.sheets


# --------------------------------------------------------------------------
# Поиск
# --------------------------------------------------------------------------
S_ID = 100.0          # точный ID рекомендации
S_ICD_FULL = 92.0     # полный код МКБ-10
S_ICD_BLOCK = 82.0    # рубрика без подрубрики
S_SYN_EXACT = 88.0    # запрос целиком равен синониму
S_SYN_PART = 72.0     # синоним внутри запроса
S_SUBSTR = 66.0       # запрос внутри названия
S_TOKENS = 56.0       # все слова запроса нашлись в названии
S_FUZZY = 50.0        # нечёткое совпадение, множитель
FUZZY_MIN = 0.74      # ниже — шум


class Search:
    """Индекс по 57 КР и 15 шпаргалкам. Держится в памяти, строится один раз."""

    def __init__(self, catalog: Catalog | None = None, data_dir: str = DATA_DIR):
        self.catalog = catalog or Catalog()
        with open(os.path.join(data_dir, "guidelines.json"), encoding="utf-8") as f:
            raw = json.load(f)["guidelines"]
        self.guidelines: dict[str, Guideline] = {
            gid: Guideline(
                id=g["id"], name=g["name"], url=g["url"], icd10=g.get("icd10", ""),
                date=g.get("date", ""), specialties=g.get("specialties", ""),
                age=g.get("age", ""),
            )
            for gid, g in raw.items()
        }
        self._names = {gid: normalize(g.name) for gid, g in self.guidelines.items()}
        self._codes: dict[str, list[str]] = {}
        for gid, g in self.guidelines.items():
            for code in g.codes:
                self._codes.setdefault(code.upper(), []).append(gid)

        with open(os.path.join(data_dir, "synonyms.json"), encoding="utf-8") as f:
            entries = json.load(f)["entries"]
        # термин → (ID рекомендаций, id шпаргалок)
        self._syn: dict[str, tuple[list[str], list[str]]] = {}
        for e in entries:
            for term in e["terms"]:
                self._syn[normalize(term)] = (e.get("kr", []), e.get("sheets", []))

    # -- служебное ---------------------------------------------------------
    def _sheets_for(self, gid: str) -> list[Cheatsheet]:
        return self.catalog.by_guideline(gid)

    @staticmethod
    def _ratio(a: str, b: str) -> float:
        return difflib.SequenceMatcher(None, a, b).ratio()

    # -- основной вход -----------------------------------------------------
    @staticmethod
    def _variants(raw: str) -> list[str]:
        """Что именно искать: как набрано и как получилось бы в русской раскладке.

        Считаем оба варианта: «nsofa» осмысленно латиницей, «utkbjyf» —
        только после перевода. Побеждает тот, что дал больший балл.
        """
        out = [raw]
        fixed = fix_layout(raw)
        if fixed != raw:
            out.append(fixed)
        return out

    def lookup(self, query: str, limit: int = 5) -> Result:
        raw = (query or "").strip()
        result = Result(query=raw)
        if len(normalize(raw)) < 2 and not icd_codes(raw):
            return result

        scores: dict[str, float] = {}
        sheet_ids: dict[str, float] = {}

        def bump(store: dict, key: str, value: float) -> None:
            if value > store.get(key, 0):
                store[key] = value

        # 1. ID рекомендации — по исходной строке, раскладка тут ни при чём
        for num, ver in _KR_ID_RE.findall(raw):
            gid = f"{num}_{ver}"
            if gid in self.guidelines:
                bump(scores, gid, S_ID)

        # 2. МКБ-10 — тоже по исходной: «P23.0» не надо переводить в раскладку
        for code in icd_codes(raw):
            for gid in self._codes.get(code, []):
                bump(scores, gid, S_ICD_FULL)
            if "." not in code:                      # рубрика целиком: P23 → P23.x
                for full, gids in self._codes.items():
                    if full.startswith(code + "."):
                        for gid in gids:
                            bump(scores, gid, S_ICD_BLOCK)

        for variant in self._variants(raw):
            q = normalize(variant)
            if len(q) < 2:
                continue
            qs = stems(q)

            # 3. Словарь синонимов
            for term, (krs, shs) in self._syn.items():
                if not term:
                    continue
                if term == q:
                    weight = S_SYN_EXACT
                elif len(term) >= 3 and (term in q or (len(q) >= 4 and q in term)):
                    weight = S_SYN_PART
                else:
                    continue
                # Порядок внутри записи словаря — это порядок уместности:
                # первым стоит то, что врач имел в виду с наибольшей вероятностью.
                for pos, gid in enumerate(krs):
                    bump(scores, gid, weight - pos * 0.5)
                for pos, sid in enumerate(shs):
                    bump(sheet_ids, sid, weight - pos * 0.5)

            # 4-6. Название рекомендации
            for gid, name in self._names.items():
                if q in name:
                    bump(scores, gid, S_SUBSTR)
                    continue
                nt = name.split()
                if qs and all(any(akin(t, w) for w in nt) for t in qs):
                    bump(scores, gid, S_TOKENS)
                    continue
                ratio = self._ratio(q, name)
                words = [self._ratio(q, w) for w in nt if len(w) > 3]
                best = max([ratio] + words)
                if best >= FUZZY_MIN:
                    bump(scores, gid, S_FUZZY * best)

            # Шпаргалки по собственному тексту
            for sheet in self.catalog.sheets:
                hay = normalize(" ".join(
                    (sheet.title, sheet.subtitle, sheet.summary, sheet.category, sheet.button)
                ))
                if q in hay:
                    bump(sheet_ids, sheet.id, S_SUBSTR)
                    continue
                ht = hay.split()
                if qs and all(any(akin(t, w) for w in ht) for t in qs):
                    bump(sheet_ids, sheet.id, S_TOKENS)

        # Шпаргалки, привязанные к найденным рекомендациям
        ranked = sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))[:limit]
        hits = []
        for gid, score in ranked:
            sheets = self._sheets_for(gid)
            hits.append(Hit(guideline=self.guidelines[gid], score=score, sheets=sheets))
            for sheet in sheets:
                bump(sheet_ids, sheet.id, score - 1)   # чуть ниже прямого попадания

        result.guidelines = hits
        result.sheets = [
            s for s in (
                self.catalog.get(sid)
                for sid, _ in sorted(sheet_ids.items(), key=lambda kv: (-kv[1], kv[0]))
            ) if s
        ][:limit]
        return result
