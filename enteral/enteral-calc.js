/* Анализ энтерального питания: ккал, белок, углеводы, жиры на сутки и на кг.
   Данные — enteral.js (генерируется из cheatsheets/data/enteral.json).
   Проверяется тестом cheatsheets/tests/test_enteral.py через node. */
(function (root) {
  'use strict';

  function status(value, range) {
    var lo = range[0], hi = range[1];
    if (lo === hi) { lo = lo * 0.9; hi = hi * 1.1; }   // точечная норма — ±10%
    if (value < lo - 1e-9) return 'low';
    if (value > hi + 1e-9) return 'high';
    return 'ok';
  }

  function analyze(formula, weightG, perDayMl, targets) {
    var kg = weightG / 1000;
    var k = perDayMl / 100;
    var day = {
      volume: perDayMl,
      kcal: formula.kcal * k,
      protein: formula.protein * k,
      carbs: formula.carbs * k,
      fat: formula.fat * k
    };
    var perKg = {};
    Object.keys(day).forEach(function (key) { perKg[key] = day[key] / kg; });
    var checks = {};
    ['volume', 'kcal', 'protein', 'carbs', 'fat'].forEach(function (key) {
      checks[key] = status(perKg[key], targets[key]);
    });
    return {
      formula: formula, weight_g: weightG, day: day, per_kg: perKg, checks: checks,
      protein_per_100kcal: formula.protein / formula.kcal * 100,
      // Сколько мл/кг/сут этой смеси нужно для нижней границы нормы
      need_ml_kg: {
        kcal: targets.kcal[0] / formula.kcal * 100,
        protein: targets.protein[0] / formula.protein * 100,
        carbs: targets.carbs[0] / formula.carbs * 100
      }
    };
  }

  var api = { analyze: analyze, status: status };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Enteral = api;
})(this);
