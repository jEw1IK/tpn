#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Анализ энтерального питания: расчёт мини-приложения на контрольных примерах.

    cd cheatsheets && python tests/test_enteral.py

Ожидаемые числа посчитаны вручную по составу на 100 мл из data/enteral.json:
нутриент на кг = состав на 100 мл × мл/кг/сут ÷ 100. Тест гоняет через node
файл enteral/enteral-calc.js — тот самый, что работает в Telegram.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
CHEATSHEETS = os.path.dirname(HERE)
REPO = os.path.dirname(CHEATSHEETS)
DATA = os.path.join(CHEATSHEETS, "data", "enteral.json")
JS = os.path.join(REPO, "enteral", "enteral-calc.js")

# (смесь, масса г, мл/кг/сут, нормы, ожидание на кг: ккал, белок, углеводы, статусы)
CASES = [
    ("pre0", 1200, 150, "preterm", 118.5, 3.90, 12.60, {"kcal": "ok", "protein": "ok", "carbs": "ok"}),
    ("pre1", 1500, 150, "preterm", 111.0, 3.00, 11.25, {"kcal": "low", "protein": "low", "carbs": "ok"}),
    ("pepti", 2000, 160, "term", 105.6, 2.88, 11.20, {"kcal": "low", "protein": "ok", "carbs": "low"}),
    ("ha1", 3400, 150, "term", 100.5, 2.25, 10.80, {"kcal": "low", "protein": "ok", "carbs": "low"}),
    ("pre0", 1000, 180, "preterm", 142.2, 4.68, 15.12, {"kcal": "high", "protein": "high", "carbs": "high"}),
]

NODE = r"""
const fs = require('fs');
const [calcPath, dataPath, casesJson] = process.argv.slice(-3);
const E = require(calcPath);
const D = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const cases = JSON.parse(casesJson);
console.log(JSON.stringify(cases.map(([f, w, mlkg, t]) => {
  const r = E.analyze(D.formulas.find(x => x.id === f), w, mlkg * w / 1000, D.targets[t]);
  return {per_kg: r.per_kg, checks: r.checks, need: r.need_ml_kg};
})));
"""

failures, checks = [], 0


def ok(cond: bool, label: str) -> None:
    global checks
    checks += 1
    print(("  ✓ " if cond else "  ✗ ") + label)
    if not cond:
        failures.append(label)


def main() -> int:
    node = shutil.which("node")
    if not node:
        print("node не найден — пропускаю")
        return 0
    with open(DATA, encoding="utf-8") as f:
        data = json.load(f)
    run = subprocess.run([node, "-e", NODE, JS, DATA, json.dumps([c[:4] for c in CASES])],
                         capture_output=True, text=True, timeout=30)
    if run.returncode:
        print(run.stderr)
        return 1
    results = json.loads(run.stdout)

    print("Расчёт приложения")
    for case, res in zip(CASES, results):
        f, w, mlkg, t, kcal, prot, carbs, st = case
        name = next(x["short"] for x in data["formulas"] if x["id"] == f)
        label = f"{name}, {w} г, {mlkg} мл/кг"
        pk = res["per_kg"]
        ok(abs(pk["kcal"] - kcal) < 0.05, f"{label}: {kcal} ккал/кг (получилось {pk['kcal']:.2f})")
        ok(abs(pk["protein"] - prot) < 0.005, f"{label}: белок {prot} г/кг (получилось {pk['protein']:.3f})")
        ok(abs(pk["carbs"] - carbs) < 0.005, f"{label}: углеводы {carbs} г/кг (получилось {pk['carbs']:.3f})")
        for key, want in st.items():
            ok(res["checks"][key] == want, f"{label}: {key} — {want}")

    pre1 = results[1]["need"]
    ok(round(pre1["protein"]) == 175, "Пре 1: для 3,5 г/кг белка нужно 175 мл/кг")

    print("\nСостав смесей — как в инструкциях")
    want = {"pre0": (79, 2.6, 8.4), "pre1": (74, 2.0, 7.5), "pepti": (66, 1.8, 7.0), "ha1": (67, 1.5, 7.2)}
    for x in data["formulas"]:
        ok((x["kcal"], x["protein"], x["carbs"]) == want[x["id"]], f"{x['name']}: {want[x['id']]}")

    print(f"\nПроверок: {checks}, провалов: {len(failures)}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
