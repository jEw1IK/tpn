import test from 'node:test';
import assert from 'node:assert/strict';
import {fluidNeed,fluidNeedStatus,fluidNeedRows,fluidNeedColumns,fluidNeedRules} from '../lib/fluid-need.ts';

test('1300 г на 5-е сутки: по КР 2015 полоса 1000–1499 г, возраст > 72 ч, ориентир 140–180 мл/кг/сут',()=>{
 const need=fluidNeed(1300,5);
 assert.equal(fluidNeedColumns[need.column].id,'1000');assert.equal(fluidNeedRows[need.row].label,'> 72 ч');assert.deepEqual(need.range,[140,180]);
});
test('Таблица 1 КР 2015 воспроизведена построчно',()=>{
 const expected={
  '< 24 ч':[[90,110],[90,100],[80,100],[70,80],[60,70]],
  '24–48 ч':[[110,150],[110,120],[100,120],[80,110],[70,80]],
  '48–72 ч':[[120,150],[120,140],[120,130],[100,130],[90,100]],
  '> 72 ч':[[130,190],[140,190],[140,180],[110,160],[110,160]],
 };
 assert.deepEqual(fluidNeedRows.map(r=>r.label),Object.keys(expected));
 for(const row of fluidNeedRows)assert.deepEqual(row.ranges,expected[row.label],row.label);
 assert.deepEqual(fluidNeedColumns.map(c=>c.label),['< 750 г','750–999 г','1000–1499 г','1500–2500 г','> 2500 г']);
});
test('Границы полос по массе как в КР: 749 → < 750, 750 и 999 → 750–999, 1000 и 1499 → 1000–1499, 1500 и 2500 → 1500–2500, 2501 → > 2500',()=>{
 assert.equal(fluidNeed(749,1).column,0);assert.equal(fluidNeed(750,1).column,1);assert.equal(fluidNeed(999,1).column,1);
 assert.equal(fluidNeed(1000,1).column,2);assert.equal(fluidNeed(1499,1).column,2);
 assert.equal(fluidNeed(1500,1).column,3);assert.equal(fluidNeed(2500,1).column,3);assert.equal(fluidNeed(2501,1).column,4);
 assert.deepEqual(fluidNeed(1500,3).range,[100,130]);assert.deepEqual(fluidNeed(3200,1).range,[60,70]);
});
test('Сутки жизни переводятся в возрастные колонки: 1 → < 24 ч, 2 → 24–48 ч, 3 → 48–72 ч, 4 и далее → > 72 ч; дробные сутки не теряются',()=>{
 assert.deepEqual(fluidNeed(800,1).range,[90,100]);assert.deepEqual(fluidNeed(800,2).range,[110,120]);assert.deepEqual(fluidNeed(800,3).range,[120,140]);assert.deepEqual(fluidNeed(800,4).range,[140,190]);
 assert.deepEqual(fluidNeed(2600,7).range,[110,160]);assert.deepEqual(fluidNeed(2600,30).range,[110,160]);
 assert.equal(fluidNeed(1300,1.5).row,0);assert.equal(fluidNeed(1300,2.9).row,1);assert.deepEqual(fluidNeed(1300,5.5).range,[140,180]);
});
test('Без массы, без суток или с мусором ориентира нет',()=>{
 for(const [w,d] of [[null,5],[1300,null],[0,5],[1300,0],[1300,0.5],[NaN,5],[1300,NaN],[-1,5]])assert.equal(fluidNeed(w,d).range,null,JSON.stringify([w,d]));
});
test('Положение введённого значения относительно ориентира',()=>{
 const range=fluidNeed(1300,5).range;
 assert.equal(fluidNeedStatus(120,range),'below');assert.equal(fluidNeedStatus(140,range),'within');assert.equal(fluidNeedStatus(180,range),'within');assert.equal(fluidNeedStatus(181,range),'above');
 assert.equal(fluidNeedStatus(null,range),null);assert.equal(fluidNeedStatus(150,null),null);
});
test('Таблица полная: четыре возрастные строки по пять диапазонов, минимум меньше максимума, с возрастом не убывает',()=>{
 assert.equal(fluidNeedRows.length,4);
 for(const row of fluidNeedRows){assert.equal(row.ranges.length,5);for(const [a,b] of row.ranges)assert.ok(a<b);}
 for(let c=0;c<5;c++)for(let r=1;r<fluidNeedRows.length;r++)assert.ok(fluidNeedRows[r].ranges[c][0]>=fluidNeedRows[r-1].ranges[c][0]);
 assert.ok(fluidNeedRules.some(rule=>rule.includes('25 мл/кг')));
});
