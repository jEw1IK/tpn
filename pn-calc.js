/* Калькулятор парентерального питания: проверка ввода и расчёт, без DOM.
   Этим файлом пользуется index.html, его же гоняет cheatsheets/tests/test_pn.py через node.
   Формулы и допущения разобраны в docs/PN_AUDIT.md.

   Состояние результата:
     invalid    — ввод некорректен, расчёта нет, ничего из прежнего показывать нельзя;
     impossible — назначение в таком виде не приготовить; числа — цель, а не обеспеченное;
     ok         — расчёт выполним. Это проверка арифметики, не клиническая валидация. */
(function (root) {
  'use strict';

  /* ---------- Пороговые значения (правьте под протокол отделения) ---------- */
  var LIMITS = {
    gir:        { min: 4,   max: 12,  hardMax: 14 },   // мг/кг/мин
    protein:    { min: 1.5, max: 4.0 },                // г/кг/сут, суммарно
    lipid:      { max: 4.0 },                          // г/кг/сут
    kcalPerKg:  { min: 90,  max: 120 },                // ккал/кг/сут, суммарно
    gluPeriph:  12.5,                                  // % глюкозы в периферию
    gluStockMax: 40,                                   // % — самый концентрированный исходный раствор
    gluStockMin: 5,                                    // % — самый слабый исходный раствор
    osmPeriph:  900,                                   // мосм/л в периферию
    npcPerN:    { min: 100, max: 200 }                 // небелковые ккал на 1 г азота
  };

  /* ---------- Коэффициенты ---------- */
  var KCAL_AA = 4.0;           // ккал/г аминокислот
  var KCAL_GLU = 3.4;          // ккал/г глюкозы — значение для моногидрата; см. docs/PN_AUDIT.md
  var KCAL_ML_LIPID = { 20: 2.0, 10: 1.1 };  // ккал/мл эмульсии
  var N_PER_PROTEIN = 6.25;    // г белка на 1 г азота
  var HOURS = 24;              // инфузия рассчитана на сутки
  var GIR_TO_G_PER_KG_DAY = 1.44;   // мг/кг/мин × 1440 мин ÷ 1000 = г/кг/сут
  var OSM = { gluPerGram: 5.55, aaPerGram: 10, na: 2, k: 2, ca: 3 };  // мосм на единицу, оценка
  var GLUCOSE_STOCKS = [[5, 40], [10, 40], [5, 20], [10, 20]];      // пары исходных растворов, %
  var EPS = 1e-9;

  /* Поля ввода. Диапазоны — те же min/max, что заявлены в разметке index.html:
     это явно поддерживаемая область, вне неё расчёт не выдаётся. */
  var FIELDS = {
    weight:        { label: 'Масса тела',                  unit: 'г',          min: 300, max: 10000 },
    ga:            { label: 'ГВ',                          unit: 'нед',        min: 22,  max: 44, soft: true },
    dol:           { label: 'Сутки жизни',                 unit: 'сут',        min: 0,   max: 90, soft: true },
    fluid:         { label: 'Общий объём',                 unit: 'мл/кг/сут',  min: 0,   max: 250 },
    other:         { label: 'Прочее в/в',                  unit: 'мл/кг/сут',  min: 0,   max: 150 },
    enteral:       { label: 'Объём энтерального питания',  unit: 'мл/кг/сут',  min: 0,   max: 250 },
    entProtein:    { label: 'Белок энтерального питания',  unit: 'г/100 мл',   min: 0,   max: 6 },
    entKcal:       { label: 'Энергия энтерального питания', unit: 'ккал/100 мл', min: 0, max: 120 },
    proteinTarget: { label: 'Цель по общему белку',        unit: 'г/кг/сут',   min: 0,   max: 6 },
    lipDose:       { label: 'Жировая эмульсия, доза',      unit: 'г/кг/сут',   min: 0,   max: 6 },
    gir:           { label: 'GIR',                         unit: 'мг/кг/мин',  min: 0,   max: 20 },
    gluConc:       { label: 'Концентрация глюкозы',        unit: '%',          min: 0,   max: 50 },
    naDose:        { label: 'Na',                          unit: 'ммоль/кг/сут', min: 0, max: 10 },
    kDose:         { label: 'K',                           unit: 'ммоль/кг/сут', min: 0, max: 10 },
    caDose:        { label: 'Ca',                          unit: 'ммоль/кг/сут', min: 0, max: 5 }
  };
  /* Выпадающие списки: допустимые концентрации растворов. */
  var SOLUTIONS = {
    aaConc:  { label: 'Раствор аминокислот', values: [10, 6, 5] },
    lipConc: { label: 'Жировая эмульсия, концентрация', values: [20, 10] },
    naSol:   { label: 'Препарат натрия', values: [1.71, 0.154] },
    kSol:    { label: 'Препарат калия', values: [1.0, 0.537] },
    caSol:   { label: 'Препарат кальция', values: [0.22, 0.68] }
  };

  function fmt(v, d) {
    if (d === undefined) d = 1;
    return (typeof v === 'number' && isFinite(v)) ? v.toFixed(d).replace('.', ',') : '—';
  }
  function fmtNum(v) {  // для сообщений о диапазоне: 10000 → «10 000», 0.5 → «0,5»
    var s = String(v).replace('.', ',');
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  /* Строгий разбор числа: «1,5» и «1.5» — да; «», «abc», «1.2.3», «1e3» — нет. */
  function parseNumber(raw, badInput) {
    if (badInput) return { ok: false, reason: 'bad' };
    var s = (raw === null || raw === undefined) ? '' : String(raw).trim();
    if (s === '') return { ok: false, reason: 'empty' };
    s = s.replace(',', '.');
    if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(s)) return { ok: false, reason: 'bad' };
    return { ok: true, value: Number(s) };
  }

  function rawOf(raw, name) {
    var x = raw[name];
    if (x && typeof x === 'object') return { value: x.value, bad: !!x.badInput };
    return { value: x, bad: false };
  }

  /* raw — значения полей как строки (или {value, badInput}), gluMode, access и выбранные растворы.
     Возвращает {ok, values, errors, notes}. */
  function validate(raw) {
    var values = { access: raw.access === 'peripheral' ? 'peripheral' : 'central',
                   gluMode: raw.gluMode === 'conc' ? 'conc' : 'gir' };
    var errors = [], notes = [];
    Object.keys(FIELDS).forEach(function (name) {
      var f = FIELDS[name];
      if (name === 'gir' && values.gluMode !== 'gir') return;
      if (name === 'gluConc' && values.gluMode !== 'conc') return;
      var r = rawOf(raw, name), p = parseNumber(r.value, r.bad), msg = null;
      if (!p.ok) msg = p.reason === 'empty' ? f.label + ': поле не заполнено'
                                            : f.label + ': не число';
      else if (p.value < f.min - EPS || p.value > f.max + EPS)
        msg = f.label + ' ' + fmtNum(p.value) + ' ' + f.unit + ' — вне поддерживаемого диапазона ' +
              fmtNum(f.min) + '–' + fmtNum(f.max) + ' ' + f.unit;
      if (msg === null) { values[name] = p.value; return; }
      if (f.soft) { values[name] = null; notes.push({ field: name, text: msg + ' — ориентир по объёму не показан' }); }
      else errors.push({ field: name, text: msg });
    });
    Object.keys(SOLUTIONS).forEach(function (name) {
      var s = SOLUTIONS[name], p = parseNumber(rawOf(raw, name).value, false);
      var known = p.ok && s.values.some(function (v) { return Math.abs(v - p.value) < 1e-9; });
      if (!known) errors.push({ field: name, text: s.label + ': раствор не выбран' });
      else values[name] = p.value;
    });
    if (values.gluMode === 'gir') values.gluConc = null; else values.gir = null;
    return { ok: errors.length === 0, values: values, errors: errors, notes: notes };
  }

  /* Ориентир по объёму жидкости — справочная подсказка, в расчёт не входит. */
  function fluidHint(ga, dol) {
    if (ga === null || dol === null || ga === undefined || dol === undefined) return '';
    var preterm = ga < 37, range;
    if (dol <= 0)       range = preterm ? '70–90'   : '60–80';
    else if (dol === 1) range = preterm ? '90–110'  : '70–90';
    else if (dol === 2) range = preterm ? '110–130' : '80–100';
    else if (dol === 3) range = preterm ? '130–150' : '100–120';
    else if (dol <= 6)  range = preterm ? '140–160' : '120–150';
    else                range = '140–170';
    return 'Ориентир для ' + (preterm ? 'недоношенного' : 'доношенного') + ' на ' + fmtNum(dol) +
           ' сут: ' + range + ' мл/кг/сут';
  }

  /* Смесь двух исходных растворов глюкозы, дающая targetPct в объёме volume. */
  function glucoseMix(volume, targetPct) {
    for (var i = 0; i < GLUCOSE_STOCKS.length; i++) {
      var low = GLUCOSE_STOCKS[i][0], high = GLUCOSE_STOCKS[i][1];
      if (targetPct >= low - EPS && targetPct <= high + EPS) {
        var vHigh = volume * (targetPct - low) / (high - low);
        return { low: low, high: high, vLow: volume - vHigh, vHigh: vHigh };
      }
    }
    return null;
  }

  /* v — values из validate() при ok === true. */
  function compute(v) {
    var kg = v.weight / 1000;
    var totalMl = v.fluid * kg, enteralMl = v.enteral * kg, otherMl = v.other * kg;
    var pnBudget = totalMl - enteralMl - otherMl;           // объём, доступный для ПП, мл/сут

    var entProteinG = enteralMl * v.entProtein / 100;       // г/сут
    var entKcal = enteralMl * v.entKcal / 100;              // ккал/сут
    var entProteinPerKg = entProteinG / kg;

    var aaPerKg = Math.max(v.proteinTarget - entProteinPerKg, 0);
    var aaG = aaPerKg * kg, aaMl = aaG / (v.aaConc / 100);
    var totalProteinPerKg = entProteinPerKg + aaPerKg;

    var lipG = v.lipDose * kg, lipMl = lipG / (v.lipConc / 100);
    var lipKcal = lipMl * KCAL_ML_LIPID[v.lipConc];

    var na = { mmol: v.naDose * kg }; na.ml = na.mmol / v.naSol;
    var k  = { mmol: v.kDose * kg };  k.ml  = k.mmol / v.kSol;
    var ca = { mmol: v.caDose * kg }; ca.ml = ca.mmol / v.caSol;
    var elecMl = na.ml + k.ml + ca.ml;

    var nonGlucoseMl = aaMl + lipMl + elecMl;
    var aqueousMl = pnBudget - nonGlucoseMl;                // остаток под глюкозный компонент

    var gluG, gir, gluPct;
    if (v.gluMode === 'gir') {
      gir = v.gir;
      gluG = gir * kg * GIR_TO_G_PER_KG_DAY;
      gluPct = aqueousMl > EPS ? gluG / aqueousMl * 100 : NaN;
    } else {
      gluPct = v.gluConc;
      gluG = aqueousMl > EPS ? aqueousMl * gluPct / 100 : 0;
      gir = gluG / (kg * GIR_TO_G_PER_KG_DAY);
    }

    /* ---- Выполнимость ---- */
    var problems = [];
    var add = function (code, text) { problems.push({ code: code, text: text }); };
    if (pnBudget < -EPS) {
      add('over_budget', 'Энтеральное питание (' + fmt(enteralMl) + ' мл) и прочие в/в (' + fmt(otherMl) +
          ' мл) — вместе ' + fmt(enteralMl + otherMl) + ' мл, больше общего суточного объёма ' + fmt(totalMl) +
          ' мл. Под парентеральное питание объёма нет.');
    } else if (aqueousMl < -EPS) {
      add('no_room', 'Компоненты ПП не помещаются в доступные ' + fmt(pnBudget) + ' мл: аминокислоты ' +
          fmt(aaMl) + ' + липиды ' + fmt(lipMl) + ' + электролиты ' + fmt(elecMl) + ' = ' + fmt(nonGlucoseMl) +
          ' мл, не хватает ' + fmt(-aqueousMl) + ' мл. Уменьшите дозы или увеличьте общий объём.');
    } else if (aqueousMl <= EPS) {
      if (gluG > EPS || (v.gluMode === 'conc' && v.gluConc > 0))
        add('no_glucose_room', 'Под глюкозу не остаётся объёма: аминокислоты, липиды и электролиты занимают все ' +
            fmt(pnBudget) + ' мл ПП.');
    } else if (gluPct > LIMITS.gluStockMax + EPS) {
      add('glucose_too_strong', 'Нужна глюкоза ' + fmt(gluPct) + ' % — крепче самого концентрированного исходного раствора ' +
          LIMITS.gluStockMax + ' %, такую смесь не приготовить. Снизьте GIR или увеличьте объём ПП.');
    } else if (gluPct < LIMITS.gluStockMin - EPS) {
      add('glucose_too_weak', (gluPct > EPS
            ? 'Нужна глюкоза ' + fmt(gluPct) + ' %'
            : 'Глюкоза не назначена, а под водную часть остаётся ' + fmt(aqueousMl) + ' мл') +
          ' — из предусмотренных исходных растворов ' + LIMITS.gluStockMin + '–' + LIMITS.gluStockMax +
          ' % это не приготовить. Разбавитель калькулятор сам не добавляет: измените объём или назначение.');
    }
    var status = problems.length ? 'impossible' : 'ok';

    var mix = (status === 'ok' && aqueousMl > EPS) ? glucoseMix(aqueousMl, gluPct) : null;
    var usedMl = nonGlucoseMl + Math.max(aqueousMl, 0);

    /* ---- Энергия (при impossible — цель назначения, не обеспеченное) ---- */
    var aaKcal = aaG * KCAL_AA;
    var gluKcal = gluG * KCAL_GLU;
    var pnKcal = aaKcal + lipKcal + gluKcal;
    var totalKcal = pnKcal + entKcal;
    var kcalPerKg = totalKcal / kg;
    var proteinG = aaG + entProteinG;
    var nitrogen = proteinG / N_PER_PROTEIN;
    var npcPerN = nitrogen > 0 ? (lipKcal + gluKcal + entKcal - entProteinG * KCAL_AA) / nitrogen : 0;

    /* Расчётная осмолярность водной части ПП (без липидов) — оценка, не измерение. */
    var osm = aqueousMl > EPS
      ? (gluG * OSM.gluPerGram + aaG * OSM.aaPerGram + na.mmol * OSM.na + k.mmol * OSM.k + ca.mmol * OSM.ca)
        / ((aqueousMl + aaMl + elecMl) / 1000)
      : NaN;

    /* ---- Проверки назначения ---- */
    var checks = [];
    var chk = function (level, text) { checks.push({ level: level, text: text }); };
    problems.forEach(function (p) { chk('danger', p.text); });

    if (entProteinPerKg >= v.proteinTarget - EPS && v.proteinTarget > 0)
      chk('info', 'Энтеральное питание уже даёт ' + fmt(entProteinPerKg, 2) +
          ' г/кг/сут белка — цель закрыта, аминокислоты не нужны.');

    if (v.gluMode === 'gir' || status === 'ok') {
      var girWord = v.gluMode === 'gir' ? 'GIR' : 'Получившийся GIR';
      if (gir > LIMITS.gir.hardMax)
        chk('danger', girWord + ' ' + fmt(gir) + ' мг/кг/мин выше предела ' + LIMITS.gir.hardMax + ' — риск гипергликемии и липогенеза.');
      else if (gir > LIMITS.gir.max)
        chk('warn', girWord + ' ' + fmt(gir) + ' мг/кг/мин выше обычного максимума ' + LIMITS.gir.max + '.');
      else if (gir > 0 && gir < LIMITS.gir.min)
        chk('warn', girWord + ' ' + fmt(gir) + ' мг/кг/мин ниже ' + LIMITS.gir.min + ' — риск гипогликемии.');
    }

    if (totalProteinPerKg > LIMITS.protein.max + EPS)
      chk('danger', 'Общий белок ' + fmt(totalProteinPerKg, 2) + ' г/кг/сут выше максимума ' + fmt(LIMITS.protein.max) + '.');
    else if (totalProteinPerKg > 0 && totalProteinPerKg < LIMITS.protein.min - EPS)
      chk('warn', 'Общий белок ' + fmt(totalProteinPerKg, 2) + ' г/кг/сут ниже минимума ' + fmt(LIMITS.protein.min) + ' — не покрывается катаболизм.');

    if (v.lipDose > LIMITS.lipid.max + EPS)
      chk('danger', 'Жиры ' + fmt(v.lipDose) + ' г/кг/сут выше максимума ' + fmt(LIMITS.lipid.max) + '.');

    if (status === 'ok') {
      if (aqueousMl < 5 && gluG > 0)
        chk('danger', 'На глюкозу почти не остаётся объёма — пересмотрите распределение.');
      if (v.access === 'peripheral') {
        if (gluPct > LIMITS.gluPeriph + EPS)
          chk('danger', 'Глюкоза ' + fmt(gluPct) + ' % в периферическую вену (предел ' + fmt(LIMITS.gluPeriph) + ' %) — нужен центральный доступ.');
        if (osm > LIMITS.osmPeriph)
          chk('danger', 'Расчётная осмолярность ' + fmt(osm, 0) + ' мосм/л выше ' + LIMITS.osmPeriph + ' — риск флебита, нужен центральный доступ.');
      }
      if (kcalPerKg > 0 && kcalPerKg < LIMITS.kcalPerKg.min)
        chk('warn', fmt(kcalPerKg, 0) + ' ккал/кг/сут суммарно — ниже целевых ' + LIMITS.kcalPerKg.min + '–' + LIMITS.kcalPerKg.max + '.');
      else if (kcalPerKg > LIMITS.kcalPerKg.max)
        chk('warn', fmt(kcalPerKg, 0) + ' ккал/кг/сут суммарно — выше целевых ' + LIMITS.kcalPerKg.min + '–' + LIMITS.kcalPerKg.max + '.');
      if (nitrogen > 0 && npcPerN < LIMITS.npcPerN.min)
        chk('warn', 'Небелковых калорий ' + fmt(npcPerN, 0) + ' на 1 г азота (норма ' + LIMITS.npcPerN.min + '–' + LIMITS.npcPerN.max + ') — белок пойдёт в энергию.');
    }

    if (!checks.some(function (c) { return c.level === 'danger' || c.level === 'warn'; }))
      chk('ok', 'Рассчитанные показатели в пределах заданных порогов. Совместимость Ca–P и полнота состава не проверялись — см. ограничения ниже.');

    var order = { danger: 0, warn: 1, info: 2, ok: 3 };
    checks.sort(function (a, b) { return order[a.level] - order[b.level]; });

    return {
      status: status, problems: problems, checks: checks,
      kg: kg, totalMl: totalMl, enteralMl: enteralMl, otherMl: otherMl, pnBudget: pnBudget,
      entProteinG: entProteinG, entProteinPerKg: entProteinPerKg, entKcal: entKcal,
      aaPerKg: aaPerKg, aaG: aaG, aaMl: aaMl, totalProteinPerKg: totalProteinPerKg,
      lipG: lipG, lipMl: lipMl, lipKcal: lipKcal,
      na: na, k: k, ca: ca, elecMl: elecMl,
      aqueousMl: aqueousMl, gluG: gluG, gir: gir, gluPct: gluPct, mix: mix,
      usedMl: usedMl, rateMlH: usedMl / HOURS,
      energy: { aaKcal: aaKcal, gluKcal: gluKcal, lipKcal: lipKcal, pnKcal: pnKcal, entKcal: entKcal,
                totalKcal: totalKcal, kcalPerKg: kcalPerKg, proteinKcal: aaKcal + entProteinG * KCAL_AA },
      nitrogen: nitrogen, npcPerN: npcPerN, osm: osm
    };
  }

  /* Справочник энтерального питания из cheatsheets/data/enteral.json (через enteral/enteral.js):
     конкретные смеси и обобщённые ориентиры — одной плоской таблицей для выпадающего списка. */
  function enteralOptions(data) {
    var out = [];
    if (!data) return out;
    (data.formulas || []).forEach(function (f) {
      out.push({ id: f.id, kind: 'product', name: f.name, protein: f.protein, kcal: f.kcal,
                 dilution: f.dilution, verified: f.verified || null });
    });
    (data.generic || []).forEach(function (g) {
      out.push({ id: g.id, kind: 'generic', name: g.name, protein: g.protein, kcal: g.kcal,
                 verified: g.verified || null });
    });
    return out;
  }

  var api = {
    LIMITS: LIMITS, FIELDS: FIELDS, SOLUTIONS: SOLUTIONS, GLUCOSE_STOCKS: GLUCOSE_STOCKS,
    COEF: { KCAL_AA: KCAL_AA, KCAL_GLU: KCAL_GLU, KCAL_ML_LIPID: KCAL_ML_LIPID,
            N_PER_PROTEIN: N_PER_PROTEIN, HOURS: HOURS, GIR_TO_G_PER_KG_DAY: GIR_TO_G_PER_KG_DAY, OSM: OSM },
    parseNumber: parseNumber, validate: validate, compute: compute,
    fluidHint: fluidHint, glucoseMix: glucoseMix, enteralOptions: enteralOptions, fmt: fmt
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PN = api;
})(this);
