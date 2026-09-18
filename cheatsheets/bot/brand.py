# -*- coding: utf-8 -*-
"""Подпись автора и проекта — один источник для бота и для PDF.

Читает тот же data/brand.json, из которого берёт подпись сборка шпаргалок,
поэтому подпись в файле и подпись в чате не могут разойтись.
"""
from __future__ import annotations

import json
import os

DATA = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "brand.json"
)


def load() -> dict:
    try:
        with open(DATA, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


BRAND = load()


def author() -> str:
    """«Нехорошкин Сергей Александрович, врач-неонатолог» — или пусто."""
    name = BRAND.get("author", "").strip()
    role = BRAND.get("role", "").strip()
    if not name:
        return ""
    return f"{name}, {role}" if role else name


def project() -> str:
    return BRAND.get("project", "").strip()


def channel_url() -> str:
    """Адрес канала. Переменная окружения важнее файла — на случай переезда."""
    return (os.environ.get("CHANNEL_URL", "").strip()
            or BRAND.get("link", "").strip())


def channel_short() -> str:
    """Тот же адрес без схемы: «t.me/postneo01» короче и читается лучше."""
    url = channel_url()
    for prefix in ("https://", "http://"):
        if url.startswith(prefix):
            return url[len(prefix):]
    return url


def credit_line(html: bool = True) -> str:
    """Строка подписи: автор · проект · канал."""
    parts = []
    who = author()
    if who:
        prefix = BRAND.get("prefix", "Автор").strip()
        parts.append(f"{prefix}: {who}" if prefix else who)
    name = project()
    if name:
        parts.append(f"<b>{name}</b>" if html else name)
    url = channel_url()
    if url:
        parts.append(url)
    return " · ".join(parts)
