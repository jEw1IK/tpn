#!/usr/bin/env python3
"""Сборка всех PDF-шпаргалок.

    cd cheatsheets && pip install -r requirements.txt && python build.py

Результат:
    pdf/<id>.pdf   — сами шпаргалки
    manifest.json  — список для телеграм-бота
    index.html     — страница со ссылками (для GitHub Pages)
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import html
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from content import load_all  # noqa: E402
from neocheat.render import render  # noqa: E402

REPO_ROOT = os.path.dirname(HERE)
PDF_DIR = os.path.join(HERE, "pdf")
SCALES_DATA = os.path.join(HERE, "data", "scales.json")
SCALES_JS = os.path.join(REPO_ROOT, "scales", "scales.js")
MANIFEST = os.path.join(HERE, "manifest.json")
INDEX = os.path.join(HERE, "index.html")

# Базовый URL GitHub Pages — чтобы бот мог отдавать ссылку, а не файл.
PAGES_BASE = "https://jew1ik.github.io/tpn/cheatsheets/pdf"


def _sha(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()[:16]


def build(only=None) -> list:
    build_date = dt.date.today().strftime("%d.%m.%Y")
    os.makedirs(PDF_DIR, exist_ok=True)

    entries = []
    for sheet in load_all():
        if only and sheet.id not in only:
            continue
        out = os.path.join(PDF_DIR, f"{sheet.id}.pdf")
        render(sheet, out, build_date)
        size = os.path.getsize(out)
        entries.append({
            "id": sheet.id,
            "title": sheet.title,
            "subtitle": sheet.subtitle,
            "summary": sheet.summary,
            "category": sheet.category,
            "button": sheet.button_label(),
            "order": sheet.order,
            "file": f"pdf/{sheet.id}.pdf",
            "url": f"{PAGES_BASE}/{sheet.id}.pdf",
            "bytes": size,
            "sha256": _sha(out),
        })
        print(f"  ✓ {sheet.id:<18} {size/1024:6.1f} КБ  {sheet.title}")
    return entries


def write_manifest(entries, build_date):
    data = {
        "generated": build_date,
        "count": len(entries),
        "pages_base": PAGES_BASE,
        "sheets": entries,
    }
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def write_index(entries, build_date):
    cats = {}
    for e in entries:
        cats.setdefault(e["category"], []).append(e)

    rows = []
    for cat, items in cats.items():
        rows.append(f"<h2>{html.escape(cat)}</h2><ul>")
        for e in items:
            sub = html.escape(e["summary"] or e["subtitle"])
            rows.append(
                f'<li><a href="{html.escape(e["file"])}">{html.escape(e["title"])}</a>'
                f'<span class="kb">{e["bytes"]/1024:.0f} КБ</span>'
                + (f"<div class='s'>{sub}</div>" if sub else "")
                + "</li>"
            )
        rows.append("</ul>")

    doc = f"""<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Шпаргалки неонатолога</title>
<style>
:root{{--bg:#f4f5f7;--card:#fff;--text:#14181f;--muted:#6b7280;--line:#e3e6ea;--accent:#2f7ad6}}
@media(prefers-color-scheme:dark){{:root{{--bg:#15181d;--card:#1e232b;--text:#e8eaed;--muted:#9aa3af;--line:#2c333d;--accent:#63a6f0}}}}
*{{box-sizing:border-box}}
body{{margin:0;padding:16px 14px 60px;font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--text)}}
h1{{font-size:20px;margin:4px 0 2px}}
.lead{{color:var(--muted);font-size:13px;margin:0 0 18px}}
h2{{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:20px 0 8px}}
ul{{list-style:none;margin:0;padding:0}}
li{{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:11px 13px;margin-bottom:8px}}
a{{color:var(--accent);text-decoration:none;font-weight:600}}
.kb{{float:right;color:var(--muted);font-size:11px;font-weight:400}}
.s{{color:var(--muted);font-size:12px;margin-top:3px}}
footer{{color:var(--muted);font-size:11px;margin-top:26px;border-top:1px solid var(--line);padding-top:10px}}
</style></head><body>
<h1>Шпаргалки неонатолога</h1>
<p class="lead">{len(entries)} PDF · обновлено {build_date}</p>
<ul><li><a href="../scales/">📊 Шкалы: nSOFA, NIPS, N-PASS</a>
<div class='s'>Полиорганная дисфункция, боль и глубина седации —
с подсчётом суммы и трактовкой.</div></li></ul>
{"".join(rows)}
<footer>Памятки для быстрой сверки у постели пациента. Не заменяют действующие
клинические рекомендации и назначение врача.</footer>
</body></html>
"""
    with open(INDEX, "w", encoding="utf-8") as f:
        f.write(doc)


def write_scales_js():
    """Отдаёт мини-приложению со шкалами те же данные, что и PDF-шпаргалке."""
    with open(SCALES_DATA, encoding="utf-8") as f:
        data = json.load(f)
    os.makedirs(os.path.dirname(SCALES_JS), exist_ok=True)
    with open(SCALES_JS, "w", encoding="utf-8") as f:
        f.write("/* Файл создаётся автоматически: cheatsheets/build.py\n")
        f.write("   Источник: cheatsheets/data/scales.json — правьте его, не этот файл. */\n")
        f.write("window.SCALES_DATA = ")
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write(";\n")
    return SCALES_JS


def main():
    ap = argparse.ArgumentParser(description="Сборка PDF-шпаргалок")
    ap.add_argument("only", nargs="*", help="собрать только эти id")
    args = ap.parse_args()

    build_date = dt.date.today().strftime("%d.%m.%Y")
    print("Сборка шпаргалок…")
    entries = build(only=set(args.only) or None)
    if not args.only:
        write_manifest(entries, build_date)
        write_index(entries, build_date)
        write_scales_js()
        print(f"\nГотово: {len(entries)} PDF, manifest.json, index.html, scales/scales.js")
    else:
        print(f"\nГотово: {len(entries)} PDF (manifest не трогали)")


if __name__ == "__main__":
    main()
