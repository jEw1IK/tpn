import test from 'node:test';
import assert from 'node:assert/strict';
import {calculate,example,newMedicine,pumpRate} from '../lib/tpn.ts';
import {feedingMarks,buildNurseHours,buildNurseRows,chunkNurseRows,estimateNurseRowLines} from '../lib/nurse-sheet.ts';

const number=value=>Number(value.replaceAll('\u00a0','').replaceAll('\u202f','').replace(',','.'));
const near=(a,b)=>assert.ok(Math.abs(a-b)<0.0011,`${a} != ${b}`);

test('Почасовая сетка сохраняет переход через полночь и ровно 24 столбца',()=>{
 const hours=buildNurseHours('23:00');assert.equal(hours.length,24);
 assert.deepEqual(hours[0],{index:0,offset:0,label:'23',time:'23:00',day:0,nextDay:false});
 assert.deepEqual(hours[1],{index:1,offset:60,label:'00⁺¹',time:'00:00',day:1,nextDay:true});
 assert.equal(hours.at(-1).label,'22⁺¹');assert.equal(hours.at(-1).offset,1380);
});
test('Минуты выбранного начала не округляются в заголовках сетки',()=>{
 const hours=buildNurseHours('08:30');assert.equal(hours[0].label,'08:30');
 assert.equal(hours[15].label,'23:30');assert.equal(hours[16].label,'00:30⁺¹');
 for(const start of ['','24:00','00:60','1:00'])assert.ok(buildNurseHours(start).every(h=>h.time==='—'&&h.day===null));
});
test('Все клетки исполнения пустые: заданные параметры не создают сестринских отметок',()=>{
 const p=example();p.medicines.push({...newMedicine('dopamine','dop'),dose:'1',pump:'0.05',volume:'5',stock:'40',hours:'7.5'});
 const r=calculate(p);assert.equal(r.valid,true);
 for(const row of buildNurseRows(p,r))assert.deepEqual(row.marks,Array(24).fill(''));
 assert.ok(buildNurseRows(p,r).find(row=>row.id==='dop').details.some(line=>line.includes('7,5 ч')));
});
test('В сестринский лист входят все группы препаратов в порядке назначения',()=>{
 const p=example();
 for(const [drug,stock,dose] of [['dopamine','40','1'],['dobutamine','12.5','1'],['epinephrine','1','0.01'],['norepinephrine','1','0.01'],['midazolam','5','0.01'],['fentanyl','0.05','0.1']]){
  p.medicines.push({...newMedicine(drug,drug),dose,pump:'0.05',volume:'5',stock});
 }
 const r=calculate(p);assert.equal(r.valid,true);
 const meds=buildNurseRows(p,r).filter(row=>row.kind==='medicine');
 assert.deepEqual(meds.map(row=>row.medicineId),p.medicines.map(m=>m.id));
 assert.deepEqual(new Set(meds.map(row=>row.group)),new Set(['antibiotic','vasoactive','sedation']));
});
test('Неполный расчёт скрывает вычисленные значения всех строк без превращения их в нули',()=>{
 const p=example();p.weight='';const rows=buildNurseRows(p,calculate(p));
 assert.ok(rows.every(row=>row.volume==='—'&&row.rate==='—'));
 assert.ok(rows.find(row=>row.id==='example-amp').details.some(line=>line.includes('37,5 мг/кг')));
 assert.ok(rows.flatMap(row=>row.details).every(line=>!line.includes('NaN')&&!line.includes('Infinity')&&!line.includes('48,75 мг')));
 const q=example();q.gir='ошибка';assert.ok(buildNurseRows(q,calculate(q)).every(row=>row.volume==='—'&&row.rate==='—'));
});
test('Компоненты базы имеют одну строку объёма и сохраняют полный состав',()=>{
 const p=example(),r=calculate(p),rows=buildNurseRows(p,r);
 const base=rows.find(row=>row.kind==='base');near(number(base.volume),r.base);near(number(base.rate),pumpRate(r.baseRate));
 assert.ok(base.details.some(line=>line.includes('Глюкоза 10%')&&line.includes('глюкоза 20%')));
 assert.ok(base.details.some(line=>line.includes('Глюконат кальция 10 %')&&line.includes('ммоль/мл')));
 assert.ok(base.details.some(line=>line.includes('в растворе глюкозы')&&line.includes('во всей линии')));
 assert.ok(base.details.some(line=>line.includes('GIR')&&line.includes('Гепарин 0,5 Ед/мл → 69 Ед')));
 assert.equal(rows.filter(row=>row.kind==='base').length,1);
});
test('Позднее периодическое введение сохраняет частичный объём и явное время',()=>{
 const p=example();p.start='00:00';Object.assign(p.medicines[0],{dose:'10',interval:'24',first:'23:45',minutes:'30',volume:'2'});
 const r=calculate(p);assert.equal(r.valid,true);const row=buildNurseRows(p,r).find(row=>row.id==='example-amp');
 assert.equal(row.volume,'1');assert.equal(row.rate,'4');
 assert.ok(row.details.some(line=>line.includes('23:45')));
 assert.ok(row.details.some(line=>line.includes('в сутки 6,5 мг')));
 assert.ok(row.details.some(line=>line.includes('только часть до их окончания')));
});
test('Явные времена периодических введений различают календарные сутки',()=>{
 const p=example();p.start='20:00';p.sheetDate='2026-10-09';Object.assign(p.medicines[0],{first:'22:00',interval:'6'});
 const r=calculate(p);assert.equal(r.valid,true);
 const row=buildNurseRows(p,r).find(row=>row.id==='example-amp');
 for(const at of ['09.10.2026 22:00','10.10.2026 04:00','10.10.2026 10:00','10.10.2026 16:00'])assert.ok(row.details.some(line=>line.includes(at)));
});
test('Часть нагрузки выведена отдельно от полного объёма и не удваивает баланс',()=>{
 const p=example();p.start='00:00';Object.assign(p.medicines[0],{stock:'100',loading:true,loadingDose:'5',loadingVolume:'3',loadingFirst:'23:50',loadingMinutes:'30',loadingSource:'Вымышленная схема; только проверка формата'});
 const r=calculate(p);assert.equal(r.valid,true);const rows=buildNurseRows(p,r);
 const main=rows.find(row=>row.id==='example-amp'),load=rows.find(row=>row.id==='example-amp-loading');
 assert.equal(main.volume,'4');assert.equal(load.volume,'1');assert.equal(load.rate,'6');
 near(number(main.volume)+number(load.volume),r.medicines[0].volume);
 assert.ok(load.details.some(line=>line.includes('Полный объём нагрузки 3 мл')&&line.includes('23:50')));
 assert.ok(load.details.some(line=>line.includes('2,1667 мг и 1 мл')));
 assert.ok(main.details.some(line=>line.includes('0,4875 мл + растворитель 1,5125 мл')));
 assert.ok(main.details.some(line=>line.includes('Исходный 100 мг/мл')));
 assert.ok(load.details.some(line=>line.includes('исходная концентрация 100 мг/мл')));
});
test('Большая нагрузка не стирает положительный малый объём поддерживающего введения',()=>{
 const p=example();p.medicines=[{...newMedicine('ampsul','tiny-maintenance'),dose:'0.0000000000000000001',interval:'24',minutes:'60',volume:'0.000000000000000001',stock:'1',
  loading:true,loadingDose:'0.1',loadingVolume:'1',loadingMinutes:'30',loadingSource:'Вымышленная проверка точности'}];
 const r=calculate(p);assert.equal(r.valid,true);
 // This deliberately demonstrates why subtracting the load from the rounded aggregate loses the maintenance volume.
 assert.equal(r.medicines[0].volume,1);
 const rows=buildNurseRows(p,r);
 assert.equal(rows.find(row=>row.kind==='medicine').volume,'< 0,001');
 assert.equal(rows.find(row=>row.kind==='loading').volume,'1');
});
test('Длинный источник и любые примечания сохраняются целиком при разбиении страниц',()=>{
 const p=example(),source='Вымышленный источник схемы нагрузки. '.repeat(100);
 Object.assign(p.medicines[0],{loading:true,loadingDose:'5',loadingVolume:'1',loadingFirst:'00:00',loadingMinutes:'30',loadingSource:source});
 const r=calculate(p);assert.equal(r.valid,true);const rows=buildNurseRows(p,r);
 const load=rows.find(row=>row.kind==='loading');assert.equal(load.notes[0],'Источник схемы: '+source.trim());
 const pages=chunkNurseRows(rows,2);assert.ok(pages.every(page=>page.length<=2));
 assert.deepEqual(pages.flat(),rows);assert.strictEqual(pages.flat().find(row=>row.kind==='loading'),load);
 const huge={...load,id:'long-details',details:['Длинное неизменённое описание. '.repeat(100)]};
 const heavyPages=chunkNurseRows([rows[0],huge,rows[1]],12,20);
 assert.deepEqual(heavyPages.map(page=>page.map(row=>row.id)),[['base'],['long-details'],['amino']]);
 assert.equal(heavyPages[1][0].details[0],huge.details[0]);assert.ok(estimateNurseRowLines(huge)>20);
 assert.deepEqual(chunkNurseRows([]),[]);assert.throws(()=>chunkNurseRows(rows,0),RangeError);
});
test('Энтеральное питание сохраняет состав и не назначает часы кормления',()=>{
 const p=example();Object.assign(p,{enteralMode:'feeds',formulaId:'nutrilon-pre-0',feedingMl:'5',feedingCount:'8',gir:'3',lowGlucose:'0'});
 const r=calculate(p);assert.equal(r.valid,true);const row=buildNurseRows(p,r).find(row=>row.kind==='enteral');
 assert.equal(row.volume,'40');assert.equal(row.rate,'—');assert.deepEqual(row.marks,Array(24).fill(''));
 assert.ok(row.details.includes('Нутрилон Пре 0'));
 assert.ok(row.details.some(line=>line.includes('5 мл на кормление × 8 кормлений')));
 assert.ok(row.details.some(line=>line.includes('белок')&&line.includes('энергия')));
});
test('Сестринский лист сохраняет назначенную дозу кальция, нутриенты на кг и полный источник смеси',()=>{
 const p=example();Object.assign(p,{enteralMode:'feeds',formulaId:'nutrilon-pre-0',feedingMl:'5',feedingCount:'8',gir:'3',lowGlucose:'0'});
 const r=calculate(p);assert.equal(r.valid,true);const rows=buildNurseRows(p,r);
 assert.ok(rows.find(row=>row.kind==='base').details.some(line=>line.includes('Глюконат кальция 10 %: 2 мл/кг/сут → 2,6 мл; по 0,225 ммоль/мл это 0,585 ммоль (0,45 ммоль/кг).')));
 const en=rows.find(row=>row.kind==='enteral');
 assert.ok(en.details.includes('На кг/сут (все смеси): белок 0,8 г; жиры 1,169 г; углеводы 2,554 г; энергия 24,308 ккал.'));assert.ok(en.details.some(line=>line.startsWith('От 25 мл/кг')));
 assert.deepEqual(en.notes,[`Источник состава смеси Нутрилон Пре 0: ${r.enteralNutrition.formula.source}`]);
 const zero=buildNurseRows(example(),calculate(example())).find(row=>row.kind==='enteral');
 assert.equal(zero.volume,'0');assert.equal(zero.notes,undefined);
 assert.deepEqual(zero.details,[]);
});
test('Подробная строка аминокислот использует рассчитанную в/в дозу после энтерального белка',()=>{
 const p=example();Object.assign(p,{aa:'4',enteralMode:'feeds',formulaId:'nutrilon-pre-0',feedingMl:'5',feedingCount:'8',gir:'3',lowGlucose:'0'});
 const r=calculate(p);assert.equal(r.valid,true);const row=buildNurseRows(p,r).find(row=>row.kind==='amino');
 assert.equal(row.volume,'41,6');assert.equal(row.rate,'1,7');
 assert.deepEqual(row.details,['3,2 г/кг/сут → 4,16 г; вводить за 24 ч.']);assert.deepEqual(row.marks,Array(24).fill(''));
});
test('При покрытой или превышенной цели подробный лист явно сообщает, что аминокислоты в/в не требуются',()=>{
 for(const target of ['0.8','0.7']){
  const p=example();Object.assign(p,{aa:target,enteralMode:'feeds',formulaId:'nutrilon-pre-0',feedingMl:'5',feedingCount:'8',gir:'3',lowGlucose:'0',aaPercent:'',aaHours:''});
  const r=calculate(p);assert.equal(r.valid,true);const row=buildNurseRows(p,r).find(row=>row.kind==='amino');
  assert.equal(row.volume,'0');assert.equal(row.rate,'—');assert.equal(row.label,'Аминокислоты в/в · не требуются');
  assert.deepEqual(row.details,['Дополнительные аминокислоты в/в не требуются: общая цель белка покрыта другими источниками.']);
  assert.ok(!row.label.includes('—%')&&!row.details[0].includes('вводить'));
 }
});
test('Кормления ложатся в ячейки своих часов при начале суток 08:00 и при другом начале',()=>{
 const marks=feedingMarks(['5','5','5','5','5','5','5','5'],'08:00');
 // 09, 12, 15, 18, 21, 00, 03, 06 → столбцы 1, 4, 7, 10, 13, 16, 19, 22
 assert.deepEqual(marks.map((v,i)=>v?i:null).filter(i=>i!==null),[1,4,7,10,13,16,19,22]);
 assert.equal(marks[1],'5');assert.equal(marks.length,24);
 const shifted=feedingMarks(['2,5','','3','','','','',''],'09:00');assert.equal(shifted[0],'2,5');assert.equal(shifted[6],'3');assert.equal(shifted.filter(Boolean).length,2);
 assert.deepEqual(feedingMarks(['0','x','','','','','',''],'08:00').filter(Boolean),[]);
 assert.equal(feedingMarks(['5'],'').filter(Boolean).length,0);
});
