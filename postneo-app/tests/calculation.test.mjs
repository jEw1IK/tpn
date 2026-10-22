import test from 'node:test';
import assert from 'node:assert/strict';
import {calculate,calculateMedicine,changeMedicineMethod,decimalInput,example,blank,newMedicine,numeric,schedule,clock,scheduleDay,firstOffset,hoursLabel,pumpRate} from '../lib/tpn.ts';
import {formatNumber} from '../lib/format.ts';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('Согласованный пример: точные количества и единый баланс',()=>{const r=calculate(example());assert.equal(r.valid,true);near(r.total,156);near(r.aaGrams,4.55);near(r.aaMl,45.5);near(r.fatGrams,1.95);near(r.fatMl,9.75);near(r.drugMl,8);near(r.base,92.75);near(r.glucoseGrams,13.104);near(r.caMl,2.6);near(r.calciumMmol,0.585);near(r.calciumMmolPerKg,0.45);near(r.base+r.aaMl+r.fatMl+r.drugMl,156);near(r.fatRate,9.75/24);near(r.glucosePercent,13.104*100/(92.75-2.6));near(r.mainLinePercent,13.104*100/92.75)});
test('Смешение глюкозы сохраняет массу и объём; кальций учтён один раз',()=>{const r=calculate(example());near(r.lowMl+r.highMl+r.caMl,r.base);near(r.lowMl*.1+r.highMl*.2,r.glucoseGrams)});
test('Изменение лекарственных объёмов изменяет базу и концентрацию, сохраняя глюкозу',()=>{const p=example();p.medicines[0].volume='3';const a=calculate(example()),b=calculate(p);near(b.drugMl,10);near(b.base,a.base-2);near(b.glucoseGrams,a.glucoseGrams);assert.ok(b.glucosePercent>a.glucosePercent)});
test('Пустая масса не превращается в ноль или готовый расчёт',()=>{const r=calculate(blank());assert.equal(r.valid,false);assert.equal(r.total,null);assert.equal(r.base,null)});
test('Ошибки полей препаратов видны до ввода массы, без фиктивных вычисленных масс',()=>{
 const p=example();p.weight='';p.medicines[0].dose='';p.medicines[0].infusionHours='';
 const r=calculate(p);assert.equal(r.valid,false);assert.equal(r.medicines.length,2);
 assert.ok(r.issues.some(x=>x.medicineId==='example-amp'&&x.field==='dose'));
 assert.ok(r.issues.some(x=>x.medicineId==='example-amp'&&x.field==='infusionHours'));
 assert.equal(r.issues.filter(x=>x.field==='weight').length,1);
 assert.equal(r.medicines[1].doseMg,null);assert.equal(r.medicines[1].amountMg,null);
 assert.equal(r.drugMl,null);assert.equal(r.base,null);
 assert.ok(r.errors.every(x=>!x.includes('числовой диапазон')));
});
test('Незаполненное начало суток не объявляет правильное время препарата ошибочным',()=>{
 const r=calculate({...example(),start:''});assert.equal(r.valid,false);
 assert.equal(r.issues.filter(x=>x.field==='start').length,1);
 assert.ok(r.issues.every(x=>x.field!=='first'));assert.equal(r.medicines[0].volume,null);
});
test('Пустая разовая доза блокирует полный баланс',()=>{const p=example();p.medicines[0].dose='';const r=calculate(p);assert.equal(r.valid,false);assert.equal(r.drugMl,null);assert.equal(r.base,null)});
test('Отрицательный остаток и невозможная смесь помечаются ошибкой',()=>{const p=example();p.other='200';assert.equal(calculate(p).valid,false);const q=example();q.highGlucose='11';assert.equal(calculate(q).valid,false)});
test('Русская десятичная запятая поддерживается без ошибочного parseFloat',()=>{near(numeric('3,5'),3.5);assert.equal(numeric('3abc'),null);assert.equal(numeric(''),null);assert.equal(numeric('-1'),null);assert.equal(numeric('Infinity'),null)});
test('Смена длительности жиров меняет скорость, сохраняя суточное количество',()=>{const p=example();p.fatHours='20';near(calculate(p).fatRate,9.75/20);near(calculate(p).fatMl,9.75)});
test('Расписание от первого введения не добавляет дозу на границе следующих суток',()=>{assert.deepEqual(schedule('00:00',12,'00:00'),[0,720]);assert.deepEqual(schedule('23:00',8,'08:00'),[900,1380]);assert.deepEqual(schedule('08:00',24,'08:00'),[0]);});
test('Начало внутри последней минуты суток не отображается как следующие сутки',()=>{
 const m=newMedicine('ampsul','fractional-time');Object.assign(m,{dose:'10',interval:'23.999',minutes:'30',volume:'2'});
 const r=calculateMedicine(m,1.3,'00:00');assert.equal(r.valid,true);
 assert.deepEqual(r.times.map(t=>clock(t,'00:00')),['00:00','23:59:56']);near(r.volume,2.004);
 assert.equal(clock(1439.999999,'00:00'),'23:59:59');
});
test('Часы учитывают начало суток, переход через полночь и минутную точность',()=>{
 assert.equal(clock(90,'23:00'),'00:30');assert.equal(clock(1440,'08:00'),'08:00');
 assert.equal(clock(59.5,'23:00'),'23:59:30');assert.equal(clock(60.5,'23:00'),'00:00:30');
 assert.equal(clock(60+1e-10,'00:00'),'01:00');assert.equal(clock(Infinity,'00:00'),'—');
});
test('Часть инфузии после конца расчётных суток не включается в жидкость этих суток',()=>{const m=newMedicine('ampsul','late');Object.assign(m,{dose:'10',interval:'24',first:'23:45',minutes:'30',volume:'2'});const r=calculateMedicine(m,1.3,'00:00');assert.equal(r.valid,true);near(r.volume,1);near(r.rate,4);near(r.amountMg,6.5)});
test('Непрерывная инфузия мидазолама: разведение и единицы',()=>{const m=newMedicine('midazolam','mid');Object.assign(m,{dose:'0.03',pump:'0.3',volume:'20',stock:'5'});const r=calculateMedicine(m,.68,'00:00');assert.equal(r.valid,true);near(r.concentration,.068);near(r.amountMg,1.36);near(r.stockMl,.272);near(r.solventMl,19.728);near(r.volume,7.2)});
test('мкг/кг/мин переводятся в мг/ч с множителем 0,06',()=>{const m=newMedicine('epinephrine','epi');Object.assign(m,{dose:'0.05',pump:'0.3',volume:'20',stock:'1'});const r=calculateMedicine(m,1.3,'00:00');assert.equal(r.valid,true);near(r.concentration,.013);near(r.amountMg,.26);near(r.volume,7.2)});
test('Обратный расчёт по количеству препарата даёт ту же скорость',()=>{const m=newMedicine('epinephrine','epi');Object.assign(m,{method:'amount',amount:'0.26',dose:'0.05',volume:'20',stock:'1'});near(calculateMedicine(m,1.3,'00:00').rate,.3)});
test('Смена способа расчёта инфузии сохраняет текущий раствор вместо старого скрытого значения',()=>{
 let m={...newMedicine('epinephrine','switch'),dose:'0.05',pump:'0.6',amount:'0.26',volume:'20',stock:'1'};
 let before=calculateMedicine(m,1.3,'00:00');const byAmount=changeMedicineMethod(m,'amount',1.3,'00:00');
 assert.equal(byAmount.error,'');m={...m,...byAmount.patch};let after=calculateMedicine(m,1.3,'00:00');
 near(after.amountMg,.13);near(after.rate,before.rate);near(after.volume,before.volume);near(after.concentration,before.concentration);
 m.amount='0.52';before=calculateMedicine(m,1.3,'00:00');const byRate=changeMedicineMethod(m,'rate',1.3,'00:00');
 assert.equal(byRate.error,'');m={...m,...byRate.patch};after=calculateMedicine(m,1.3,'00:00');
 near(after.rate,.15);near(after.amountMg,before.amountMg);near(after.volume,before.volume);
});
test('Ошибочный активный параметр инфузии не возвращает старый расчёт другого способа',()=>{
 for(const pump of ['','0','-1','abc']){
  const m={...newMedicine('epinephrine','bad-switch'),dose:'0.05',pump,amount:'0.26',volume:'20',stock:'1'};
  const before=structuredClone(m),next=changeMedicineMethod(m,'amount',1.3,'00:00');
  assert.equal(next.patch,null);assert.ok(next.error);assert.deepEqual(m,before);
 }
});
test('В новой пустой карточке способ можно выбрать до заполнения расчёта',()=>{
 const m=newMedicine('epinephrine','empty-switch'),next=changeMedicineMethod(m,'amount',1.3,'00:00');
 assert.deepEqual(next.patch,{method:'amount'});assert.equal(next.error,'');
 assert.equal(calculateMedicine({...m,...next.patch},1.3,'00:00').valid,false);
});
test('Неполная отдельная нагрузка не мешает эквивалентной смене способа поддерживающей инфузии',()=>{
 const m={...newMedicine('epinephrine','loading-switch'),dose:'0.05',pump:'0.3',volume:'20',stock:'1',loading:true};
 assert.equal(calculateMedicine(m,1.3,'00:00').valid,false);
 const next=changeMedicineMethod(m,'amount',1.3,'00:00');assert.equal(next.error,'');near(numeric(next.patch.amount),.26);
 assert.equal(calculateMedicine({...m,...next.patch},1.3,'00:00').valid,false);
});
test('Десятичная сериализация числового ввода сохраняет малые и большие конечные числа',()=>{
 for(const value of [0,1e-7,1.25e-7,1e21,Number.MIN_VALUE,Number.MAX_VALUE]){
  const text=decimalInput(value);assert.doesNotMatch(text,/[eE]/);assert.equal(numeric(text),value);
 }
});
test('Расписание сохраняет календарный день при полночном переходе и долях минуты',()=>{
 assert.deepEqual(schedule('22:00',6,'20:00').map(t=>scheduleDay(t,'20:00')),[0,1,1,1]);
 assert.equal(firstOffset('02:00','20:00'),360);assert.equal(scheduleDay(360,'20:00'),1);
 assert.equal(scheduleDay(1439.999999,'00:00'),0);assert.equal(scheduleDay(240+1e-10,'20:00'),1);
 assert.equal(scheduleDay(Infinity,'00:00'),null);assert.equal(firstOffset('24:00','00:00'),null);
});
test('Шприц меньше объёма исходного препарата отклоняется',()=>{const m=newMedicine('midazolam','mid');Object.assign(m,{dose:'1',pump:'0.1',volume:'20',stock:'1'});assert.equal(calculateMedicine(m,1.3,'00:00').valid,false)});
test('Для малых периодических объёмов препарат не может превышать конечный объём',()=>{
 const m={...newMedicine('ampsul','small-volume'),dose:'0.000000001',interval:'12',minutes:'30',volume:'0.0000000001',stock:'1'};
 const r=calculateMedicine(m,1,'00:00');assert.equal(r.valid,false);assert.ok(r.issues.some(x=>x.field==='volume'));
});
test('Для малых непрерывных объёмов шприц не может быть меньше исходного препарата',()=>{
 const m={...newMedicine('midazolam','small-syringe'),method:'amount',amount:'0.000000001',dose:'0.01',volume:'0.0000000001',stock:'1'};
 const r=calculateMedicine(m,1,'00:00');assert.equal(r.valid,false);assert.ok(r.issues.some(x=>x.field==='volume'));
});
test('Малые нагрузки сравниваются с объёмом препарата без абсолютного допуска',()=>{
 const m={...newMedicine('ampsul','small-loading'),dose:'0.01',interval:'12',minutes:'30',volume:'1',stock:'1',loading:true,loadingDose:'0.000000001',loadingVolume:'0.0000000001',loadingMinutes:'30',loadingSource:'Вымышленная проверка'};
 const r=calculateMedicine(m,1,'00:00');assert.equal(r.valid,false);assert.ok(r.issues.some(x=>x.field==='loadingVolume'));
});
test('Относительный допуск сохраняет допустимое равенство при машинном округлении',()=>{
 const m={...newMedicine('ampsul','roundoff'),dose:'0.1',interval:'12',minutes:'30',volume:'0.3',stock:'1'};
 const r=calculateMedicine(m,3,'00:00');assert.equal(r.valid,true);assert.equal(r.solventMl,0);near(r.stockMl,.3);
});
test('Положительная доза не становится готовым раствором с нулевой массой',()=>{
 const m={...newMedicine('fentanyl','tiny-dose'),dose:decimalInput(1e-322),pump:'0.3',volume:'20',stock:'1'};
 const r=calculateMedicine(m,1.3,'00:00');assert.equal(r.valid,false);assert.equal(r.amountMg,null);
 assert.ok(r.issues.some(x=>x.field==='dose'&&x.message.includes('теряется до нуля')));
 const total=calculate({...example(),medicines:[m]});assert.equal(total.valid,false);assert.equal(total.drugMl,null);
});
test('Положительный объём исходного препарата не теряется до нуля',()=>{
 const m={...newMedicine('ampsul','tiny-stock'),dose:decimalInput(Number.MIN_VALUE),interval:'12',minutes:'30',volume:'1',stock:'100'};
 const r=calculateMedicine(m,1,'00:00');assert.equal(r.valid,false);assert.equal(r.stockMl,null);
 assert.ok(r.issues.some(x=>x.field==='stock'&&x.message.includes('теряется до нуля')));
});
test('Часть положительного объёма на конце суток не превращается в допустимый ноль',()=>{
 const m={...newMedicine('ampsul','tiny-partial'),dose:'1',interval:'24',first:'23:59',minutes:'30',volume:decimalInput(Number.MIN_VALUE)};
 const r=calculateMedicine(m,1,'00:00');assert.equal(r.valid,false);assert.equal(r.volume,null);
 assert.ok(r.issues.some(x=>x.field==='volume'&&x.message.includes('теряется до нуля')));
});
test('Переполнение исходного объёма нагрузки блокирует её разведение',()=>{
 const m={...newMedicine('ampsul','loading-overflow'),dose:'0.001',interval:'12',minutes:'30',volume:'20',stock:'0.0001',loading:true,loadingDose:decimalInput(1e308),loadingVolume:'20',loadingMinutes:'30',loadingSource:'Вымышленная проверка'};
 const r=calculateMedicine(m,1,'00:00');assert.equal(r.valid,false);assert.ok(r.issues.some(x=>x.field==='loadingVolume'));
});
test('Нагрузка включается один раз и требует указанного источника схемы',()=>{const p=example();const m=p.medicines[0];Object.assign(m,{loading:true,loadingDose:'5',loadingVolume:'1',loadingMinutes:'30',loadingSource:'Учебный тест'});near(calculate(p).drugMl,9);m.loadingSource='';assert.equal(calculate(p).valid,false)});
test('Чрезмерные значения не дают готовый бесконечный расчёт',()=>{const p=example();p.weight='9'.repeat(308);p.fluid='9'.repeat(308);assert.equal(calculate(p).valid,false)});
test('Нагрузка не может содержать больше исходного препарата, чем конечный объём',()=>{
 const m=newMedicine('ampsul','load-volume');
 Object.assign(m,{dose:'10',interval:'12',minutes:'30',volume:'2',stock:'100',loading:true,loadingDose:'100',loadingVolume:'0.5',loadingMinutes:'30',loadingSource:'Учебный тест'});
 const r=calculateMedicine(m,1.3,'00:00');
 assert.equal(r.valid,false);
 assert.ok(r.issues.some(x=>x.field==='loadingVolume'));
 m.loadingVolume='2';assert.equal(calculateMedicine(m,1.3,'00:00').valid,true);
});
test('Все конечные скорости проверяются на переполнение',()=>{
 for(const key of ['aaHours','fatHours','baseHours']){
  const p=example();p[key]='0.'+'0'.repeat(307)+'1';const r=calculate(p);
  assert.equal(r.valid,false,key);assert.ok(r.issues.some(x=>x.field===key));
 }
});
test('Машинная погрешность не превращает нулевой остаток в недостаток жидкости',()=>{
 const p=example();Object.assign(p,{weight:'1000',formulaId:'nutrilon-pre-0',fluid:'100',enteral:'80.2',aa:'2.1852',fat:'6.8076',gir:'0',calciumMlPerKg:'0',lowGlucose:'0',medicines:[]});// жиры: 3,76 г/кг в/в + 3,0476 г из 80,2 мл Пре 0
 const r=calculate(p);assert.equal(r.valid,true);assert.equal(r.base,0);assert.equal(r.mixVolume,0);assert.equal(r.baseRate,0);
 p.enteral='80.200001';assert.equal(calculate(p).valid,true);
});
test('Перебор суточной жидкости до 5 мл — предупреждение, больше — ошибка',()=>{
 const p=example();Object.assign(p,{weight:'1000',formulaId:'nutrilon-pre-0',fluid:'100',enteral:'80.2',aa:'2.1852',fat:'6.8076',gir:'0',calciumMlPerKg:'0',lowGlucose:'0',medicines:[]});
 // лишний энтеральный объём частично гасится меньшими АК и жирами (белок и жир смеси вычтены), поэтому перебор меньше прибавки
 p.enteral='85';const r=calculate(p);assert.equal(r.valid,true);assert.equal(r.base,0);assert.equal(r.mixVolume,0);assert.ok(r.overshootMl>2.8&&r.overshootMl<3);
 assert.ok(r.warnings.some(w=>/превышают суточную жидкость на 2,9 мл/.test(w)));near(r.ivTotal,r.aaMl+r.fatLineMl);near(r.allFluid,r.total+r.overshootMl);
 p.enteral='89.5';const bad=calculate(p);assert.equal(bad.valid,false);assert.ok(bad.errors.some(e=>/больше допустимых 5 мл/.test(e)));
 // электролиты больше остатка: линия — только электролиты, глюкоза отсутствует
 p.enteral='80.2';p.calciumMlPerKg='3';const ca=calculate(p);assert.equal(ca.valid,true);near(ca.base,3);assert.equal(ca.mixVolume,0);near(ca.overshootMl,3);near(ca.baseRate,3/24);
 assert.ok(ca.warnings.some(w=>/Электролиты и проводник превышают/.test(w)));
 p.calciumMlPerKg='5.5';assert.equal(calculate(p).valid,false);
});
test('Препараты в объёме: перебор 0,4 мл не блокирует лист, в/в растёт на эти 0,4 мл',()=>{
 const p=example();p.drugFluid='included';const a=calculate(p);assert.equal(a.valid,true);
 p.other=String(a.base+0.4);const r=calculate(p);assert.equal(r.valid,false);// глюкоза задана, а объёма под неё нет
 // электролиты (2,6 мл) не сжимаются: линия — только они, перебор = 0,4 + 2,6
 p.gir='0';const z=calculate(p);assert.equal(z.valid,true);near(z.base,z.electrolytes.sumMl);near(z.overshootMl,3);near(z.ivTotal,z.total+3);
});
test('Фактический GIR следует длительности и сохраняет суточную массу глюкозы',()=>{
 const p=example();p.baseHours='12';const r=calculate(p);near(r.actualGir,14);near(r.glucoseGrams,13.104);near(r.baseRate,92.75/12);
});
test('Нагрузка на границе суток считает поступившую массу пропорционально времени',()=>{
 const m=newMedicine('ampsul','late-loading');
 Object.assign(m,{dose:'10',interval:'24',minutes:'30',volume:'2',stock:'100',loading:true,loadingDose:'10',loadingVolume:'1',loadingFirst:'23:45',loadingMinutes:'30',loadingSource:'Учебный тест'});
 const r=calculateMedicine(m,1.3,'00:00');assert.equal(r.valid,true);near(r.loadingMg,13);near(r.loadingDeliveredMg,6.5);near(r.loadingDeliveredVolume,.5);near(r.volume,2.5);
});
test('Объём нагрузки в баланс суток отличается от полного объёма на границе периода',()=>{
 const m={...example().medicines[0],loading:true,loadingDose:'5',loadingVolume:'3',loadingMinutes:'30',loadingFirst:'23:50',loadingSource:'Вымышленная проверка'};
 const r=calculateMedicine(m,1.3,'00:00');assert.equal(r.valid,true);near(r.loadingVolume,3);near(r.loadingDeliveredVolume,1);near(r.volume,5);
 near(r.loadingDeliveredMg,r.loadingMg/3);
 assert.equal(calculateMedicine({...m,loading:false},1.3,'00:00').loadingDeliveredVolume,null);
});
test('Для непрерывной инфузии явно считается ресурс шприца и число замен',()=>{
 const m=newMedicine('epinephrine','replacements');Object.assign(m,{dose:'0.05',pump:'2',volume:'20',stock:'1'});
 const r=calculateMedicine(m,1.3,'00:00');assert.equal(r.valid,true);near(r.volume,48);near(r.syringeHours,10);assert.equal(r.syringeCount,3);
 m.pump='2.5';assert.equal(calculateMedicine(m,1.3,'00:00').syringeCount,3);
});
test('Прямой расчёт лекарства отклоняет недопустимую массу и начало суток',()=>{
 const m=newMedicine('ampsul','direct');Object.assign(m,{dose:'10',interval:'12',minutes:'30',volume:'2'});
 assert.equal(calculateMedicine(m,0,'00:00').valid,false);
 assert.equal(calculateMedicine(m,1.3,'24:00').valid,false);
});
test('Ошибка сохраняет точную ссылку на поле и препарат другой группы',()=>{
 const p=example();p.medicines.push(newMedicine('fentanyl','hidden-fentanyl'));
 const r=calculate(p);assert.equal(r.valid,false);
 assert.ok(r.issues.some(x=>x.medicineId==='hidden-fentanyl'&&x.field==='dose'));
 assert.equal(r.base,null);
});
test('Ненулевые малые значения не отображаются как ноль',()=>{
 assert.equal(formatNumber(0.000001,4),'< 0,0001');assert.equal(formatNumber(0,4),'0');
 assert.equal(formatNumber(Infinity),'—');assert.equal(formatNumber(null),'—');
});
test('Переполнение суммы конечных лекарственных объёмов не скрывается допуском',()=>{
 const p=example();Object.assign(p,{gir:'0',calciumMlPerKg:'0',lowGlucose:'0',medicines:[]});
 for(let i=0;i<2;i++){
  const m=newMedicine('epinephrine','overflow-'+i);
  Object.assign(m,{dose:'0.05',pump:'5'+'0'.repeat(306),volume:'1'+'0'.repeat(308),stock:'1'});
  assert.equal(calculateMedicine(m,1.3,'00:00').valid,true);p.medicines.push(m);
 }
 const r=calculate(p);assert.equal(r.valid,false);assert.equal(r.drugMl,null);assert.equal(r.base,null);
 assert.ok(r.errors.some(x=>x.includes('Суммарный объём лекарств')));
});
test('Баланс жидкости и масса глюкозы сохраняются при разных входных параметрах',()=>{
 for(let i=0;i<100;i++){
  const p=example();Object.assign(p,{weight:String(600+i*7),formulaId:'nutrilon-pre-0',fluid:String(100+i%60),enteral:String(i%20),aa:String(i%4),fat:String(i%3),calcium:String(i%2),lowGlucose:'0',highGlucose:'50',baseHours:String(4+i%21),medicines:[]});
  const r=calculate(p);assert.equal(r.valid,true,JSON.stringify(r.errors));
  near(r.base+r.aaMl+r.fatMl+r.enteralCountedMl+r.drugMl+r.other+r.flush,r.total);near(r.allFluid,r.total+r.enteralTrophicMl);
  near(r.lowMl+r.highMl+r.caMl,r.base);near(r.highMl*0.5,r.glucoseGrams);
  near(r.baseRate*Number(p.baseHours),r.base);
 }
});

test('Время введения задаётся в часах: 0,5 ч = 30 мин, 1,5 ч = 90 мин; часы важнее старых минут',()=>{
 const m=newMedicine('ampsul','h');Object.assign(m,{dose:'37.5',interval:'12',first:'08:00',volume:'2',infusionHours:'0,5'});
 const half=calculateMedicine(m,1.3,'08:00');assert.equal(half.valid,true,half.errors.join('; '));near(half.minutes,30);near(half.rate,4);
 const long=calculateMedicine({...m,infusionHours:'1.5'},1.3,'08:00');near(long.minutes,90);near(long.rate,2/1.5);
 const both=calculateMedicine({...m,infusionHours:'1',minutes:'30'},1.3,'08:00');near(both.minutes,60);
 const legacy=calculateMedicine({...m,infusionHours:'',minutes:'30'},1.3,'08:00');near(legacy.minutes,30);
 const empty=calculateMedicine({...m,infusionHours:''},1.3,'08:00');assert.equal(empty.valid,false);assert.ok(empty.issues.some(x=>x.field==='infusionHours'));
 const zero=calculateMedicine({...m,infusionHours:'0'},1.3,'08:00');assert.ok(zero.issues.some(x=>x.field==='infusionHours'&&x.message.includes('часов')));
 const tooLong=calculateMedicine({...m,interval:'1',infusionHours:'2'},1.3,'08:00');assert.ok(tooLong.issues.some(x=>x.field==='infusionHours'&&x.message.includes('больше интервала')));
 const load=calculateMedicine({...m,loading:true,loadingDose:'5',loadingVolume:'2',loadingHours:'0.5',loadingFirst:'08:00',loadingSource:'схема'},1.3,'08:00');assert.equal(load.valid,true,load.errors.join('; '));near(load.loadingRate,4);
 const noLoadTime=calculateMedicine({...m,loading:true,loadingDose:'5',loadingVolume:'2',loadingFirst:'08:00',loadingSource:'схема'},1.3,'08:00');assert.ok(noLoadTime.issues.some(x=>x.field==='loadingHours'));
 assert.equal(hoursLabel(30),'0,5 ч');assert.equal(hoursLabel(90),'1,5 ч');assert.equal(hoursLabel(20),'0,33 ч');assert.equal(hoursLabel(null),'—');
});
test('Помпа: скорость с шагом 0,1 мл/ч; предупреждение, если округление сдвигает объём или дозу на 5 % и больше',()=>{
 assert.equal(pumpRate(2.8125),2.8);assert.equal(pumpRate(0.225),0.2);assert.equal(pumpRate(0.25),0.3);assert.equal(pumpRate(0.40625),0.4);
 const pump=r=>r.warnings.filter(w=>w.includes('помп'));
 assert.deepEqual(pump(calculate(example())),[],'0,40625 → 0,4 мл/ч: меньше 5 %, без предупреждения');
 const fat=calculate({...example(),weight:'1300',fat:'2',fatPercent:'20',fatHours:'24'});near(fat.fatRate,13/24);
 assert.deepEqual(pump(fat),['Жировая эмульсия: на помпе 0,5 мл/ч вместо 0,542 — за 24 ч уйдёт 12 мл из 13 (−8 %). Подберите объём или длительность так, чтобы скорость была кратна 0,1 мл/ч.']);
 const faster=calculate({...example(),weight:'1300',fat:'2',fatPercent:'20',fatHours:'18'});
 assert.deepEqual(pump(faster),[],'0,722 → 0,7 мл/ч: −3 %, без предупреждения');
 const ends=calculate({...example(),weight:'1300',fat:'2',fatPercent:'20',fatHours:'20'});
 assert.ok(pump(ends).some(w=>w.startsWith('Жировая эмульсия: на помпе 0,7 мл/ч вместо 0,65')&&w.includes('13 мл закончатся за 18,6 ч вместо 20')),pump(ends).join('\n'));
 const dop=newMedicine('dopamine','dop');
 const byRate=calculate({...example(),medicines:[{...dop,dose:'5',method:'rate',pump:'0.55',volume:'12',stock:'40',hours:'24'}]});
 assert.equal(byRate.medicines[0].valid,true,byRate.medicines[0].errors.join('; '));
 assert.ok(pump(byRate).some(w=>w.startsWith('Дофамин 4%: на помпе 0,6 мл/ч вместо 0,55 — доза будет на 9 % выше расчётной')),pump(byRate).join('\n'));
 const tiny=calculate({...example(),medicines:[{...dop,dose:'5',method:'rate',pump:'0.05',volume:'12',stock:'40',hours:'24'}]});
 assert.ok(pump(tiny).some(w=>w==='Дофамин 4%: 0,05 мл/ч — меньше минимальной скорости помпы 0,1 мл/ч. Увеличьте объём раствора или сократите время введения.'),pump(tiny).join('\n'));
 assert.equal(formatNumber(0.05,1),'< 0,1');
});
test('Кальций задаётся в мл/кг глюконата 10 % (КР 2015, таблица 3); ммоль — производная; выше 4 мл/кг — предупреждение',()=>{
 const r=calculate({...example(),weight:'1300',calciumMlPerKg:'3.3'});
 near(r.caMl,4.29);near(r.calciumMmolPerKg,0.7425);near(r.calciumMmol,0.96525);
 assert.ok(!r.warnings.some(w=>w.includes('Глюконат кальция')));
 const high=calculate({...example(),weight:'1300',calciumMlPerKg:'4.5'});
 assert.ok(high.warnings.some(w=>w==='Глюконат кальция 10 % 4,5 мл/кг — больше 4 мл/кг (1 ммоль/кг), максимума по КР 2015, таблица 3'),high.warnings.join('\n'));
 const chloride=calculate({...example(),weight:'1300',calciumMlPerKg:'1',calciumContent:'0.9'});near(chloride.calciumMmolPerKg,0.9);
});

test('натрий за сутки: растворители препаратов на NaCl 0,9 % и NaCl в линии', () => {
 const p={...example(),weight:'1000',weightToday:'1000',nacl10:'2',nacl09:'0',lowSolution:'glucose'};
 const r=calculate(p);
 assert.equal(r.valid,true,r.errors.join('; '));
 // ампициллин + сульбактам и нетилмицин: по 2 мл NaCl 0,9 % дважды в сутки → 8 мл → 1,232 ммоль
 assert.ok(Math.abs(r.sodium.diluentMmol-8*0.154)<1e-9,String(r.sodium.diluentMmol));
 assert.ok(Math.abs(r.sodium.lineMmol-2)<1e-9);
 assert.ok(Math.abs(r.sodium.perKg-(2+8*0.154))<1e-9);
 const water={...p,medicines:p.medicines.map(m=>({...m,diluent:'Вода для инъекций'}))};
 assert.equal(calculate(water).sodium.diluentMmol,0);
});

test('медленная титрация входит в доп. жидкость: мидазолам 0,1 мл/ч в 20 мл за сутки даёт 2,4 мл', () => {
 const m=newMedicine('midazolam','mid');Object.assign(m,{dose:'0.05',pump:'0.1',volume:'20',hours:'24',stock:'5'});
 const p={...example(),weight:'1000',weightToday:'1000',medicines:[m]};
 const r=calculate(p);const res=r.medicines[0];
 assert.equal(res.valid,true,res.errors.join('; '));
 assert.ok(Math.abs(res.fluidVolume-2.4)<1e-9,String(res.fluidVolume));
 assert.ok(Math.abs(r.drugMl-2.4)<1e-9,String(r.drugMl));
 // в шприце 20 мл физраствора минус препарат; натрий идёт только с растворителем
 assert.ok(r.sodium.diluentMmol>0&&r.sodium.diluentMmol<2.4*0.154+1e-9);
});

test('непрерывная инфузия без исходной концентрации считается: объём за сутки есть, разведение в шприце не расписано', () => {
 const m=newMedicine('midazolam','mid2');Object.assign(m,{dose:'0.05',pump:'0.1',volume:'20',hours:'24',stock:''});
 const r=calculate({...example(),weight:'1000',weightToday:'1000',medicines:[m]});const res=r.medicines[0];
 assert.equal(res.valid,true,res.errors.join('; '));
 assert.ok(Math.abs(res.fluidVolume-2.4)<1e-9);assert.equal(res.stockMl,null);
 assert.ok(Math.abs(r.sodium.diluentMmol-2.4*0.154)<1e-9);
});

test('Углеводная нагрузка: общая задана врачом, смесь уменьшает в/в часть',()=>{
 const p={...example(),weight:'2000',weightToday:'2000',gir:'7',enteralMode:'feeds8',formulaId:'nutrilon-pre-0',feeds:Array(8).fill('10'),medicines:[]};
 const r=calculate(p);assert.equal(r.valid,true);near(r.girTotal,7);
 const carbs=r.enteralSubtracted.carbohydrateG;assert.ok(carbs>0);near(r.girEnteral,carbs/(2*1.44));near(r.girIv,7-r.girEnteral);near(r.girIv+r.girEnteral,7);
 const more=calculate({...p,feeds:Array(8).fill('20')});assert.ok(more.girIv<r.girIv);near(more.girTotal,7);
 const trophic=calculate({...p,feeds:Array(8).fill('5')});assert.equal(trophic.girEnteral,0);near(trophic.girIv,7);// до 25 мл/кг смесь не учитывается
 const over=calculate({...p,gir:'1',feeds:Array(8).fill('30')});assert.equal(over.girIv,0);assert.ok(over.warnings.some(w=>/больше заданной общей нагрузки/.test(w)));
});
