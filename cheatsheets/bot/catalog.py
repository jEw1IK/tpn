# -*- coding: utf-8 -*-
"""Каталог шпаргалок — без зависимостей от телеграм-библиотеки.

Читает manifest.json, который генерирует build.py, и умеет:
  • отдавать список категорий и шпаргалок,
  • искать по названию,
  • кэшировать telegram file_id, чтобы не заливать один и тот же PDF дважды.

Если бот написан не на aiogram, используйте этот модуль напрямую —
он ничего не знает про фреймворк.
"""
from __future__ import annotations

import json
import os
import threading
from dataclasses import dataclass
from typing import Iterable

HERE = os.path.dirname(os.path.abspath(__file__))
CHEATSHEETS_DIR = os.path.dirname(HERE)
MANIFEST_PATH = os.path.join(CHEATSHEETS_DIR, "manifest.json")

# Кэш file_id живёт рядом с ботом и переживает перезапуск.
def _load_brand() -> dict:
    """Подпись автора и проекта — тот же файл, из которого её берут PDF."""
    path = os.path.join(CHEATSHEETS_DIR, "data", "brand.json")
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


BRAND = _load_brand()


def credit_line() -> str:
    """Строка «Автор: … · ПОСТ·НЕО» для подписи к документу."""
    author = BRAND.get("author", "").strip()
    role = BRAND.get("role", "").strip()
    project = BRAND.get("project", "").strip()
    link = BRAND.get("link", "").strip()
    prefix = BRAND.get("prefix", "Автор").strip()

    parts = []
    if author:
        who = f"{prefix}: {author}" if prefix else author
        parts.append(f"{who}, {role}" if role else who)
    if project:
        parts.append(f"<b>{project}</b>")
    if link:
        parts.append(link)
    return " · ".join(parts)


FILE_ID_CACHE = os.environ.get(
    "CHEATSHEET_FILE_ID_CACHE", os.path.join(HERE, "file_id_cache.json")
)


@dataclass(frozen=True)
class Cheatsheet:
    id: str
    title: str
    subtitle: str
    summary: str
    category: str
    button: str
    order: int
    path: str
    url: str
    sha256: str
    bytes: int
    # ID клинических рекомендаций, на которых построена шпаргалка —
    # по ним поиск связывает карточку КР с готовым PDF.
    guidelines: tuple = ()

    @property
    def caption(self) -> str:
        parts = [f"<b>{self.title}</b>"]
        if self.subtitle:
            parts.append(self.subtitle)
        parts.append(
            "\nПамятка для быстрой сверки. Не заменяет действующие "
            "клинические рекомендации и назначение врача."
        )
        credit = credit_line()
        if credit:
            parts.append(credit)
        return "\n".join(parts)


class Catalog:
    """Каталог шпаргалок с кэшем file_id."""

    def __init__(self, manifest_path: str = MANIFEST_PATH, cache_path: str = FILE_ID_CACHE):
        self.manifest_path = manifest_path
        self.cache_path = cache_path
        self._lock = threading.Lock()
        self._sheets: list[Cheatsheet] = []
        self._by_id: dict[str, Cheatsheet] = {}
        self._file_ids: dict[str, str] = {}
        self.generated = ""
        self.reload()

    # -- загрузка -----------------------------------------------------------
    def reload(self) -> None:
        with open(self.manifest_path, encoding="utf-8") as f:
            data = json.load(f)
        self.generated = data.get("generated", "")
        sheets = []
        for e in data["sheets"]:
            sheets.append(Cheatsheet(
                id=e["id"], title=e["title"], subtitle=e.get("subtitle", ""),
                summary=e.get("summary", ""), category=e["category"],
                button=e.get("button") or e["title"], order=e.get("order", 100),
                path=os.path.join(CHEATSHEETS_DIR, e["file"]),
                url=e.get("url", ""), sha256=e.get("sha256", ""), bytes=e.get("bytes", 0),
                guidelines=tuple(e.get("guidelines", ())),
            ))
        self._sheets = sorted(sheets, key=lambda s: (s.order, s.title))
        self._by_id = {s.id: s for s in self._sheets}
        self._load_file_ids()

    def _load_file_ids(self) -> None:
        try:
            with open(self.cache_path, encoding="utf-8") as f:
                self._file_ids = json.load(f)
        except (OSError, ValueError):
            self._file_ids = {}

    # -- доступ -------------------------------------------------------------
    @property
    def sheets(self) -> list[Cheatsheet]:
        return list(self._sheets)

    def get(self, sheet_id: str) -> Cheatsheet | None:
        return self._by_id.get(sheet_id)

    def categories(self) -> list[str]:
        seen, out = set(), []
        for s in self._sheets:
            if s.category not in seen:
                seen.add(s.category)
                out.append(s.category)
        return out

    def by_category(self, category: str) -> list[Cheatsheet]:
        return [s for s in self._sheets if s.category == category]

    def search(self, query: str) -> list[Cheatsheet]:
        q = query.strip().lower()
        if not q:
            return []
        hits = []
        for s in self._sheets:
            haystack = " ".join((s.title, s.subtitle, s.summary, s.category, s.button)).lower()
            if q in haystack:
                hits.append(s)
        return hits

    def by_guideline(self, kr_id: str) -> list[Cheatsheet]:
        """Шпаргалки, опирающиеся на конкретную клиническую рекомендацию."""
        return [s for s in self._sheets if kr_id in s.guidelines]

    # -- кэш file_id --------------------------------------------------------
    def file_id(self, sheet_id: str) -> str | None:
        """Возвращает file_id, только если PDF не менялся с момента заливки."""
        entry = self._file_ids.get(sheet_id)
        sheet = self._by_id.get(sheet_id)
        if not entry or not sheet:
            return None
        if isinstance(entry, str):  # старый формат кэша
            return None
        if entry.get("sha256") != sheet.sha256:
            return None
        return entry.get("file_id")

    def remember_file_id(self, sheet_id: str, file_id: str) -> None:
        sheet = self._by_id.get(sheet_id)
        if not sheet:
            return
        with self._lock:
            self._file_ids[sheet_id] = {"file_id": file_id, "sha256": sheet.sha256}
            tmp = self.cache_path + ".tmp"
            try:
                os.makedirs(os.path.dirname(self.cache_path) or ".", exist_ok=True)
                with open(tmp, "w", encoding="utf-8") as f:
                    json.dump(self._file_ids, f, ensure_ascii=False, indent=2)
                os.replace(tmp, self.cache_path)
            except OSError:
                # Кэш — оптимизация, а не необходимость: молча продолжаем.
                pass
