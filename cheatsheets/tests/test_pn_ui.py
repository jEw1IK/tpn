#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Калькулятор ПП (index.html) в настоящем браузере: некорректный ввод,
невыполнимый расчёт, пользовательский состав питания.

    cd cheatsheets && python tests/test_pn_ui.py

Нужен Python-пакет playwright и Chromium. Если их нет, тест пропускается
и честно об этом пишет — арифметику отдельно проверяет tests/test_pn.py.
Ожидаемые числа посчитаны вручную, вывод см. в комментариях к случаям.
"""
from __future__ import annotations

import functools
import http.server
import os
import socket
import sys
import threading

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover
    sync_playwright = None

failures: list[str] = []
checks = 0


def ok(cond: bool, label: str, detail: str = "") -> None:
    global checks
    checks += 1
    print(("  ✓ " if cond else "  ✗ ") + label + ("" if cond else f"  [{detail}]"))
    if not cond:
        failures.append(label)


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args) -> None:  # журнал запросов в выводе теста не нужен
        pass


def serve() -> tuple[str, http.server.ThreadingHTTPServer]:
    handler = functools.partial(QuietHandler, directory=REPO)
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{port}/index.html", httpd


def main() -> int:
    if sync_playwright is None:
        print("playwright не установлен — браузерная проверка пропущена (это не провал и не успех)")
        return 0
    url, httpd = serve()
    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(headless=True)
        except Exception as e:  # pragma: no cover
            print(f"Chromium недоступен ({e}) — браузерная проверка пропущена")
            return 0
        page = browser.new_page(viewport={"width": 420, "height": 900})
        # telegram-web-app.js в офлайне не загрузится — страница должна работать и без него
        page.route("https://telegram.org/**", lambda r: r.abort())

        def fresh():
            page.goto(url)
            page.wait_for_selector("#totalMl")

        def set_(field: str, value: str):
            page.fill(f"#{field}", value)
            page.dispatch_event(f"#{field}", "input")

        text = lambda sel: page.inner_text(sel).strip()
        bar = lambda bid: page.inner_text(f"#{bid} b").strip()

        print("Устаревшие результаты при некорректном вводе")
        for label, value in [("масса стёрта", ""), ("масса 0", "0"), ("масса отрицательная", "-500"),
                             ("масса ниже поддерживаемой (250 г)", "250")]:
            fresh()
            ok(text("#totalMl") != "—", f"{label}: до правки расчёт есть")
            set_("weight", value)
            ok(text("#totalMl") == "—", f"{label}: итог ПП убран", text("#totalMl"))
            ok(bar("barKcal") == "—" and bar("barGir") == "—", f"{label}: нижняя панель очищена",
               f"{bar('barKcal')} / {bar('barGir')}")
            ok(text("#energy") in ("", "—"), f"{label}: блок энергии очищен", text("#energy")[:60])
            ok("Масса" in text("#checks"), f"{label}: названа причина — масса", text("#checks")[:120])

        fresh()
        set_("lipDose", "")
        ok(text("#totalMl") == "—", "пустая доза липидов: расчёт не выдаётся за актуальный", text("#totalMl"))
        ok("Жиров" in text("#checks") or "липид" in text("#checks").lower(),
           "пустая доза липидов: названо поле", text("#checks")[:120])

        fresh()
        set_("fluid", "300")
        ok(text("#totalMl") == "—", "объём 300 мл/кг вне поддерживаемых 0–250: расчёт не выдаётся", text("#totalMl"))
        ok("250" in text("#checks"), "объём вне диапазона: показан допустимый диапазон", text("#checks")[:120])

        print("Невыполнимый расчёт")
        # 1000 г, общий 100 мл/кг = 100 мл; энтерально 80 + прочее 30 = 110 мл > 100 мл
        fresh()
        set_("weight", "1000"); set_("fluid", "100"); set_("enteral", "80"); set_("other", "30")
        ok(bar("barKcal") == "—", "энтеральное + прочее > общего: энергия не выдаётся за обеспеченную", bar("barKcal"))
        ok("110" in text("#checks") and "100" in text("#checks"),
           "энтеральное + прочее > общего: названы 110 и 100 мл", text("#checks")[:160])

        # 1000 г, 60 мл/кг = 60 мл, энтерально 0; белок 3,5 г/кг из АК 5 % = 3,5/0,05 = 70 мл > 60 мл
        fresh()
        set_("weight", "1000"); set_("fluid", "60"); set_("enteral", "0"); set_("proteinTarget", "3.5")
        page.select_option("#aaConc", "5")
        ok(bar("barKcal") == "—" and bar("barGir") == "—",
           "компоненты не помещаются: ккал и GIR не выдаются за обеспеченные", f"{bar('barKcal')} / {bar('barGir')}")
        ok("невыполним" in text("#energy").lower() or "цель" in text("#energy").lower(),
           "компоненты не помещаются: энергия помечена как цель", text("#energy")[:80])

        # 2000 г, 150 мл/кг = 300 мл; АК 2 г/кг из 10 % = 40 мл; липиды 1 г/кг из 20 % = 10 мл;
        # электролиты 0; под глюкозу 250 мл. GIR 2: 2 × 2 × 1,44 = 5,76 г → 2,3 % — меньше 5 %,
        # из растворов 5–40 % не приготовить без разбавителя
        fresh()
        for f, v in [("weight", "2000"), ("fluid", "150"), ("enteral", "0"), ("proteinTarget", "2"),
                     ("lipDose", "1"), ("gir", "2"), ("naDose", "0"), ("kDose", "0"), ("caDose", "0")]:
            set_(f, v)
        ok("5" in text("#checks") and "раств" in text("#checks").lower() and bar("barGlu") == "—",
           "глюкоза 2,3 % < 5 %: названа причина, концентрация не выдаётся за приготовимую",
           f"{bar('barGlu')} | {text('#checks')[:120]}")

        print("Пользовательский состав питания")
        fresh()
        page.select_option("#entType", "preterm")
        set_("entProtein", "2.9")
        ok(page.input_value("#entType") == "custom", "после ручной правки белка выбор — «своё значение»",
           page.input_value("#entType"))

        fresh()
        names = page.eval_on_selector_all("#entType option", "o => o.map(x => x.textContent)")
        ok(any("Пре 0" in n for n in names), "в списке есть Нутрилон Пре 0 из общего справочника", "; ".join(names))
        ok(any("ориентир" in n.lower() for n in names), "обобщённые составы помечены как ориентировочные", "; ".join(names))

        print("Калий хлорид 4 %")
        # 2000 г × 5 ммоль/кг = 10 ммоль; KCl 4 % = 40 г/л ÷ 74,55 г/моль = 0,537 ммоль/мл → 18,6 мл
        fresh()
        set_("weight", "2000"); set_("kDose", "5"); page.select_option("#kSol", index=1)
        rows = text("#volumes")
        ok("18,6" in rows, "KCl 4 %: 10 ммоль = 18,6 мл (0,537 ммоль/мл)", rows.replace("\n", " ")[:200])

        print("Ca–P: ограничение, а не выполненная проверка")
        fresh()
        warn_texts = page.eval_on_selector_all("#checks .msg.warn, #checks .msg.danger", "e => e.map(x => x.textContent)")
        ok(not any("фосфат" in t.lower() for t in warn_texts),
           "общая фраза про Ca–P не стоит среди предупреждений о составе", "; ".join(warn_texts)[:160])
        ok("не проверя" in page.inner_text("body").lower() and "ca–p" in page.inner_text("body").lower(),
           "явно сказано, что совместимость Ca–P не проверяется")

        browser.close()
    httpd.shutdown()
    print(f"\nПроверок: {checks}, провалов: {len(failures)}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
