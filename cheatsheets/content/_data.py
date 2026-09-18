# -*- coding: utf-8 -*-
"""Общие данные для шпаргалок.

Пороги билирубина лежат в data/bilirubin.json и оттуда же берутся
калькулятором bili/. Здесь — конструкторы таблиц для PDF, чтобы
цифры в шпаргалке и в калькуляторе физически не могли разойтись.
"""
from __future__ import annotations

import json
import os

from neocheat.blocks import Table

DATA_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data"
)


def load(name: str) -> dict:
    with open(os.path.join(DATA_DIR, f"{name}.json"), encoding="utf-8") as f:
        return json.load(f)


BILI = load("bilirubin")
SURF = load("surfactants")
ABX = load("antibiotics")
VITALS = load("vitals")
SCALES = load("scales")
INOTROPES = load("inotropes")
VENT = load("ventilation")
KR = load("guidelines")["guidelines"]


def kr_sources(*ids: str) -> list:
    """Строки для раздела «Источники» по ID из рубрикатора КР МЗ РФ."""
    out = []
    for cid in ids:
        g = KR.get(cid)
        if g is None:
            raise KeyError(f"Нет КР с ID {cid} в data/guidelines.json")
        out.append(
            f"Клинические рекомендации МЗ РФ «{g['name']}» — ID {g['id']}, "
            f"размещены {g['date']}. {g['url']}"
        )
    return out

# Часы, которые показываем в PDF (в JSON опорных точек больше — они нужны
# калькулятору для интерполяции).
def risk_factors_sentence() -> str:
    # Строчной делаем только первую букву каждого пункта: сплошной .lower()
    # испортил бы аббревиатуры (ГБН, Г6ФД, FiO₂).
    labels = [f["label"][:1].lower() + f["label"][1:] for f in BILI["risk_factors"]]
    return (
        "Факторы риска: " + ", ".join(labels) + ". "
        "Практически любой ребёнок с ГБН попадает минимум в средний риск, "
        "а недоношенный с ГБН — в высокий."
    )


KR_SCALE = BILI["scales"]["kr_rf"]
AAP = BILI["scales"]["aap"]


def _validate_bilirubin() -> None:
    """Проверяет согласованность таблиц порогов при каждой сборке.

    Опечатка в одной цифре data/bilirubin.json иначе тихо уедет и в PDF,
    и в калькулятор, и в бота — поэтому падаем сразу.
    """
    n = len(KR_SCALE["hour_bands"])
    for band in KR_SCALE["ga_bands"]:
        for key in ("phototherapy", "intensive", "exchange"):
            got = len(band[key])
            if got != n:
                raise ValueError(
                    f"{band['label']}, {key}: {got} значений вместо {n}"
                )
        for i in range(n):
            pt, inten, ex = (band[k][i] for k in ("phototherapy", "intensive", "exchange"))
            if not pt < inten < ex:
                raise ValueError(
                    f"{band['label']}, {KR_SCALE['hour_bands'][i]['label']}: нарушена "
                    f"лестница порогов — станд. ФТ {pt}, интенс. ФТ {inten}, ОЗПК {ex}"
                )
        for key in ("phototherapy", "intensive", "exchange"):
            row = band[key]
            if any(row[i] > row[i + 1] for i in range(n - 1)):
                raise ValueError(
                    f"{band['label']}, {key}: порог убывает с возрастом — {row}"
                )

    for gid in (g["id"] for g in AAP["risk_groups"]):
        for key in ("phototherapy", "exchange"):
            if len(AAP[key][gid]) != len(AAP["hours"]):
                raise ValueError(f"AAP {key}/{gid}: длина ряда не совпадает с hours")
        if any(p >= e for p, e in zip(AAP["phototherapy"][gid], AAP["exchange"][gid])):
            raise ValueError(f"AAP {gid}: порог ФТ не ниже порога ОЗПК")


_validate_bilirubin()


def _kr_table(level_id: str, caption: str, tone: str = "") -> Table:
    """Ступенчатая таблица КР МЗ РФ: строки — ГВ/СВ, колонки — интервалы часов."""
    head = ["ГВ / СВ"] + [f"{hb['short']} ч" for hb in KR_SCALE["hour_bands"]]
    rows = [
        [f"<b>{b['label']}</b>"] + [f"{tone}{v}" for v in b[level_id]]
        for b in KR_SCALE["ga_bands"]
    ]
    return Table(
        caption=caption,
        head=head,
        widths=[1.5] + [1] * len(KR_SCALE["hour_bands"]),
        align="l" + "c" * len(KR_SCALE["hour_bands"]),
        rows=rows,
        font_size=7.8,
    )


def kr_phototherapy_table() -> Table:
    return _kr_table("phototherapy", "Стандартная фототерапия")


def kr_intensive_table() -> Table:
    return _kr_table("intensive", "Интенсивная фототерапия", tone="! ")


def kr_exchange_table() -> Table:
    return _kr_table("exchange", "Операция заменного переливания крови", tone="!! ")


def aap_table(kind: str, caption: str, tone: str = "") -> Table:
    """Справочные кривые AAP 2004 в опорных точках (в РФ приоритет у КР)."""
    hours = [24, 48, 72, 96, 120]
    idx = [AAP["hours"].index(h) for h in hours]
    head = ["Группа риска"] + [f"{h} ч" if h != hours[-1] else f"≥ {h} ч" for h in hours]
    rows = [
        [g["label"]] + [f"{tone}{AAP[kind][g['id']][i]}" for i in idx]
        for g in AAP["risk_groups"]
    ]
    return Table(caption=caption, head=head, widths=[1.4] + [1] * len(hours),
                 align="l" + "c" * len(hours), rows=rows)


def aap_risk_groups_table() -> Table:
    return Table(
        caption="Группы риска AAP",
        head=None, widths=[1, 4], zebra=False,
        rows=[[f"<b>{g['label']}</b>", g["desc"]] for g in AAP["risk_groups"]],
    )


def hourly_rise_table() -> Table:
    tone_marks = {"ok": "+ ", "info": "~ ", "warn": "! ", "danger": "!! "}
    rows = []
    prev = None
    for band in BILI["hourly_rise"]:
        top = band["max"]
        if prev is None:
            label = f"&lt; {top}".replace(".", ",")
        elif top is None:
            label = f"&gt; {prev}".replace(".", ",")
        else:
            label = f"{prev}–{top}".replace(".", ",")
        rows.append([
            f"{tone_marks[band['tone']]}{label}",
            band["title"],
            band["action"],
        ])
        prev = top
    return Table(
        head=["Прирост, мкмоль/л/ч", "Что это значит", "Действие"],
        widths=[1.2, 2.2, 2.6],
        align="cll",
        rows=rows,
    )


def transfusion_table() -> Table:
    t = BILI["transfusion"]
    def cell(pair):
        hb, ht = pair
        return f"Hb &lt; {hb} (Ht &lt; {ht:.2f})".replace(".", ",")

    rows = [
        [row["week"], cell(row["ventilated"]), cell(row["support"]), cell(row["none"])]
        for row in t["thresholds"]
    ]
    return Table(
        head=["Возраст", "ИВЛ или FiO₂ &gt; 0,35", "CPAP / FiO₂ ≤ 0,35",
              "Без респираторной поддержки"],
        widths=[1.1, 1.6, 1.6, 1.7],
        align="lccc",
        rows=rows,
    )


# --------------------------------------------------------------------------
# Сурфактанты
# --------------------------------------------------------------------------
def _fmt(v: float, digits: int = 1) -> str:
    return f"{v:.{digits}f}".rstrip("0").rstrip(".").replace(".", ",")


def surfactant_doses_table() -> Table:
    """Дозы по инструкциям; препараты, названные в КР, помечены."""
    named = set(SURF["kr_named"])
    rows = []
    for d in SURF["drugs"]:
        lo, hi = d["first_mg_kg"]
        first = f"{lo} мг/кг" if lo == hi else f"{lo}–{hi} мг/кг"
        conc = f"{_fmt(d['conc_mg_ml'])} мг/мл" if d["conc_mg_ml"] else "после разведения"
        limit = []
        if d["max_doses"]:
            limit.append(f"до {d['max_doses']} доз")
        if d["max_total_mg_kg"]:
            limit.append(f"суммарно ≤ {d['max_total_mg_kg']} мг/кг")
        rows.append([
            ("+ " if d["id"] in named else "") + f"<b>{d['inn']}</b><br/>{d['brand']}",
            conc,
            first,
            f"{d['repeat_mg_kg']} мг/кг<br/>через {d['interval_h']} ч",
            "; ".join(limit) or "—",
        ])
    return Table(
        caption="Дозы по инструкциям к препаратам",
        head=["Препарат", "Концентрация", "Первая доза", "Повторная", "Ограничение"],
        widths=[1.5, 1.0, 1.1, 1.1, 1.3],
        align="lcccl",
        font_size=8.0,
        rows=rows,
    )


def surfactant_volume_table() -> Table:
    """Готовые объёмы в миллилитрах по массе тела — чтобы не считать у постели.

    Берём только препараты, названные в КР: иначе таблица становится слишком
    широкой и перестаёт читаться с телефона.
    """
    named = set(SURF["kr_named"])
    specs = []
    for d in SURF["drugs"]:
        if d["id"] not in named or not d["conc_mg_ml"]:
            continue
        short = d["inn"].split()[0]
        lo, hi = d["first_mg_kg"]
        if hi != lo:
            specs.append((f"{short}<br/>{hi} мг/кг", d["conc_mg_ml"], hi))
        specs.append((f"{short}<br/>{d['repeat_mg_kg']} мг/кг", d["conc_mg_ml"], d["repeat_mg_kg"]))

    rows = []
    for g in SURF["weights_g"]:
        kg = g / 1000
        rows.append([f"<b>{g} г</b>"]
                    + [f"{mg_kg * kg / conc:.1f}".replace(".", ",") for _, conc, mg_kg in specs])
    return Table(
        caption="Объём на введение, мл",
        head=["Масса"] + [label for label, _, _ in specs],
        widths=[1.0] + [1.0] * len(specs),
        align="l" + "c" * len(specs),
        rows=rows,
    )


# --------------------------------------------------------------------------
# Антимикробные препараты
# --------------------------------------------------------------------------
def antibiotic_table() -> Table:
    """Схемы дозирования дословно по приложению А3.4 КР «Сепсис новорождённых».

    Условие в КР задаётся по-разному — массой, гестационным возрастом или
    возрастом в днях. Сводить их к одной схеме нельзя: потеряется смысл,
    поэтому колонка «Когда» повторяет формулировку КР.
    """
    rows = []
    group = None
    for drug in ABX["drugs"]:
        if drug["group"] != group:
            group = drug["group"]
            rows.append(f"~ {group}")
        for i, r in enumerate(drug["rows"]):
            rows.append([
                f"<b>{drug['name']}</b>" if i == 0 else "",
                r["when"], r["dose"], r["freq"],
            ])
        if drug.get("note"):
            rows.append(["", f"<i>{drug['note']}</i>", "", ""])
    return Table(
        head=["Препарат", "Когда", "Разовая доза", "Кратность"],
        widths=[1.2, 2.3, 1.1, 1.2],
        align="llcl",
        font_size=7.6,
        rows=rows,
    )


def antibiotic_reckoner_table() -> Table:
    """Готовая разовая доза в миллиграммах по массе тела."""
    items = ABX["reckoner"]
    head = ["Масса"] + [f"{it['name']}<br/>{it['label']}" for it in items]
    rows = []
    for g in ABX["reckoner_weights_g"]:
        kg = g / 1000
        cells = [f"<b>{g} г</b>"]
        for it in items:
            # Округляем до десятых и убираем хвостовой ноль: у аминогликозидов
            # половина миллиграмма значима, а «30,0» вместо «30» только шумит.
            mg = round(it["mg_kg"] * kg, 1)
            cells.append(f"{mg:.1f}".rstrip("0").rstrip(".").replace(".", ","))
        rows.append(cells)
    return Table(
        caption="Разовая доза в миллиграммах",
        head=head,
        widths=[0.9] + [1.0] * len(items),
        align="l" + "c" * len(items),
        font_size=7.6,
        rows=rows,
    )


# --------------------------------------------------------------------------
# Витальные показатели
# --------------------------------------------------------------------------
def mean_bp_table() -> Table:
    """Среднее АД — приложение А3.8 КР «Сепсис новорождённых», дословно."""
    bp = VITALS["mean_bp"]
    return Table(
        caption=f"Среднее артериальное давление, {bp['unit']}",
        head=["ГВ / ПКВ"] + [f"{h} ч" for h in bp["hours"]],
        widths=[1.6] + [1.0] * len(bp["hours"]),
        align="l" + "c" * len(bp["hours"]),
        rows=[[f"<b>{b['label']}</b>"] + [str(v) for v in b["values"]] for b in bp["bands"]],
    )


# --------------------------------------------------------------------------
# Шкалы оценки
# --------------------------------------------------------------------------
def _sign(v: int) -> str:
    return f"+{v}" if v > 0 else str(v).replace("-", "−")


def scale_table(scale_id: str) -> Table:
    """Пункты шкалы: подзаголовок на пункт, под ним варианты с баллами."""
    sc = next(s for s in SCALES["scales"] if s["id"] == scale_id)
    rows = []
    for i, item in enumerate(sc["items"], 1):
        head = f"~ {i}. {item['label']}"
        if item.get("hint"):
            head += f" — {item['hint']}"
        rows.append(head)
        for o in item["options"]:
            rows.append([f"<b>{_sign(o['score'])}</b>", o["label"]])
    return Table(
        head=["Балл", "Признак"],
        widths=[0.5, 5.0],
        align="cl",
        font_size=8.0,
        rows=rows,
    )


def scale_modifier_table(scale_id: str) -> Table:
    sc = next(s for s in SCALES["scales"] if s["id"] == scale_id)
    mod = sc["modifier"]
    return Table(
        caption=mod["label"],
        head=["Балл", "Гестационный возраст"],
        widths=[0.5, 5.0],
        align="cl",
        rows=[[f"<b>{_sign(o['score'])}</b>", o["label"]] for o in mod["options"]],
    )


def inotrope_table() -> Table:
    """Приложение А3.6: дозы кардиотоников — старт, диапазон, шаг, отмена."""
    rows = []
    for d in INOTROPES["drugs"]:
        rows.append([
            f"<b>{d['name']}</b>",
            d["start"], d["range"], d["titrate"], d["wean"],
        ])
    return Table(
        caption=f"Дозы в {INOTROPES['unit']} · приложение {INOTROPES['appendix']} КР {INOTROPES['kr_id']}",
        head=["Препарат", "Старт", "Диапазон", "Шаг титрования", "Шаг отмены"],
        widths=[1.4, 1.0, 1.0, 1.1, 1.0],
        align="lcccc",
        rows=rows,
    )


def inotrope_cautions_table() -> Table:
    """О чём помнить при каждом препарате — из той же таблицы А3.6."""
    return Table(
        head=["Препарат", "На что смотреть"],
        widths=[1.4, 4.0],
        rows=[[f"<b>{d['name']}</b>", " · ".join(d["cautions"])] for d in INOTROPES["drugs"]],
    )


def vis_table() -> Table:
    """Препараты, коэффициенты и обычные дозы для расчёта VIS."""
    sc = next(s for s in SCALES["scales"] if s["id"] == "vis")
    rows = []
    for inp in sc["inputs"]:
        rows.append([
            f"<b>{inp['drug']}</b>",
            inp["unit"],
            f"× {inp['coef']}",
            inp.get("typical", "—"),
        ])
    return Table(
        head=["Препарат", "Единицы", "Коэффициент", "Обычная доза"],
        widths=[1.6, 1.3, 1.0, 1.4],
        align="llcc",
        rows=rows,
    )


def stage_table(scale_id: str) -> Table:
    """Шкала-стадия в том же виде, в каком она напечатана в приложении КР."""
    sc = next(s for s in SCALES["scales"] if s["id"] == scale_id)
    rows = []
    for item in sc["items"]:
        cells = {1: "", 2: "", 3: ""}
        for o in item["options"]:
            if o["stage"] is None:
                # Вариант, общий для стадий I и II: в источнике он напечатан в обеих
                # колонках, так и оставляем.
                text = o["label"].split(" — ")[0]
                cells[1] = cells[2] = text
            else:
                cells[o["stage"]] = o["label"]
        rows.append([item["label"], cells[1], cells[2], f"!! {cells[3]}"])
    return Table(
        head=["Признак", "Стадия I", "Стадия II", "Стадия III"],
        widths=[1.1, 1.2, 1.4, 1.5],
        font_size=8.0,
        rows=rows,
    )


def stage_summary_table(scale_id: str) -> Table:
    """Длительность, прогноз и что это значит для тактики."""
    sc = next(s for s in SCALES["scales"] if s["id"] == scale_id)
    tones = {"ok": "+ ", "info": "~ ", "warn": "! ", "danger": "!! "}
    return Table(
        head=["Стадия", "Длительность", "Прогноз", "Что это значит"],
        widths=[1.1, 1.1, 1.1, 2.1],
        rows=[[f"{tones[st['tone']]}{st['title']}", st["duration"], st["prognosis"], st["text"]]
              for st in sc["stages"]],
    )


def scale_bands_table(scale_id: str, key: str = "bands", caption: str = None) -> Table:
    """Трактовка суммы. Диапазоны выводятся из верхних границ полос."""
    sc = next(s for s in SCALES["scales"] if s["id"] == scale_id)
    tones = {"ok": "+ ", "info": "~ ", "warn": "! ", "danger": "!! "}
    # Верхняя граница открытой полосы: у ограниченной шкалы её видно из max,
    # но у N-PASS поправка на недоношенность поднимает потолок, поэтому там «≥».
    top = None if sc.get("modifier") else sc.get("max")
    rows, prev = [], sc.get("min", 0) if key == "bands" else 0
    for b in sc[key]:
        if b["max"] is None:
            rng = f"{prev}–{top}" if top is not None and top > prev else f"≥ {prev}"
        elif b["max"] == prev:
            rng = str(prev)
        else:
            rng = f"{prev}–{b['max']}" if prev != b["max"] else str(b["max"])
        rows.append([f"{tones[b['tone']]}{rng}", f"<b>{b['title']}</b>", b["text"]])
        prev = (b["max"] + 1) if b["max"] is not None else prev
    return Table(
        caption=caption,
        head=["Баллы", "Трактовка", "Что делать"],
        widths=[0.8, 1.5, 3.2],
        align="cll",
        rows=rows,
    )


# --------------------------------------------------------------------------
# Респираторная поддержка
# --------------------------------------------------------------------------
def start_vent_table(only: list = None) -> Table:
    """Стартовые параметры ИВЛ — приложение А3.7 КР «Сепсис новорождённых».

    КР режет параметры по особенностям течения заболевания, а не по массе.
    `only` оставляет подмножество состояний — чтобы в шпаргалке по ПЛГН
    показать её рядом с меконием, а не всю таблицу.
    """
    rows = []
    for st in VENT["start_params"]:
        if only and st["state"] not in only:
            continue
        mark = "!! " if st.get("highlight") else ""
        targets = "<br/>".join(st["targets"])
        if st["warn"]:
            targets += f"<br/><b>{st['warn']}</b>"
        rows.append([
            f"{mark}<b>{st['state']}</b>",
            "<br/>".join(st["params"]),
            targets,
        ])
    return Table(
        caption="Стартовые параметры инвазивной ИВЛ",
        head=["Состояние", "Стартовые параметры", "Целевые газы"],
        widths=[1.6, 1.5, 1.9],
        align="lll",
        font_size=7.8,
        rows=rows,
    )
