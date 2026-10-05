# -*- coding: utf-8 -*-
"""Разведение препаратов для инфузии на шприцевом насосе — расчёт без aiogram.

Врач задаёт правило «скорость = доза»: например, 0,3 мл/ч = 0,03 мг/кг/ч.
Из правила и массы следует концентрация, которая нужна в шприце:

    концентрация = доза × масса ÷ скорость

Дальше три вопроса, которые задают у постели, — и на каждый своя функция:

    dilute()  взял столько-то препарата — до скольки развести?
    draw()    хочу шприц на столько-то мл — сколько набрать препарата?
    check()   шприц уже готов — какая доза на какой скорости?

Те же формулы повторены в мини-приложении sedation/ (JavaScript). Округления
сделаны одинаковыми в обоих языках, а тесты сверяют их на общих примерах,
поэтому чат и приложение не могут дать разные цифры.
"""
from __future__ import annotations

import json
import math
import os
import re
from dataclasses import dataclass, field

DATA_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "sedation.json",
)

EPS = 1e-9
MIN_ROWS = 4


# --------------------------------------------------------------------------
# Округление — одинаковое с JavaScript (у Python round() банковский)
# --------------------------------------------------------------------------
def round_to(value: float, step: float) -> float:
    return round(math.floor(value / step + 0.5 + EPS) * step, 10)


def ceil_to(value: float, step: float) -> float:
    return round(math.ceil(value / step - EPS) * step, 10)


def num(value: float, digits: int = 2) -> str:
    """3,5 вместо 3.50: запятая, без хвостовых нулей."""
    text = f"{round_to(value, 10 ** -digits):.{digits}f}"
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return (text or "0").replace(".", ",")


# --------------------------------------------------------------------------
# Препараты
# --------------------------------------------------------------------------
@dataclass(frozen=True)
class Drug:
    id: str
    name: str
    aliases: tuple
    unit: str            # мг или мкг — в чём считается количество
    dose_unit: str       # мг/кг/ч или мкг/кг/ч
    conc: float          # единиц в 1 мл ампульного раствора
    amp_ml: float
    form: str
    rule: tuple          # (скорость мл/ч, доза) по умолчанию
    presets: tuple
    amounts: tuple
    typical: tuple       # обычный рабочий диапазон дозы
    warn_above: float
    dose_digits: int
    notes: tuple

    @property
    def amp_amount(self) -> float:
        return self.conc * self.amp_ml

    def dose(self, value: float) -> str:
        return num(value, self.dose_digits)

    def amount(self, value: float) -> str:
        return num(value, 2 if self.unit == "мг" else 1)


@dataclass(frozen=True)
class Settings:
    syringe_max_ml: float
    syringes_ml: tuple
    min_draw_ml: float
    change_h: float
    diluent: str


def load(path: str = DATA_FILE) -> tuple:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    settings = Settings(
        syringe_max_ml=data["syringe_max_ml"],
        syringes_ml=tuple(data["syringes_ml"]),
        min_draw_ml=data["min_draw_ml"],
        change_h=data["change_h"],
        diluent=data["diluent"],
    )
    drugs = {}
    for d in data["drugs"]:
        drugs[d["id"]] = Drug(
            id=d["id"], name=d["name"], aliases=tuple(d["aliases"]),
            unit=d["unit"], dose_unit=d["dose_unit"], conc=d["conc"],
            amp_ml=d["amp_ml"], form=d["form"], rule=tuple(d["rule"]),
            presets=tuple(tuple(p) for p in d["presets"]),
            amounts=tuple(d["amounts"]), typical=tuple(d["typical"]),
            warn_above=d["warn_above"], dose_digits=d["dose_digits"],
            notes=tuple(d["notes"]),
        )
    return settings, drugs


SETTINGS, DRUGS = load()


def find_drug(text: str) -> Drug | None:
    """«мидаз», «Дормикум», «фентанил» — препарат по первому совпавшему слову."""
    low = (text or "").lower().replace("ё", "е")
    for word in re.findall(r"[a-zа-я]+", low):
        for drug in DRUGS.values():
            if any(word.startswith(a) or (len(word) >= 4 and a.startswith(word))
                   for a in drug.aliases):
                return drug
    return None


# --------------------------------------------------------------------------
# Результат
# --------------------------------------------------------------------------
@dataclass
class Row:
    rate: float          # мл/ч
    dose: float          # на кг в час
    hours: float         # на сколько хватит шприца
    over: bool = False   # выше обычной дозы
    typical: bool = False
    current: bool = False


@dataclass
class Plan:
    drug: Drug
    weight_g: int
    mode: str                    # dilute | draw | check
    ok: bool = True
    amount: float = 0.0          # препарата в шприце, мг или мкг
    draw_ml: float = 0.0         # набрать из ампулы
    volume: float = 0.0          # итоговый объём, мл
    diluent_ml: float = 0.0
    conc: float = 0.0            # фактическая концентрация в шприце
    rule: tuple = ()             # (скорость, доза), если задано правило
    rule_dose_actual: float = 0.0
    work_rate: float = 0.0       # скорость, на которой обычно пойдёт шприц
    work_dose: float = 0.0
    hours: float = 0.0           # на сколько хватит на этой скорости
    syringe_ml: int = 0
    rows: list = field(default_factory=list)
    warnings: list = field(default_factory=list)
    alternative: "Plan | None" = None
    alternative_why: str = ""
    error: str = ""

    @property
    def weight_kg(self) -> float:
        return self.weight_g / 1000

    @property
    def per_rate(self) -> float:
        """Доза, которую даёт 1 мл/ч этого шприца."""
        return self.conc / self.weight_kg if self.weight_kg else 0.0


# --------------------------------------------------------------------------
# Внутренние помощники
# --------------------------------------------------------------------------
def _syringe(volume: float) -> int:
    for size in SETTINGS.syringes_ml:
        if volume <= size + EPS:
            return size
    return 0


def _work_dose(drug: Drug, rule: tuple | None) -> float:
    """Доза, на которой шприц, скорее всего, будет идти.

    Правило вроде «0,3 = 0,06» и есть рабочая доза. А «0,1 = 1» у фентанила —
    это шкала: работают на 3–6 мкг/кг/ч. Поэтому берём большее из дозы
    в правиле и нижней границы обычного диапазона.
    """
    low = drug.typical[0]
    return max(rule[1], low) if rule else low


def _rows(drug: Drug, per_rate: float, volume: float, extra=()) -> list:
    """Таблица «скорость → доза» под конкретный шприц.

    Шаг подбирается так, чтобы обычный диапазон уложился в 6–10 строк,
    и таблица заканчивается чуть выше верхней границы обычной дозы.
    """
    if per_rate <= 0:
        return []
    top_rate = drug.warn_above * 1.35 / per_rate
    step = next((s for s in (0.1, 0.2, 0.5, 1.0) if top_rate / s <= 10), 1.0)
    rates = []
    r = step
    while (r <= top_rate + EPS or len(rates) < MIN_ROWS) and len(rates) < 12:
        rates.append(round_to(r, 0.01))
        r += step
    marked = {round_to(x, 0.01) for x in extra if x and x > 0}
    rates = sorted(set(rates) | marked)

    lo, hi = drug.typical
    out = []
    for rate in rates:
        dose = per_rate * rate
        shown = round_to(dose, 10 ** -drug.dose_digits)
        out.append(Row(
            rate=rate,
            dose=dose,
            hours=volume / rate if rate else 0.0,
            over=shown > drug.warn_above + EPS,
            typical=lo - EPS <= shown <= hi + EPS,
            current=rate in marked,
        ))
    return out


def _finish(plan: Plan, rule: tuple | None, extra_rates=(), work_rate: float | None = None) -> Plan:
    drug = plan.drug
    plan.conc = plan.amount / plan.volume
    plan.syringe_ml = _syringe(plan.volume)
    if rule:
        plan.rule = rule
        plan.rule_dose_actual = plan.per_rate * rule[0]
    if work_rate:
        plan.work_rate = work_rate
        plan.work_dose = plan.per_rate * work_rate
    else:
        plan.work_dose = _work_dose(drug, rule)
        plan.work_rate = round_to(plan.work_dose / plan.per_rate, 0.01)
    plan.hours = plan.volume / plan.work_rate if plan.work_rate else 0.0
    # Таблицу под правило строим по самому правилу: объём округлён до 0,1 мл,
    # и без этого вместо «0,2 мл/ч = 2» вылезло бы «1,99». Разница меньше 1%,
    # мерная шкала шприца грубее. Готовый шприц (check) — по фактическим числам.
    per_rate = rule[1] / rule[0] if rule else plan.per_rate
    plan.rows = _rows(drug, per_rate, plan.volume,
                      extra=(rule[0] if rule else None, *extra_rates))

    if plan.volume > SETTINGS.syringe_max_ml + EPS:
        plan.warnings.append(
            f"{num(plan.volume, 1)} мл не влезет в шприц на {num(SETTINGS.syringe_max_ml)} мл."
        )
    if rule and rule[1] > drug.warn_above + EPS:
        plan.warnings.append(
            f"{drug.dose(rule[1])} {drug.dose_unit} — выше обычного "
            f"(до {drug.dose(drug.warn_above)}). Следи за давлением и дыханием."
        )
    if plan.work_rate and plan.work_rate <= 0.2 + EPS and plan.syringe_ml >= 50:
        plan.warnings.append(
            "На 0,1–0,2 мл/ч большой шприц подаёт неровно — лучше объём поменьше."
        )
    return plan


def _economy(plan: Plan) -> None:
    """Предлагает другой объём, если шприц не влезает, идёт неделю или кончится за полсмены."""
    if not plan.ok or plan.mode == "check" or not plan.work_rate:
        return
    drug = plan.drug
    need_24 = plan.conc * plan.work_rate * SETTINGS.change_h   # мг или мкг на сутки
    too_big = plan.volume > SETTINGS.syringe_max_ml + EPS
    too_long = plan.hours > 2 * SETTINGS.change_h + EPS
    too_short = plan.hours < SETTINGS.change_h / 2 - EPS

    if too_big or too_long:
        # Часть ампулы, кратная 0,1 мл, — на сутки и чуть больше.
        draw_ml = max(SETTINGS.min_draw_ml, ceil_to(need_24 / drug.conc, SETTINGS.min_draw_ml))
        if draw_ml >= plan.draw_ml - EPS:
            return
        why = ("Целиком в шприц не влезает." if too_big
               else "Шприц всё равно меняют раз в сутки — остальное ушло бы в отход.")
    elif too_short:
        # Целые ампулы: наркотическое средство вскрывают ампулами.
        ampoules = math.ceil(need_24 / drug.amp_amount - EPS)
        draw_ml = ampoules * drug.amp_ml
        if draw_ml <= plan.draw_ml + EPS:
            return
        why = f"Исходный шприц закончится меньше чем через {num(SETTINGS.change_h / 2)} ч."
    else:
        return

    amount = draw_ml * drug.conc
    alt = dilute(drug, plan.weight_g, amount, plan.rule or None, _alternative=True)
    if alt.ok and alt.volume <= SETTINGS.syringe_max_ml + EPS:
        plan.alternative = alt
        plan.alternative_why = why


# --------------------------------------------------------------------------
# Три вопроса
# --------------------------------------------------------------------------
def _bad_input(plan: Plan, **values) -> bool:
    """Ноль и отрицательные числа не считаем — иначе деление на ноль или чушь."""
    bad = [name for name, v in values.items() if v is None or not v > 0]
    if bad or not plan.weight_g or plan.weight_g <= 0:
        plan.ok = False
        plan.error = "Все числа должны быть больше нуля: масса, скорость, доза, количество, объём."
        return True
    return False


def concentration_for(weight_g: int, rule: tuple) -> float:
    """Какая концентрация нужна, чтобы rule[0] мл/ч давали rule[1] на кг в час."""
    rate, dose = rule
    return dose * (weight_g / 1000) / rate


def dilute(drug: Drug, weight_g: int, amount: float | None = None,
           rule: tuple | None = None, _alternative: bool = False) -> Plan:
    """Взял amount препарата — до скольки развести, чтобы выполнялось правило."""
    rule = tuple(rule) if rule else drug.rule
    amount = drug.amp_amount if amount is None else amount
    plan = Plan(drug=drug, weight_g=weight_g, mode="dilute", amount=amount)
    if _bad_input(plan, rate=rule[0], dose=rule[1], amount=amount):
        return plan
    plan.draw_ml = amount / drug.conc

    need = concentration_for(weight_g, rule)
    if need > drug.conc + EPS:
        plan.ok = False
        rate_min = ceil_to(rule[1] * plan.weight_kg / drug.conc, 0.1)
        plan.rule = rule
        plan.error = (
            f"Для {num(rule[0])} мл/ч = {drug.dose(rule[1])} {drug.dose_unit} нужна "
            f"концентрация {num(need, 1)} {drug.unit}/мл — это крепче, чем в ампуле "
            f"({num(drug.conc)} {drug.unit}/мл). Возьми правило с большей скоростью: "
            f"{num(rate_min)} мл/ч = {drug.dose(rule[1])} {drug.dose_unit}."
        )
        return plan

    exact = amount / need
    # Маленький объём отмеряют точнее: 3,33 мл, а не 3,3 — иначе ошибка до 2,5%.
    plan.volume = max(round_to(exact, 0.01 if exact < 5 else 0.1), round_to(plan.draw_ml, 0.01))
    plan.diluent_ml = max(0.0, plan.volume - plan.draw_ml)
    _finish(plan, rule)
    if not _alternative:
        _economy(plan)
    return plan


def draw(drug: Drug, weight_g: int, volume: float,
         rule: tuple | None = None) -> Plan:
    """Хочу шприц на volume мл — сколько набрать препарата под правило."""
    rule = tuple(rule) if rule else drug.rule
    plan = Plan(drug=drug, weight_g=weight_g, mode="draw", volume=volume)
    if _bad_input(plan, rate=rule[0], dose=rule[1], volume=volume):
        return plan
    need = concentration_for(weight_g, rule)
    if need > drug.conc + EPS:
        plan.ok = False
        plan.rule = rule
        plan.error = (
            f"Нужна концентрация {num(need, 1)} {drug.unit}/мл — крепче, чем в ампуле "
            f"({num(drug.conc)} {drug.unit}/мл). Возьми правило с большей скоростью."
        )
        return plan

    plan.draw_ml = round_to(need * volume / drug.conc, 0.01)
    plan.amount = plan.draw_ml * drug.conc
    if plan.draw_ml < 0.01 - EPS:
        plan.ok = False
        plan.rule = rule
        plan.error = "Препарата нужно меньше 0,01 мл — так не отмерить. Увеличь объём."
        return plan
    plan.diluent_ml = max(0.0, volume - plan.draw_ml)
    _finish(plan, rule)
    if plan.draw_ml < SETTINGS.min_draw_ml - EPS:
        plan.warnings.insert(0, (
            f"{num(plan.draw_ml)} мл из ампулы точно не отмерить — меньше "
            f"{num(SETTINGS.min_draw_ml)} мл не бери. Увеличь объём шприца."
        ))
    _economy(plan)
    return plan


def check(drug: Drug, weight_g: int, amount: float, volume: float,
          rate: float | None = None, target: float | None = None) -> Plan:
    """Шприц готов: amount препарата в volume мл. Какая доза на какой скорости."""
    plan = Plan(drug=drug, weight_g=weight_g, mode="check",
                amount=amount, volume=volume)
    if _bad_input(plan, amount=amount, volume=volume,
                  **({"rate": rate} if rate is not None else {}),
                  **({"target": target} if target is not None else {})):
        return plan
    plan.draw_ml = amount / drug.conc
    if plan.draw_ml > volume + EPS:
        plan.ok = False
        plan.error = (
            f"{drug.amount(amount)} {drug.unit} — это {num(plan.draw_ml)} мл ампульного "
            f"раствора, в {num(volume, 1)} мл не помещается."
        )
        return plan
    plan.diluent_ml = volume - plan.draw_ml
    extra = [rate] if rate else []
    target_rate = None
    if target:
        target_rate = round_to(target * (weight_g / 1000) / (amount / volume), 0.01)
        extra.append(target_rate)
    _finish(plan, None, extra_rates=extra, work_rate=rate or target_rate)
    if rate and plan.per_rate * rate > drug.warn_above + EPS:
        plan.warnings.append(
            f"На {num(rate)} мл/ч выходит {drug.dose(plan.per_rate * rate)} "
            f"{drug.dose_unit} — выше обычного (до {drug.dose(drug.warn_above)})."
        )
    return plan


def rate_for(plan: Plan, dose: float) -> float:
    """Какую скорость поставить, чтобы шла доза dose."""
    return dose / plan.per_rate if plan.per_rate else 0.0


def dose_at(plan: Plan, rate: float) -> float:
    return plan.per_rate * rate


# --------------------------------------------------------------------------
# Запрос из чата: «мидазолам 468 0,1=0,03», «фентанил 1,18 2 амп»
# --------------------------------------------------------------------------
_NUM = r"(\d+(?:[.,]\d+)?)"
_RULE_RE = re.compile(_NUM + r"\s*(?:мл\s*/\s*ч(?:ас)?\.?|мл)?\s*=\s*" + _NUM
                      + r"(?:\s*(?:мкг|мг)\s*/\s*кг\s*/\s*ч(?:ас)?\.?)?")
_VOLUME_RE = re.compile(r"(?<![а-я])до\s*" + _NUM + r"\s*(?:мл)?")
_RATE_RE = re.compile(r"скорост[а-я]*\s*" + _NUM + r"(?:\s*мл\s*/\s*ч(?:ас)?\.?)?")
_AMP_RE = re.compile(_NUM + r"\s*амп[а-я]*\.?")
_MCG_RE = re.compile(_NUM + r"\s*(?:мкг|mcg)(?![а-я/])")
_MG_RE = re.compile(_NUM + r"\s*(?:мг|mg)(?![а-я/])")
_GRAM_RE = re.compile(_NUM + r"\s*(?:кг|г|гр|грамм[а-я]*)?(?![а-я])")


def _f(raw: str) -> float:
    return float(raw.replace(",", "."))


@dataclass
class Query:
    drug: Drug | None = None
    weight_g: int | None = None
    rule: tuple | None = None
    amount: float | None = None
    volume: float | None = None
    rate: float | None = None
    problems: list = field(default_factory=list)

    @property
    def mode(self) -> str:
        return "check" if self.volume else "dilute"


def parse_query(text: str) -> Query:
    """Разбирает короткий запрос врача. Ничего не угадывает молча.

    Каждое распознанное число вырезается из строки. Если в конце осталось
    число, которому не нашлось смысла, — это не игнорируется, а попадает
    в problems: лучше переспросить, чем посчитать не то.
    """
    q = Query()
    work = " " + (text or "").lower().replace("ё", "е") + " "
    q.drug = find_drug(work)

    def take(regex):
        nonlocal work
        m = regex.search(work)
        if not m:
            return None
        work = work[:m.start()] + " " + work[m.end():]
        return m

    m = take(_RULE_RE)
    if m:
        q.rule = (_f(m.group(1)), _f(m.group(2)))
    m = take(_VOLUME_RE)
    if m:
        q.volume = _f(m.group(1))
    m = take(_RATE_RE)
    if m:
        q.rate = _f(m.group(1))

    amp = take(_AMP_RE)
    mcg = take(_MCG_RE)
    mg = take(_MG_RE)
    if q.drug:
        if amp:
            q.amount = _f(amp.group(1)) * q.drug.amp_amount
        elif mcg:
            value = _f(mcg.group(1))
            q.amount = value if q.drug.unit == "мкг" else value / 1000
        elif mg:
            value = _f(mg.group(1))
            q.amount = value if q.drug.unit == "мг" else value * 1000

    # Остались голые числа — среди них масса. Граммы (≥ 300) надёжнее
    # килограммов: «2» может быть и массой, и ампулами.
    numbers = [(_f(m.group(1)), m.group(1)) for m in _GRAM_RE.finditer(work)]
    grams = [int(round(v)) for v, raw in numbers if 300 <= v <= 7000 and "," not in raw and "." not in raw]
    kilos = [int(round(v * 1000)) for v, raw in numbers if 0.3 <= v <= 7 and ("," in raw or "." in raw or v < 20)]
    if len(grams) == 1:
        q.weight_g = grams[0]
        used = {str(grams[0])}
    elif not grams and len(kilos) == 1:
        q.weight_g = kilos[0]
        used = {raw for v, raw in numbers if int(round(v * 1000)) == kilos[0]}
    else:
        used = set()
        if grams or kilos:
            q.problems.append("Не понял, какое из чисел — масса. Напишите её в граммах: 1200.")
        elif numbers:
            q.problems.append("Масса — от 300 до 7000 г, или от 0,3 до 7 кг.")
    leftovers = [raw for v, raw in numbers if raw not in used and str(int(round(v))) not in used]
    if q.weight_g and leftovers:
        q.problems.append(
            "Не понял числа " + ", ".join(leftovers) + ". Правило пишите через «=»: "
            "0,3=0,03; количество — с единицами: 2 амп, 1 мг, 100 мкг."
        )
    zeros = [v for v in (*(q.rule or ()), q.amount, q.volume, q.rate) if v is not None and v <= 0]
    if zeros:
        q.problems.append("Ноль не подходит: скорость, доза, количество и объём — больше нуля.")
    if q.weight_g is None and not q.problems:
        q.problems.append("Нужна масса ребёнка — например, 1200 г.")
    return q
