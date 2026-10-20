import test from 'node:test';
import assert from 'node:assert/strict';
import {example,blank,calculate} from '../lib/tpn.ts';
import {patientHeader,formatDate,nextDate} from '../lib/patient-header.ts';

test('Шапка примера заполнена; сутки жизни 3 дают два дня к гестации',()=>{
 const result=patientHeader(example());assert.equal(result.valid,true);
 assert.deepEqual(result.pcv,{weeks:30,days:2});
});
test('ПКВ переносит дни через неделю и не прибавляет день рождения',()=>{
 assert.deepEqual(patientHeader({...example(),gestation:'30',gestationDays:'6',day:'2'}).pcv,{weeks:31,days:0});
 assert.deepEqual(patientHeader({...example(),gestation:'28',gestationDays:'4',day:'1'}).pcv,{weeks:28,days:4});
});
test('Ручной ПКВ допускает возраст выше 44 недель и проверяет дни',()=>{
 const p={...example(),pcvMode:'manual',pcvWeeks:'45',pcvDays:'6'};
 assert.equal(patientHeader(p).valid,true);assert.deepEqual(patientHeader(p).pcv,{weeks:45,days:6});
 assert.ok(patientHeader({...p,pcvDays:'7'}).issues.some(x=>x.field==='pcvDays'));
});
test('Обязательные реквизиты не заменяются вымышленными значениями',()=>{
 const fields=patientHeader(blank()).issues.map(x=>x.field);
 for(const key of ['surname','historyNumber','birthDate','sheetDate','sex','hospitalDay','day','gestation','gestationDays'])assert.ok(fields.includes(key),key);
 assert.equal(patientHeader({...example(),surname:'   '}).valid,false);
 assert.equal(patientHeader({...example(),historyNumber:'00123-А/26'}).valid,true);
});
test('Дата проверяется по календарю, форматируется без часового пояса и смены дня',()=>{
 assert.equal(formatDate('2024-02-29'),'29.02.2024');assert.equal(formatDate('2025-02-29'),'—');
 assert.equal(formatDate('2026-04-31'),'—');assert.equal(formatDate('2026-13-01'),'—');
 assert.equal(nextDate('2024-02-28'),'29.02.2024');assert.equal(nextDate('2025-02-28'),'01.03.2025');
 assert.equal(nextDate('2026-12-31'),'01.01.2027');
 assert.ok(patientHeader({...example(),birthDate:'2026-10-07'}).issues.some(x=>x.field==='birthDate'));
});
test('Койко-день независим от суток жизни; дробная гестация не трактуется как дни',()=>{
 const p={...example(),hospitalDay:'1',day:'3'};assert.equal(patientHeader(p).valid,true);
 assert.ok(patientHeader({...p,hospitalDay:'1.5'}).issues.some(x=>x.field==='hospitalDay'));
 assert.ok(patientHeader({...p,gestation:'30,4'}).issues.some(x=>x.field==='gestation'));
 assert.ok(patientHeader({...p,gestationDays:'7'}).issues.some(x=>x.field==='gestationDays'));
});
test('Неполная шапка блокирует готовность листа, сохраняя арифметику питания',()=>{
 const p={...example(),surname:'',historyNumber:'',sex:''};
 assert.equal(patientHeader(p).valid,false);assert.equal(calculate(p).valid,true);assert.equal(calculate(p).total,156);
});
