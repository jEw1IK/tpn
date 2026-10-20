import test from 'node:test';
import assert from 'node:assert/strict';
import {nextSheetInputs,courseDays,daysBetween,shiftDate,weightOn,freshSheet,weightFromSheet} from '../lib/sheet-flow.ts';
import {newMedicine} from '../lib/tpn.ts';

const patient={surname:'Ярошенко',historyNumber:'1111',birthDate:'2026-10-15',sex:'male',gestationWeeks:30,gestationDays:2,birthWeight:1450,admittedOn:'2026-10-15'};

test('даты: разница, сдвиг, вес на дату', () => {
 assert.equal(daysBetween('2026-10-15','2026-10-17'),2);assert.equal(shiftDate('2026-10-31',1),'2026-11-01');assert.equal(daysBetween('x','2026-10-17'),null);
 const w=[{date:'2026-10-15',grams:1450},{date:'2026-10-17',grams:1400}];
 assert.equal(weightOn(w,'2026-10-17',true),1400);assert.equal(weightOn(w,'2026-10-16',true),null);assert.equal(weightOn(w,'2026-10-16'),1450);assert.equal(weightOn(w,'2026-10-14'),null);
});

test('первый лист: шапка из карточки, сутки и койко-день от дат, веса из взвешиваний', () => {
 const p=nextSheetInputs({patient,date:'2026-10-17',previous:null,weights:[{date:'2026-10-15',grams:1450},{date:'2026-10-16',grams:1400}]});
 assert.equal(p.surname,'Ярошенко');assert.equal(p.day,'3');assert.equal(p.hospitalDay,'3');assert.equal(p.gestation,'30');assert.equal(p.gestationDays,'2');
 assert.equal(p.birthWeight,'1450');assert.equal(p.weightYesterday,'1400');assert.equal(p.weightToday,'');assert.equal(p.weight,'1400');
 assert.equal(p.enteralMode,'feeds8');assert.equal(p.highGlucose,'40');assert.equal(p.medicines.length,0);
});

test('следующий день: всё переносится, препараты тоже, масса сегодня подставляется, если взвесили', () => {
 const prev={...freshSheet(),fluid:'120',gir:'6',aa:'3',fat:'2',calciumMlPerKg:'4',formulaId:'nutrilon-pre-0',feeds:Array(8).fill('3'),weight:'1400',weightToday:'1400',medicines:[Object.assign(newMedicine('ampsul','m1'),{dose:'37.5',interval:'12'})]};
 const p=nextSheetInputs({patient,date:'2026-10-18',previous:prev,weights:[{date:'2026-10-15',grams:1450},{date:'2026-10-17',grams:1400},{date:'2026-10-18',grams:1420}]});
 assert.equal(p.fluid,'120');assert.equal(p.gir,'6');assert.equal(p.calciumMlPerKg,'4');assert.deepEqual(p.feeds,Array(8).fill('3'));
 assert.equal(p.medicines.length,1);assert.equal(p.medicines[0].dose,'37.5');assert.notEqual(p.medicines[0],prev.medicines[0]);
 assert.equal(p.day,'4');assert.equal(p.weightYesterday,'1400');assert.equal(p.weightToday,'1420');assert.equal(p.weight,'1420');assert.equal(p.sheetDate,'2026-10-18');
 const noWeigh=nextSheetInputs({patient,date:'2026-10-18',previous:prev,weights:[{date:'2026-10-17',grams:1400}]});
 assert.equal(noWeigh.weightToday,'');assert.equal(noWeigh.weight,'1400');
});

test('день курса считается по листам подряд, пропуск дня обрывает курс', () => {
 const amp=id=>Object.assign(newMedicine('ampsul',id),{dose:'37.5'});const net=id=>Object.assign(newMedicine('netil',id),{dose:'3'});
 const sheets=[{date:'2026-10-15',medicines:[amp('a')]},{date:'2026-10-16',medicines:[amp('a'),net('n')]},{date:'2026-10-17',medicines:[amp('a'),net('n')]},{date:'2026-10-19',medicines:[amp('a')]}];
 const names=id=>id;
 const d17=courseDays(sheets,'2026-10-17',names);
 assert.deepEqual(d17.map(c=>[c.drug,c.since,c.day]),[['ampsul','2026-10-15',3],['netil','2026-10-16',2]]);
 assert.deepEqual(courseDays(sheets,'2026-10-19',names).map(c=>[c.drug,c.day]),[['ampsul',1]]);
 assert.deepEqual(courseDays(sheets,'2026-10-18',names),[]);
});

test('взвешивание из листа: вес сегодня на дату листа', () => {
 assert.deepEqual(weightFromSheet({...freshSheet(),sheetDate:'2026-10-18',weightToday:'1420'}),{date:'2026-10-18',grams:1420});
 assert.equal(weightFromSheet({...freshSheet(),sheetDate:'2026-10-18',weightToday:'0'}),null);
});
