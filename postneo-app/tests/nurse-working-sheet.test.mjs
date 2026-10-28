import test from 'node:test';
import assert from 'node:assert/strict';
import {calculate,example,newMedicine} from '../lib/tpn.ts';
import {buildWorkingRows} from '../lib/nurse-working-sheet.ts';

test('Рабочий лист разделяет инфузии, препараты и дополнительную жидкость без изменения входа',()=>{
 const p=example(),before=structuredClone(p),r=calculate(p),resultBefore=structuredClone(r);
 const sheet=buildWorkingRows(p,r);
 assert.deepEqual(sheet.infusion.map(row=>row.kind),['base','amino','fat']);
 assert.deepEqual(sheet.medication.map(row=>row.id),['example-amp','example-net']);
 assert.deepEqual(sheet.support.map(row=>row.kind),['enteral']);
 assert.equal(sheet.support[0].volume,'0');assert.equal(sheet.support[0].instruction,'');
 assert.deepEqual(p,before);assert.deepEqual(r,resultBefore);
 for(const row of [...sheet.infusion,...sheet.medication,...sheet.support])assert.ok(row.instruction.split('\n').length<=3);
});
test('Инфузионная строка базы сохраняет видимые компоненты, кальций и заданную длительность',()=>{
 const p=example(),r=calculate(p),sheet=buildWorkingRows(p,r),base=sheet.infusion[0];
 assert.equal(base.volume,'92');assert.equal(base.rate,'3,8');
 // Рабочий лист: объёмы до 0,1 мл, как набирают шприцем; точные значения — в приложении.
 assert.ok(base.instruction.startsWith('Глюкоза 10% 47,8 + глюкоза 20% 41,6 + электролиты 2,6 мл'),base.instruction);
 assert.ok(base.instruction.includes('Ca глюконат 10% 2,6 мл (2 мл/кг)'));
 assert.ok(base.instruction.includes('За 24 ч · глюкоза 13,1 г, 14,65% в растворе глюкозы, 14,24% в линии'),base.instruction);assert.ok(base.instruction.includes('GIR 7'));assert.ok(base.instruction.includes('гепарин 69 Ед'));
 assert.equal(base.instruction.split('\n').length,3);
 assert.equal(sheet.infusion[1].volume,'46');assert.ok(sheet.infusion[1].instruction.includes('3,54 г/кг/сут → 4,6 г'),sheet.infusion[1].instruction);
 assert.equal(sheet.infusion[2].volume,'10');assert.ok(sheet.infusion[2].instruction.includes('1,5 г/кг/сут → 2 г'),sheet.infusion[2].instruction);
});
test('Для периодического препарата полный раствор и масса на введение отделены от суточного баланса',()=>{
 const p=example();p.medicines[0].stock='100';
 const row=buildWorkingRows(p,calculate(p)).medication[0];
 assert.equal(row.volume,'4');assert.equal(row.preparedVolume,'2');assert.equal(row.rate,'4');
 assert.ok(row.instruction.startsWith('48,75 мг на введение'));assert.ok(!row.instruction.includes('мг/кг'));
 for(const text of ['каждые 12 ч','препарат 0,49 мл + NaCl 0,9% 1,51 мл = 2 мл','в/в (за 30 мин)','08:00, 20:00'])assert.ok(row.instruction.includes(text),text);
 assert.equal(row.instruction.split('\n').length,2);
 assert.equal(row.preparation,undefined);// состав раствора теперь прямо в строке назначения
 assert.deepEqual(row.timing,['08:00','20:00']);assert.equal(row.partial,false);
});
test('Все группы и непрерывные шприцы включены с заданными дозами и суточными объёмами',()=>{
 const p=example();
 for(const [drug,stock,dose] of [['dopamine','40','1'],['dobutamine','12.5','1'],['epinephrine','1','0.01'],['norepinephrine','1','0.01'],['midazolam','5','0.01'],['fentanyl','0.05','0.1']]){
  p.medicines.push({...newMedicine(drug,drug),dose,pump:'0.05',volume:'5',stock});
 }
 const r=calculate(p);assert.equal(r.valid,true);const sheet=buildWorkingRows(p,r);const rows=[...sheet.medication,...sheet.infusion.filter(row=>row.medicineId)];
 assert.deepEqual(rows.map(row=>row.medicineId),p.medicines.map(m=>m.id));assert.equal(sheet.infusion.filter(row=>row.medicineId).length,6);
 assert.deepEqual(new Set(rows.map(row=>row.group)),new Set(['antibiotic','vasoactive','sedation']));
 const dopamine=rows.find(row=>row.id==='dopamine');assert.equal(dopamine.preparedVolume,'5');assert.equal(dopamine.volume,'1,2');assert.equal(dopamine.rate,'< 0,1');
 assert.ok(r.warnings.some(w=>w.includes('0,05 мл/ч — меньше минимальной скорости помпы 0,1 мл/ч')),r.warnings.join('\n'));
 assert.ok(dopamine.instruction.startsWith('7,8 мг (0,19 мл) + NaCl 0,9% 4,81 мл = 5 мл'),dopamine.instruction);assert.ok(!dopamine.instruction.includes('мкг/кг'));
 assert.ok(dopamine.instruction.includes('инфузия 24 ч'));
 assert.deepEqual(dopamine.timing,[]);
});
test('Длительность непрерывной инфузии отличается от времени расходования полного шприца',()=>{
 const p=example();p.medicines=[{...newMedicine('midazolam','duration-syringe'),dose:'0.01',pump:'0.05',volume:'5',stock:'5',hours:'24'}];
 const r=calculate(p);assert.equal(r.valid,true);const row=buildWorkingRows(p,r).infusion.find(x=>x.medicineId);
 assert.equal(row.rate,'< 0,1');assert.equal(row.volume,'1,2');assert.equal(row.preparedVolume,'5');
 assert.ok(row.instruction.includes('инфузия 24 ч'));assert.ok(row.instruction.includes('шприц на 100 ч'));
 assert.ok(!row.instruction.includes('за 24 ч'));
 const draft=buildWorkingRows({...p,weight:''},calculate({...p,weight:''})).infusion.find(x=>x.medicineId);
 assert.ok(draft.instruction.includes('шприц на — ч'));assert.ok(!draft.instruction.includes('шприц на 100 ч'));
});
test('Частичные периодические введения не скрывают полный объём и точное время с переходом даты',()=>{
 const p=example();p.start='00:00';Object.assign(p.medicines[0],{dose:'10',interval:'24',first:'23:45',minutes:'30',volume:'2'});
 let r=calculate(p);assert.equal(r.valid,true);let row=buildWorkingRows(p,r).medication[0];
 assert.equal(row.partial,true);assert.equal(row.volume,'1');assert.equal(row.preparedVolume,'2');
 assert.ok(row.warning.includes('за сутки 1 мл'));assert.ok(row.warning.includes('полный объём введения 2 мл'));assert.ok(row.instruction.includes(row.warning));
 assert.deepEqual(row.timing,['23:45']);
 p.start='20:00';Object.assign(p.medicines[0],{first:'22:00',interval:'6'});
 r=calculate(p);assert.equal(r.valid,true);row=buildWorkingRows(p,r).medication[0];
 assert.deepEqual(row.timing,['22:00','04:00 +1','10:00 +1','16:00 +1']);
});
test('Нагрузка отдельно сохраняет полный раствор, поступившую часть и полный источник для приложения',()=>{
 const p={...example(),start:'00:00'},source='Вымышленный источник проверки нагрузки. '.repeat(100);
 Object.assign(p.medicines[0],{stock:'100',loading:true,loadingDose:'5',loadingVolume:'3',loadingFirst:'23:50',loadingMinutes:'30',loadingSource:source});
 const r=calculate(p);assert.equal(r.valid,true);const rows=buildWorkingRows(p,r).medication;
 const main=rows.find(row=>row.id==='example-amp'),load=rows.find(row=>row.kind==='loading');
 assert.equal(main.volume,'4');assert.equal(load.volume,'1');assert.equal(load.preparedVolume,'3');assert.equal(load.rate,'6');
 assert.deepEqual(load.timing,['23:50']);assert.equal(load.partial,true);
 assert.ok(load.instruction.startsWith('6,5 мг на нагрузку'));assert.ok(!load.instruction.includes('мг/кг'));assert.ok(load.instruction.includes('NaCl 0,9% до 3 мл'));
 assert.ok(load.warning.includes('за сутки 1 мл (2,17 мг)'));assert.ok(load.instruction.includes(load.warning));
 assert.deepEqual(load.notes,['Источник схемы: '+source.trim()]);assert.ok(!load.instruction.includes(source.trim()));
});
test('Короткая рабочая строка сохраняет малый положительный объём рядом с большой нагрузкой',()=>{
 const p=example();p.medicines=[{...newMedicine('ampsul','tiny-maintenance'),dose:'0.0000000000000000001',interval:'24',minutes:'60',volume:'0.000000000000000001',stock:'1',
  loading:true,loadingDose:'0.1',loadingVolume:'1',loadingMinutes:'30',loadingSource:'Вымышленная проверка точности'}];
 const r=calculate(p);assert.equal(r.valid,true);const rows=buildWorkingRows(p,r).medication;
 assert.equal(rows[0].volume,'< 0,01');assert.equal(rows[1].volume,'1');
 assert.ok(rows[0].instruction.includes('< 0,01 мг на введение'));
});
test('Неполные вычисления скрыты в рабочем виде, введённые параметры сохранены',()=>{
 const p=example();p.weight='';const sheet=buildWorkingRows(p,calculate(p));
 for(const row of [...sheet.infusion,...sheet.medication,...sheet.support]){
  assert.equal(row.volume,'—');assert.equal(row.rate,'—');assert.deepEqual(row.timing,[]);assert.equal(row.partial,false);
  assert.ok(!row.instruction.includes('NaN')&&!row.instruction.includes('Infinity'));
 }
 assert.ok(sheet.medication[0].instruction.startsWith('— мг на введение'));
 assert.equal(sheet.medication[0].preparedVolume,'2');
 assert.ok(sheet.infusion[0].instruction.includes('Ca глюконат 10% — мл (2 мл/кг)'));
});
test('Поддерживающие объёмы и смесь не превращаются в выдуманные времена введения',()=>{
 const p=example();Object.assign(p,{enteralMode:'feeds',formulaId:'nutrilon-pre-0',feedingMl:'3',feedingCount:'8',other:'1',flush:'2',gir:'5'});
 const r=calculate(p);assert.equal(r.valid,true);const rows=buildWorkingRows(p,r).support;
 assert.deepEqual(rows.map(row=>row.kind),['enteral','other','flush']);
 assert.deepEqual(rows.map(row=>row.volume),['24','1','2']);
 assert.ok(rows[0].instruction.includes('Нутрилон Пре 0; 3 мл × 8 кормлений'));
 assert.ok(rows[0].notes[0].includes(r.enteralNutrition.formula.source));
 assert.ok(rows.every(row=>row.timing.length===0&&row.rate==='—'));
});
test('Рабочее назначение аминокислот печатает остаток после смеси, а не общую цель белка',()=>{
 const p=example();Object.assign(p,{aa:'4',enteralMode:'feeds',formulaId:'nutrilon-pre-0',feedingMl:'5',feedingCount:'8',gir:'3',lowGlucose:'0'});
 const r=calculate(p);assert.equal(r.valid,true);const row=buildWorkingRows(p,r).infusion.find(row=>row.kind==='amino');
 assert.equal(row.volume,'42');assert.equal(row.rate,'1,8');
 assert.ok(row.instruction.includes('3,23 г/кг/сут → 4,2 г'),row.instruction);
 assert.ok(!row.instruction.includes('4 г/кг/сут'));
});
test('Покрытая смесью цель убирает ненужное введение аминокислот из рабочей сетки',()=>{
 for(const target of ['0.8','0.7']){
  const p=example();Object.assign(p,{aa:target,enteralMode:'feeds',formulaId:'nutrilon-pre-0',feedingMl:'5',feedingCount:'8',gir:'3',lowGlucose:'0',aaPercent:'',aaHours:''});
  const r=calculate(p);assert.equal(r.valid,true);assert.equal(r.aaMl,0);
  const rows=buildWorkingRows(p,r);assert.deepEqual(rows.infusion.map(row=>row.kind),['base','fat']);
  assert.equal(rows.support[0].volume,'40');assert.ok(rows.support[0].instruction.includes('5 мл × 8 кормлений'));
 }
});
test('Неизвестный состав смеси скрывает остаток аминокислот и не печатает цель как в/в дозу',()=>{
 const p=example();Object.assign(p,{aa:'4',enteralMode:'daily',enteralVolume:'40',formulaId:'none'});
 const r=calculate(p);assert.equal(r.valid,false);const row=buildWorkingRows(p,r).infusion.find(row=>row.kind==='amino');
 assert.equal(row.volume,'—');assert.equal(row.rate,'—');assert.ok(row.instruction.startsWith('— г/кг/сут → — г'));
 assert.ok(!row.instruction.includes('4 г/кг/сут'));
});
