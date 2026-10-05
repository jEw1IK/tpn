/* Разведение препаратов для шприцевого насоса.
   Тот же расчёт, что в cheatsheets/bot/dilution.py — округления совпадают,
   а тесты (cheatsheets/tests/test_dilution.py) гоняют оба файла на одних
   примерах. Меняешь формулу здесь — меняй и там. */
(function (root) {
  'use strict';
  var EPS = 1e-9;
  var MIN_ROWS = 4;

  function roundTo(value, step) {
    return +(Math.floor(value / step + 0.5 + EPS) * step).toFixed(10);
  }
  function ceilTo(value, step) {
    return +(Math.ceil(value / step - EPS) * step).toFixed(10);
  }
  function num(value, digits) {
    if (digits === undefined) digits = 2;
    var text = roundTo(value, Math.pow(10, -digits)).toFixed(digits);
    if (text.indexOf('.') >= 0) text = text.replace(/0+$/, '').replace(/\.$/, '');
    return (text || '0').replace('.', ',');
  }

  function makeEngine(data) {
    var S = data;
    var drugs = {};
    data.drugs.forEach(function (d) { drugs[d.id] = d; });

    function ampAmount(drug) { return drug.conc * drug.amp_ml; }
    function doseText(drug, v) { return num(v, drug.dose_digits); }
    function amountText(drug, v) { return num(v, drug.unit === 'мг' ? 2 : 1); }

    function syringe(volume) {
      for (var i = 0; i < S.syringes_ml.length; i++) {
        if (volume <= S.syringes_ml[i] + EPS) return S.syringes_ml[i];
      }
      return 0;
    }

    function workDose(drug, rule) {
      var low = drug.typical[0];
      return rule ? Math.max(rule[1], low) : low;
    }

    function rows(drug, perRate, volume, extra) {
      if (!(perRate > 0)) return [];
      var topRate = drug.warn_above * 1.35 / perRate;
      var steps = [0.1, 0.2, 0.5, 1.0], step = 1.0;
      for (var i = 0; i < steps.length; i++) {
        if (topRate / steps[i] <= 10) { step = steps[i]; break; }
      }
      var rates = [], r = step;
      while ((r <= topRate + EPS || rates.length < MIN_ROWS) && rates.length < 12) {
        rates.push(roundTo(r, 0.01));
        r += step;
      }
      var marked = {};
      (extra || []).forEach(function (x) {
        if (x && x > 0) { var k = roundTo(x, 0.01); marked[k] = true; if (rates.indexOf(k) < 0) rates.push(k); }
      });
      rates.sort(function (a, b) { return a - b; });
      var lo = drug.typical[0], hi = drug.typical[1];
      return rates.map(function (rate) {
        var dose = perRate * rate;
        var shown = roundTo(dose, Math.pow(10, -drug.dose_digits));
        return {
          rate: rate, dose: dose, hours: rate ? volume / rate : 0,
          over: shown > drug.warn_above + EPS,
          typical: shown >= lo - EPS && shown <= hi + EPS,
          current: !!marked[rate]
        };
      });
    }

    function perRateOf(plan) {
      var kg = plan.weight_g / 1000;
      return kg ? plan.conc / kg : 0;
    }

    function finish(plan, rule, extraRates, workRate) {
      var drug = plan.drug;
      plan.conc = plan.amount / plan.volume;
      plan.per_rate = perRateOf(plan);
      plan.syringe_ml = syringe(plan.volume);
      if (rule) {
        plan.rule = rule;
        plan.rule_dose_actual = plan.per_rate * rule[0];
      }
      if (workRate) {
        plan.work_rate = workRate;
        plan.work_dose = plan.per_rate * workRate;
      } else {
        plan.work_dose = workDose(drug, rule);
        plan.work_rate = roundTo(plan.work_dose / plan.per_rate, 0.01);
      }
      plan.hours = plan.work_rate ? plan.volume / plan.work_rate : 0;
      var perRate = rule ? rule[1] / rule[0] : plan.per_rate;
      plan.rows = rows(drug, perRate, plan.volume, [rule ? rule[0] : null].concat(extraRates || []));

      if (plan.volume > S.syringe_max_ml + EPS) {
        plan.warnings.push(num(plan.volume, 1) + ' мл не влезет в шприц на ' + num(S.syringe_max_ml) + ' мл.');
      }
      if (rule && rule[1] > drug.warn_above + EPS) {
        plan.warnings.push(doseText(drug, rule[1]) + ' ' + drug.dose_unit + ' — выше обычного (до ' +
          doseText(drug, drug.warn_above) + '). Следи за давлением и дыханием.');
      }
      if (plan.work_rate && plan.work_rate <= 0.2 + EPS && plan.syringe_ml >= 50) {
        plan.warnings.push('На 0,1–0,2 мл/ч большой шприц подаёт неровно — лучше объём поменьше.');
      }
      return plan;
    }

    function newPlan(drug, weight, mode) {
      return {
        drug: drug, weight_g: weight, mode: mode, ok: true,
        amount: 0, draw_ml: 0, volume: 0, diluent_ml: 0, conc: 0, per_rate: 0,
        rule: null, rule_dose_actual: 0, work_rate: 0, work_dose: 0, hours: 0,
        syringe_ml: 0, rows: [], warnings: [], alternative: null, alternative_why: '', error: ''
      };
    }

    function economy(plan) {
      if (!plan.ok || plan.mode === 'check' || !plan.work_rate) return;
      var drug = plan.drug;
      var need24 = plan.conc * plan.work_rate * S.change_h;
      var tooBig = plan.volume > S.syringe_max_ml + EPS;
      var tooLong = plan.hours > 2 * S.change_h + EPS;
      var tooShort = plan.hours < S.change_h / 2 - EPS;
      var drawMl, why;
      if (tooBig || tooLong) {
        drawMl = Math.max(S.min_draw_ml, ceilTo(need24 / drug.conc, S.min_draw_ml));
        if (drawMl >= plan.draw_ml - EPS) return;
        why = tooBig ? 'Целиком в шприц не влезает.'
          : 'Шприц всё равно меняют раз в сутки — остальное ушло бы в отход.';
      } else if (tooShort) {
        var ampoules = Math.ceil(need24 / ampAmount(drug) - EPS);
        drawMl = ampoules * drug.amp_ml;
        if (drawMl <= plan.draw_ml + EPS) return;
        why = 'Исходный шприц закончится меньше чем через ' + num(S.change_h / 2) + ' ч.';
      } else {
        return;
      }
      var alt = dilute(drug, plan.weight_g, drawMl * drug.conc, plan.rule, true);
      if (alt.ok && alt.volume <= S.syringe_max_ml + EPS) {
        plan.alternative = alt;
        plan.alternative_why = why;
      }
    }

    function badInput(plan, values) {
      var bad = values.some(function (v) { return v === null || v === undefined || !(v > 0); });
      if (bad || !(plan.weight_g > 0)) {
        plan.ok = false;
        plan.error = 'Все числа должны быть больше нуля: масса, скорость, доза, количество, объём.';
        return true;
      }
      return false;
    }

    function concentrationFor(weight, rule) {
      return rule[1] * (weight / 1000) / rule[0];
    }

    function dilute(drug, weight, amount, rule, isAlternative) {
      rule = rule || drug.rule;
      if (amount === undefined || amount === null) amount = ampAmount(drug);
      var plan = newPlan(drug, weight, 'dilute');
      plan.amount = amount;
      if (badInput(plan, [rule[0], rule[1], amount])) return plan;
      plan.draw_ml = amount / drug.conc;
      var need = concentrationFor(weight, rule);
      if (need > drug.conc + EPS) {
        plan.ok = false;
        plan.rule = rule;
        var rateMin = ceilTo(rule[1] * (weight / 1000) / drug.conc, 0.1);
        plan.error = 'Для ' + num(rule[0]) + ' мл/ч = ' + doseText(drug, rule[1]) + ' ' + drug.dose_unit +
          ' нужна концентрация ' + num(need, 1) + ' ' + drug.unit + '/мл — это крепче, чем в ампуле (' +
          num(drug.conc) + ' ' + drug.unit + '/мл). Возьми правило с большей скоростью: ' +
          num(rateMin) + ' мл/ч = ' + doseText(drug, rule[1]) + ' ' + drug.dose_unit + '.';
        return plan;
      }
      var exact = amount / need;
      plan.volume = Math.max(roundTo(exact, exact < 5 ? 0.01 : 0.1), roundTo(plan.draw_ml, 0.01));
      plan.diluent_ml = Math.max(0, plan.volume - plan.draw_ml);
      finish(plan, rule);
      if (!isAlternative) economy(plan);
      return plan;
    }

    function draw(drug, weight, volume, rule) {
      rule = rule || drug.rule;
      var plan = newPlan(drug, weight, 'draw');
      plan.volume = volume;
      if (badInput(plan, [rule[0], rule[1], volume])) return plan;
      var need = concentrationFor(weight, rule);
      if (need > drug.conc + EPS) {
        plan.ok = false;
        plan.rule = rule;
        plan.error = 'Нужна концентрация ' + num(need, 1) + ' ' + drug.unit + '/мл — крепче, чем в ампуле (' +
          num(drug.conc) + ' ' + drug.unit + '/мл). Возьми правило с большей скоростью.';
        return plan;
      }
      plan.draw_ml = roundTo(need * volume / drug.conc, 0.01);
      plan.amount = plan.draw_ml * drug.conc;
      if (plan.draw_ml < 0.01 - EPS) {
        plan.ok = false;
        plan.rule = rule;
        plan.error = 'Препарата нужно меньше 0,01 мл — так не отмерить. Увеличь объём.';
        return plan;
      }
      plan.diluent_ml = Math.max(0, volume - plan.draw_ml);
      finish(plan, rule);
      if (plan.draw_ml < S.min_draw_ml - EPS) {
        plan.warnings.unshift(num(plan.draw_ml) + ' мл из ампулы точно не отмерить — меньше ' +
          num(S.min_draw_ml) + ' мл не бери. Увеличь объём шприца.');
      }
      economy(plan);
      return plan;
    }

    function check(drug, weight, amount, volume, rate, target) {
      var plan = newPlan(drug, weight, 'check');
      plan.amount = amount;
      plan.volume = volume;
      var vals = [amount, volume];
      if (rate !== null && rate !== undefined) vals.push(rate);
      if (target !== null && target !== undefined) vals.push(target);
      if (badInput(plan, vals)) return plan;
      plan.draw_ml = amount / drug.conc;
      if (plan.draw_ml > volume + EPS) {
        plan.ok = false;
        plan.error = amountText(drug, amount) + ' ' + drug.unit + ' — это ' + num(plan.draw_ml) +
          ' мл ампульного раствора, в ' + num(volume, 1) + ' мл не помещается.';
        return plan;
      }
      plan.diluent_ml = volume - plan.draw_ml;
      var extra = rate ? [rate] : [];
      var targetRate = null;
      if (target) {
        targetRate = roundTo(target * (weight / 1000) / (amount / volume), 0.01);
        extra.push(targetRate);
      }
      finish(plan, null, extra, rate || targetRate);
      if (rate && plan.per_rate * rate > drug.warn_above + EPS) {
        plan.warnings.push('На ' + num(rate) + ' мл/ч выходит ' + doseText(drug, plan.per_rate * rate) + ' ' +
          drug.dose_unit + ' — выше обычного (до ' + doseText(drug, drug.warn_above) + ').');
      }
      return plan;
    }

    return {
      data: data, drugs: drugs, num: num, roundTo: roundTo, ceilTo: ceilTo,
      doseText: doseText, amountText: amountText, ampAmount: ampAmount,
      dilute: dilute, draw: draw, check: check,
      rateFor: function (plan, dose) { return plan.per_rate ? dose / plan.per_rate : 0; },
      doseAt: function (plan, rate) { return plan.per_rate * rate; }
    };
  }

  var api = { makeEngine: makeEngine, num: num, roundTo: roundTo };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Dilution = api;
})(this);
