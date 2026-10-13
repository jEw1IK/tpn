#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Калькулятор ПП: арифметика pn-calc.js на контрольных примерах.

    cd cheatsheets && python tests/test_pn.py

Ожидаемые значения выведены вручную из формул (см. docs/PN_AUDIT.md) и записаны
здесь выражениями — тест не вызывает проверяемую функцию, чтобы получить ответ.
Через node гоняется тот же pn-calc.js, что работает в Telegram.

Это проверка программы, а не клиническая валидация: пороги и коэффициенты
проверяются на то, что код считает именно по ним, а не на их правильность.
"""
from __future__ import annotations

import json
import math
import os
import random
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CHEATSHEETS = os.path.dirname(HERE)
REPO = os.path.dirname(CHEATSHEETS)
PN_JS = os.path.join(REPO, "pn-calc.js")
ENTERAL_JS = os.path.join(REPO, "enteral", "enteral-calc.js")
ENTERAL_DATA = os.path.join(CHEATSHEETS, "data", "enteral.json")

NODE = r"""
const fs = require('fs');
const [pnPath, entPath, dataPath, casesPath] = process.argv.slice(-4);
const PN = require(pnPath), E = require(entPath);
const D = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
const out = cases.map(c => {
  if (c.kind === 'parse') return PN.parseNumber(c.raw, c.bad);
  if (c.kind === 'options') return PN.enteralOptions(D);
  if (c.kind === 'enteral') {
    const f = D.formulas.find(x => x.id === c.id);
    return E.analyze(f, c.weight, c.mlkg * c.weight / 1000, D.targets.preterm);
  }
  const v = PN.validate(c.raw);
  return { validation: v, result: v.ok ? PN.compute(v.values) : null };
});
process.stdout.write(JSON.stringify(out));
"""

failures: list[str] = []
checks = 0


def ok(cond: bool, label: str, detail: object = "") -> None:
    global checks
    checks += 1
    print(("  ✓ " if cond else "  ✗ ") + label + ("" if cond else f"  [{detail}]"))
    if not cond:
        failures.append(label)


def close(a, b, tol=1e-6) -> bool:
    return a is not None and b is not None and math.isclose(a, b, rel_tol=tol, abs_tol=tol)


# Ввод по умолчанию — как в разметке index.html: 1200 г, 150 мл/кг, грудное молоко 20 мл/кг…
BASE = dict(weight="1200", ga="30", dol="3", fluid="150", other="0", enteral="20",
            entProtein="1.0", entKcal="68", proteinTarget="3.5", aaConc="10",
            lipDose="2.0", lipConc="20", gir="6.0", gluConc="10",
            naDose="2", naSol="1.71", kDose="1.5", kSol="1.0", caDose="1.0", caSol="0.22",
            access="central", gluMode="gir")


def raw(**kw) -> dict:
    d = dict(BASE)
    d.update({k: (str(v) if not isinstance(v, str) else v) for k, v in kw.items()})
    return d


def run(cases: list) -> list:
    node = shutil.which("node")
    path = os.path.join(HERE, ".pn_cases.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(cases, f, ensure_ascii=False)
    try:
        r = subprocess.run([node, "-e", NODE, PN_JS, ENTERAL_JS, ENTERAL_DATA, path],
                           capture_output=True, text=True, timeout=60)
    finally:
        os.remove(path)
    if r.returncode:
        print(r.stderr)
        sys.exit(1)
    return json.loads(r.stdout)


def calc(**kw) -> dict:
    return run([{"raw": raw(**kw)}])[0]


def main() -> int:
    if not shutil.which("node"):
        print("node не найден — проверка не выполнена (это не успех)")
        return 1

    # ------------------------------------------------------------------ разбор чисел
    print("Разбор чисел")
    parse_cases = [("", False, None), ("   ", False, None), ("abc", False, None), ("1.2.3", False, None),
                   ("1e3", False, None), ("1,5", False, 1.5), ("1.5", False, 1.5), ("-2", False, -2),
                   (".5", False, 0.5), ("5.", False, 5.0), ("12", True, None)]
    res = run([{"kind": "parse", "raw": r, "bad": b} for r, b, _ in parse_cases])
    for (r_, b, want), got in zip(parse_cases, res):
        label = f"«{r_}»" + (" (браузер: badInput)" if b else "")
        if want is None:
            ok(not got["ok"], f"{label} — не число", got)
        else:
            ok(got["ok"] and close(got["value"], want), f"{label} → {want}", got)

    # ------------------------------------------------------------------ проверка ввода
    print("Проверка ввода")
    bad_inputs = [("weight", "", "Масса"), ("weight", "0", "300"), ("weight", "-500", "300"),
                  ("weight", "250", "300"), ("weight", "10001", "10"), ("fluid", "300", "250"),
                  ("lipDose", "", "Жировая"), ("proteinTarget", "abc", "не число"),
                  ("enteral", "-5", "0–250"), ("caDose", "6", "0–5"), ("aaConc", "7", "Раствор")]
    res = run([{"raw": raw(**{f: v})} for f, v, _ in bad_inputs])
    for (f, v, needle), got in zip(bad_inputs, res):
        val = got["validation"]
        text = " ".join(e["text"] for e in val["errors"])
        ok(not val["ok"] and got["result"] is None and needle in text,
           f"{f} = «{v}»: расчёт не выполняется, причина названа", text or val)
    good_edges = [("weight", "300"), ("weight", "10000"), ("fluid", "0"), ("enteral", "0")]
    res = run([{"raw": raw(**{f: v})} for f, v in good_edges])
    for (f, v), got in zip(good_edges, res):
        ok(got["validation"]["ok"], f"{f} = {v} — граница поддерживаемого диапазона, ввод принят",
           got["validation"]["errors"])

    got = calc(ga="")
    ok(got["validation"]["ok"] and got["validation"]["values"]["ga"] is None and got["validation"]["notes"],
       "пустой ГВ не блокирует расчёт (влияет только на ориентир объёма)", got["validation"])
    got = calc(gluMode="conc", gir="")
    ok(got["validation"]["ok"], "в режиме концентрации пустой GIR не нужен", got["validation"]["errors"])
    got = calc(gluMode="conc", gluConc="")
    ok(not got["validation"]["ok"], "в режиме концентрации пустая концентрация — ошибка ввода")

    # ------------------------------------------------------------------ пример A
    print("Пример A: 1200 г, 150 мл/кг, грудное молоко 20 мл/кг, белок 3,5, липиды 2,0, GIR 6")
    kg = 1.2
    total = 150 * kg                        # 180 мл/сут
    ent = 20 * kg                           # 24 мл
    budget = total - ent                    # 156 мл под ПП
    ent_p = ent * 1.0 / 100                 # 0,24 г белка
    aa_g = (3.5 - ent_p / kg) * kg          # (3,5 − 0,2) × 1,2 = 3,96 г
    aa_ml = aa_g / 0.10                     # 39,6 мл АК 10 %
    lip_ml = 2.0 * kg / 0.20                # 2,4 г → 12 мл эмульсии 20 %
    na_ml, k_ml, ca_ml = 2 * kg / 1.71, 1.5 * kg / 1.0, 1.0 * kg / 0.22
    aq = budget - aa_ml - lip_ml - (na_ml + k_ml + ca_ml)   # ≈ 95,74 мл под глюкозу
    glu_g = 6 * kg * 1440 / 1000            # 10,368 г
    pct = glu_g / aq * 100                  # ≈ 10,83 %
    kcal = aa_g * 4 + glu_g * 3.4 + lip_ml * 2.0 + ent * 0.68   # 3,4 ккал/г — коэффициент на согласовании
    a = calc()["result"]
    ok(a["status"] == "ok", "расчёт выполним", a["problems"])
    ok(close(a["pnBudget"], budget), f"объём под ПП = 180 − 24 = {budget:.1f} мл", a["pnBudget"])
    ok(close(a["aaMl"], aa_ml), f"аминокислоты {aa_ml:.2f} мл", a["aaMl"])
    ok(close(a["lipMl"], lip_ml), f"липиды {lip_ml:.2f} мл", a["lipMl"])
    ok(close(a["aqueousMl"], aq), f"под глюкозу {aq:.3f} мл", a["aqueousMl"])
    ok(close(a["gluG"], glu_g), f"глюкоза {glu_g:.3f} г/сут", a["gluG"])
    ok(close(a["gluPct"], pct), f"концентрация глюкозного компонента {pct:.3f} %", a["gluPct"])
    ok(close(a["energy"]["kcalPerKg"], kcal / kg), f"всего {kcal / kg:.2f} ккал/кг/сут", a["energy"]["kcalPerKg"])
    ok(close(ent + a["usedMl"], total), "баланс: энтеральное + ПП = общий объём 180 мл", ent + a["usedMl"])
    ok(close(a["rateMlH"] * 24, a["usedMl"]), "мл/ч × 24 = мл/сут", a["rateMlH"])
    mix = a["mix"]
    ok(mix and mix["low"] == 5 and mix["high"] == 40 and close(mix["vLow"] + mix["vHigh"], aq)
       and close(mix["vLow"] * 0.05 + mix["vHigh"] * 0.40, glu_g),
       "смесь 5 % + 40 %: объём и граммы глюкозы сходятся", mix)
    n = (aa_g + ent_p) / 6.25
    npc = (lip_ml * 2.0 + glu_g * 3.4 + ent * 0.68 - ent_p * 4) / n
    ok(close(a["npcPerN"], npc), f"небелковые ккал на 1 г азота {npc:.1f}", a["npcPerN"])
    osm = (glu_g * 5.55 + aa_g * 10 + 2 * kg * 2 + 1.5 * kg * 2 + 1.0 * kg * 3) / ((budget - lip_ml) / 1000)
    ok(close(a["osm"], osm), f"расчётная осмолярность водной части {osm:.0f} мосм/л", a["osm"])

    # ------------------------------------------------------------------ переключение режима глюкозы
    print("Переключение режима глюкозы")
    back = calc(gluMode="conc", gluConc=repr(pct))["result"]
    ok(back["status"] == "ok" and close(back["gir"], 6.0) and close(back["gluG"], glu_g),
       "концентрация из примера A в режиме «концентрация» даёт обратно GIR 6,0", back["gir"])

    # ------------------------------------------------------------------ пример B
    print("Пример B: 800 г, 120 мл/кг, без энтерального, прочее 10 мл/кг, АК 6 %, глюкоза 10 %")
    kg = 0.8
    budget = 120 * kg - 10 * kg             # 96 − 8 = 88 мл
    aa_ml = 3.0 * kg / 0.06                 # 2,4 г → 40 мл
    lip_ml = 1.0 * kg / 0.20                # 0,8 г → 4 мл
    ca_ml = 0.5 * kg / 0.22                 # 0,4 ммоль → 1,82 мл
    aq = budget - aa_ml - lip_ml - ca_ml    # ≈ 42,18 мл
    glu_g = aq * 0.10                       # ≈ 4,218 г
    gir = glu_g * 1000 / (kg * 1440)        # ≈ 3,66 мг/кг/мин
    b = calc(weight=800, fluid=120, enteral=0, other=10, proteinTarget=3.0, aaConc=6, lipDose=1.0,
             gluMode="conc", gluConc=10, naDose=0, kDose=0, caDose=0.5)["result"]
    ok(b["status"] == "ok", "расчёт выполним", b["problems"])
    ok(close(b["aaMl"], aa_ml) and close(b["entProteinG"], 0), "нулевое энтеральное: весь белок из АК, 40 мл", b["aaMl"])
    ok(close(b["gir"], gir), f"GIR при 10 % = {gir:.3f} мг/кг/мин", b["gir"])
    ok(any(c["level"] == "warn" and "ниже 4" in c["text"] for c in b["checks"]),
       "получившийся GIR < 4 отмечен", b["checks"])
    ok(close(b["energy"]["kcalPerKg"], (3.0 * kg * 4 + glu_g * 3.4 + lip_ml * 2.0) / kg),
       "энергия без энтерального вклада", b["energy"]["kcalPerKg"])

    # ------------------------------------------------------------------ изменение массы
    print("Изменение массы")
    a2 = calc(weight=2400)["result"]
    ok(all(close(a2[k], 2 * a[k]) for k in ("aaMl", "lipMl", "aqueousMl", "gluG", "usedMl")),
       "масса ×2 при тех же дозах на кг: все объёмы ×2", {k: (a[k], a2[k]) for k in ("aaMl", "usedMl")})
    ok(close(a2["gluPct"], a["gluPct"]) and close(a2["energy"]["kcalPerKg"], a["energy"]["kcalPerKg"]),
       "концентрация и ккал/кг не зависят от массы", (a2["gluPct"], a["gluPct"]))

    # ------------------------------------------------------------------ состав питания
    print("Состав питания из справочника")
    pre0 = calc(entProtein="2.6", entKcal="79")["result"]
    ent_p = 24 * 2.6 / 100                  # 0,624 г
    ok(close(pre0["aaG"], (3.5 - ent_p / 1.2) * 1.2), "Пре 0 вместо грудного молока: АК добирают 3,5 − 0,52 г/кг",
       pre0["aaG"])
    data = json.load(open(ENTERAL_DATA, encoding="utf-8"))
    opts = run([{"kind": "options"}])[0]
    ids = [o["id"] for o in opts]
    ok([f["id"] for f in data["formulas"]] == [o["id"] for o in opts if o["kind"] == "product"],
       "все смеси справочника есть в ПП-калькуляторе", ids)
    ok(all(o["kind"] == "generic" for o in opts if o["id"] in ("breast", "fortified", "preterm", "standard")),
       "обобщённые составы помечены как ориентиры, не продукты", ids)
    ok(all((o.get("verified") or {}).get("status") for o in opts), "у каждой записи есть статус сверки",
       [(o["id"], (o.get("verified") or {}).get("status")) for o in opts])

    # одинаковый вклад одного продукта в ПП и в энтеральном разделе
    cases, expect = [], []
    for f in data["formulas"]:
        for w, mlkg in ((1200, 60), (800, 20), (3400, 100)):
            cases.append({"raw": raw(weight=w, enteral=mlkg, fluid=160, entProtein=f["protein"], entKcal=f["kcal"])})
            cases.append({"kind": "enteral", "id": f["id"], "weight": w, "mlkg": mlkg})
            expect.append((f["short"], w, mlkg))
    res = run(cases)
    for i, (name, w, mlkg) in enumerate(expect):
        pn, en = res[2 * i]["result"], res[2 * i + 1]["per_kg"]
        ok(close(pn["entProteinPerKg"], en["protein"]) and close(pn["entKcal"] / pn["kg"], en["kcal"]),
           f"{name}, {w} г, {mlkg} мл/кг: белок и ккал на кг совпадают в ПП и энтеральном разделе",
           (pn["entProteinPerKg"], en["protein"]))

    # ------------------------------------------------------------------ невыполнимый расчёт
    print("Невыполнимый расчёт")
    impossible = [
        # 1000 г: 100 мл общий; 80 + 30 = 110 мл > 100 мл
        ("энтеральное + прочее > общего", dict(weight=1000, fluid=100, enteral=80, other=30), "over_budget"),
        # 1000 г: 60 мл; АК 3,5 г из 5 % = 70 мл > 60 мл
        ("компоненты не помещаются", dict(weight=1000, fluid=60, enteral=0, aaConc=5), "no_room"),
        # 1000 г: 80 мл; АК 35 + липиды 15 + электролиты ≈ 7,2 → под глюкозу ≈ 22,8 мл; GIR 10 = 14,4 г → ≈ 63 %
        ("глюкоза крепче 40 %", dict(weight=1000, fluid=80, enteral=0, lipDose=3, gir=10), "glucose_too_strong"),
        # 2000 г: 300 мл; АК 40 + липиды 10, электролиты 0 → 250 мл; GIR 2 = 5,76 г → 2,3 %
        ("глюкоза слабее 5 %", dict(weight=2000, fluid=150, enteral=0, proteinTarget=2, lipDose=1, gir=2,
                                    naDose=0, kDose=0, caDose=0), "glucose_too_weak"),
        ("глюкоза не назначена, а водная часть есть", dict(gir=0), "glucose_too_weak"),
        ("концентрация 45 % в режиме концентрации", dict(gluMode="conc", gluConc=45, fluid=100), "glucose_too_strong"),
        # 1000 г: 100 мл общий = 100 мл энтерально; ПП 0 мл, но назначен GIR 6
        ("объём ПП ноль, а GIR назначен", dict(weight=1000, fluid=100, enteral=100, proteinTarget=0, lipDose=0,
                                              naDose=0, kDose=0, caDose=0), "no_glucose_room"),
    ]
    res = run([{"raw": raw(**kw)} for _, kw, _ in impossible])
    for (label, kw, code), got in zip(impossible, res):
        r_ = got["result"]
        codes = [p["code"] for p in r_["problems"]]
        ok(r_["status"] == "impossible" and code in codes, f"{label}: статус «невыполнимо», причина {code}", codes)
        ok(r_["mix"] is None, f"{label}: смесь глюкозы не предлагается", r_["mix"])
        ok(any(c["level"] == "danger" and c["text"] == r_["problems"][0]["text"] for c in r_["checks"]),
           f"{label}: причина выведена в проверках")
    r_ = res[0]["result"]
    ok("110,0" in r_["problems"][0]["text"] and "100,0" in r_["problems"][0]["text"],
       "энтеральное + прочее > общего: названы 110 и 100 мл", r_["problems"][0]["text"])
    r_ = res[1]["result"]
    ok(close(-r_["aqueousMl"], 70 + 10 + (2 / 1.71 + 1.5 + 1 / 0.22) - 60),
       "компоненты не помещаются: недостача = 70 + 10 + электролиты − 60 мл", r_["aqueousMl"])

    fully_enteral = calc(weight=1000, fluid=100, enteral=100, proteinTarget=1.0, lipDose=0, gir=0,
                         naDose=0, kDose=0, caDose=0)["result"]
    ok(fully_enteral["status"] == "ok" and close(fully_enteral["usedMl"], 0),
       "полностью энтерально и ПП не назначено — расчёт выполним, ПП 0 мл", fully_enteral["problems"])

    # ------------------------------------------------------------------ KCl 4 %
    print("Электролиты")
    kcl = calc(weight=2000, kDose=5, kSol="0.537")["result"]
    ok(close(kcl["k"]["ml"], 10 / (40 / 74.55), tol=1e-3), "KCl 4 %: 10 ммоль = 10 ÷ (40 г/л ÷ 74,55) = 18,6 мл",
       kcl["k"]["ml"])

    # ------------------------------------------------------------------ Ca–P
    print("Ca–P и полнота состава")
    texts = [c["text"] for c in a["checks"] if c["level"] in ("warn", "danger")]
    ok(not any("фосфат" in t.lower() for t in texts),
       "общая фраза про Ca–P не выдаётся за предупреждение о конкретном составе", texts)
    # 1200 г, без энтерального: АК 4,2 г (16,8 ккал) + глюкоза 10 × 1,2 × 1,44 = 17,28 г (58,75 ккал)
    # + липиды 3,5 × 1,2 = 4,2 г = 21 мл (42 ккал) → 117,6 ккал = 98 ккал/кг; азот 0,672 г → 150 : 1
    in_range = calc(enteral=0, lipDose=3.5, gir=10)["result"]
    lv = [c["level"] for c in in_range["checks"]]
    ok(lv == ["ok"] and "не проверялись" in in_range["checks"][0]["text"],
       "всё в пределах: итоговое сообщение оговаривает, что Ca–P и полнота не проверялись", in_range["checks"])

    # ------------------------------------------------------------------ инварианты на случайных назначениях
    print("Инварианты на 400 случайных назначениях")
    rnd = random.Random(20261013)
    rand_cases = []
    for _ in range(400):
        rand_cases.append({"raw": raw(
            weight=rnd.randint(300, 5000), fluid=rnd.choice([60, 80, 100, 120, 150, 180, 220]),
            enteral=rnd.choice([0, 0, 10, 20, 50, 100]), other=rnd.choice([0, 0, 5, 10, 20]),
            entProtein=rnd.choice(["1.0", "2.6", "2.0", "1.8"]), entKcal=rnd.choice(["68", "79", "74", "66"]),
            proteinTarget=rnd.choice(["0", "1.5", "2.5", "3.5", "4.0"]), aaConc=rnd.choice(["10", "6", "5"]),
            lipDose=rnd.choice(["0", "1.0", "2.0", "3.0"]), lipConc=rnd.choice(["20", "10"]),
            gir=rnd.choice(["0", "4", "6", "8", "12"]), gluMode=rnd.choice(["gir", "gir", "conc"]),
            gluConc=rnd.choice(["5", "10", "12.5", "20"]),
            naDose=rnd.choice(["0", "2", "3"]), kDose=rnd.choice(["0", "1", "2"]), caDose=rnd.choice(["0", "0.5", "1"]))})
    res = run(rand_cases)
    bad_balance = bad_feasible = bad_mix = bad_status = 0
    for got in res:
        r_ = got["result"]
        if r_["status"] == "ok":
            if not close(r_["enteralMl"] + r_["otherMl"] + r_["usedMl"], r_["totalMl"]):
                bad_balance += 1
            if r_["aqueousMl"] > 1e-9 and not (5 - 1e-9 <= r_["gluPct"] <= 40 + 1e-9):
                bad_feasible += 1
            m = r_["mix"]
            if r_["aqueousMl"] > 1e-9 and not (m and close(m["vLow"] + m["vHigh"], r_["aqueousMl"]) and
                                               close((m["vLow"] * m["low"] + m["vHigh"] * m["high"]) / 100, r_["gluG"])):
                bad_mix += 1
        else:
            if not r_["problems"] or r_["mix"] is not None:
                bad_status += 1
    n_ok = sum(g["result"]["status"] == "ok" for g in res)
    ok(bad_balance == 0, f"баланс жидкости сходится во всех выполнимых ({n_ok})", bad_balance)
    ok(bad_feasible == 0, "в выполнимом расчёте глюкоза всегда 5–40 %", bad_feasible)
    ok(bad_mix == 0, "смесь исходных растворов сходится по объёму и граммам", bad_mix)
    ok(bad_status == 0, f"каждый невыполнимый ({len(res) - n_ok}) назван и без смеси", bad_status)

    print(f"\nПроверок: {checks}, провалов: {len(failures)}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
