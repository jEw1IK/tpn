#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Калькулятор разведений: бот и мини-приложение на одних примерах.

    cd cheatsheets && python tests/test_dilution.py

Примеры — из живой переписки автора (tests/dilution_cases.json). Сначала
их проходит расчёт бота (bot/dilution.py), затем тот же расчёт в браузерном
файле sedation/dilution.js — через node, если он установлен. Дальше
результаты сравниваются между собой построчно, включая таблицу скоростей.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CHEATSHEETS = os.path.dirname(HERE)
REPO = os.path.dirname(CHEATSHEETS)
sys.path.insert(0, CHEATSHEETS)

from bot.dilution import DRUGS, check, dilute, draw, num, rate_for  # noqa: E402

CASES = os.path.join(HERE, "dilution_cases.json")
DATA = os.path.join(CHEATSHEETS, "data", "sedation.json")
JS = os.path.join(REPO, "sedation", "dilution.js")

failures: list[str] = []
checks = 0


def ok(condition: bool, label: str) -> None:
    global checks
    checks += 1
    if condition:
        print(f"  ✓ {label}")
    else:
        failures.append(label)
        print(f"  ✗ {label}")


def run_py(case: dict) -> dict:
    drug = DRUGS[case["drug"]]
    fn = case["fn"]
    if fn == "dilute":
        plan = dilute(drug, case["weight_g"], case.get("amount"), case.get("rule"))
    elif fn == "draw":
        plan = draw(drug, case["weight_g"], case["volume"], case.get("rule"))
    else:
        plan = check(drug, case["weight_g"], case["amount"], case["volume"],
                     rate=case.get("rate"), target=case.get("target"))
    out = {"ok": plan.ok}
    if not plan.ok:
        return out
    alt = plan.alternative
    out.update({
        "volume": plan.volume,
        "draw_ml": round(plan.draw_ml, 4),
        "syringe_ml": plan.syringe_ml,
        "warn": bool(plan.warnings),
        "alt_draw_ml": round(alt.draw_ml, 4) if alt else None,
        "alt_volume": alt.volume if alt else None,
        "rows": [[r.rate, drug.dose(r.dose), r.over, r.typical, r.current] for r in plan.rows],
        "hours": round(plan.hours, 1),
        "warnings": plan.warnings,
        "alt_why": plan.alternative_why,
    })
    if case.get("rate"):
        out["dose_at_rate"] = plan.per_rate * case["rate"]
    if case.get("target"):
        out["rate_for_target"] = rate_for(plan, case["target"])
    return out


NODE_SCRIPT = r"""
const fs = require('fs');
const [jsPath, dataPath, casesPath] = process.argv.slice(-3);
const D = require(jsPath);
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8')).cases;
const E = D.makeEngine(data);
const out = cases.map(c => {
  const drug = E.drugs[c.drug];
  let p;
  if (c.fn === 'dilute') p = E.dilute(drug, c.weight_g, c.amount, c.rule);
  else if (c.fn === 'draw') p = E.draw(drug, c.weight_g, c.volume, c.rule);
  else p = E.check(drug, c.weight_g, c.amount, c.volume, c.rate, c.target);
  const r = {ok: p.ok};
  if (!p.ok) return r;
  const a = p.alternative;
  Object.assign(r, {
    volume: p.volume, draw_ml: +p.draw_ml.toFixed(4), syringe_ml: p.syringe_ml,
    warn: p.warnings.length > 0,
    alt_draw_ml: a ? +a.draw_ml.toFixed(4) : null, alt_volume: a ? a.volume : null,
    rows: p.rows.map(x => [x.rate, E.doseText(drug, x.dose), x.over, x.typical, x.current]),
    hours: +p.hours.toFixed(1),
    warnings: p.warnings,
    alt_why: p.alternative_why,
  });
  if (c.rate) r.dose_at_rate = p.per_rate * c.rate;
  if (c.target) r.rate_for_target = E.rateFor(p, c.target);
  return r;
});
console.log(JSON.stringify(out));
"""


def run_js(cases_count: int) -> list | None:
    node = shutil.which("node")
    if not node:
        print("\n(node не найден — сверку с мини-приложением пропускаю)")
        return None
    proc = subprocess.run(
        [node, "-e", NODE_SCRIPT, JS, DATA, CASES],
        capture_output=True, text=True, timeout=30,
    )
    if proc.returncode != 0:
        failures.append("dilution.js не запустился")
        print(proc.stderr)
        return None
    result = json.loads(proc.stdout)
    assert len(result) == cases_count
    return result


def expect(case: dict, got: dict, who: str) -> None:
    drug = DRUGS[case["drug"]]
    for key, want in case["expect"].items():
        have = got.get(key)
        if key == "dose_at_rate":
            good = have is not None and drug.dose(have) == drug.dose(want)
            shown = drug.dose(have) if have is not None else None
        elif key == "rate_for_target":
            good = have is not None and num(have) == num(want)
            shown = num(have) if have is not None else None
        elif isinstance(want, float):
            good = have is not None and abs(have - want) < 1e-6
            shown = have
        else:
            good = have == want
            shown = have
        ok(good, f"{who}: {case['name']} — {key} = {want} (получилось {shown})")


def main() -> int:
    with open(CASES, encoding="utf-8") as f:
        cases = json.load(f)["cases"]

    print("Расчёт бота (Python)")
    py = []
    for case in cases:
        got = run_py(case)
        py.append(got)
        expect(case, got, "бот")

    js = run_js(len(cases))
    if js is not None:
        print("\nМини-приложение (JavaScript)")
        for case, got in zip(cases, js):
            expect(case, got, "приложение")

        print("\nБот и приложение дают одно и то же")
        for case, a, b in zip(cases, py, js):
            same = a.keys() == b.keys() and all(
                (abs(a[k] - b[k]) < 1e-9 if isinstance(a[k], float) and isinstance(b[k], (int, float))
                 else a[k] == b[k])
                for k in a
            )
            ok(same, f"совпадает: {case['name']}")
            if not same:
                for k in a:
                    if a.get(k) != b.get(k):
                        print(f"      {k}: бот {a.get(k)!r} · приложение {b.get(k)!r}")

    print(f"\nПроверок: {checks}, провалов: {len(failures)}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
