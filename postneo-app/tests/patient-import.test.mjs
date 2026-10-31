import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePatientList,parseName,nameKey,birthFromAge} from '../lib/patient-import.ts';

// Вымышленные пациенты в формате печати «Список больных» из МИС.
const SAMPLE=`               Список больных (WIDEMEMO) 01.09.2026 07:00 - 31.10.2026 07:00
                     Состоит 3, перевод 1, поступление 2, смертей 0

1.ПЕТРОВ (СИДОРОВ) ИВАН ИВАНОВИЧ , в отделении -66 дней
Диагноз: P37.9 Врожденная инфекционная или паразитарная болезнь неуточненная, P59.0
Неонатальная желтуха, связанная с преждевременным родоразрешением



2.КОТОВА НЕИЗВЕСТНО ВТОРАЯ -2 дн., в отделении -3 дней
Диагноз: P22.0 Синдром дыхательного расстройства у новорожденного, Z38.3 Двойня, рожденная
в стационаре
3.ЕЖОВ ПЁТР ПАВЛОВИЧ 1 мес. 1 дн., в отделении 33 дней
Диагноз: P27.1 Бронхолегочная дисплазия, возникшая в перинатальном периоде
Операция: Вентрикулостомия 24.08.2026


4.ЛИСИЦЫНА АННА-МАРИЯ ОЛЕГОВНА 0 дн., в отделении 1 дней
Диагноз: P07.3 Другие случаи недоношенности



Врач-неонатолог: ИВАНОВ И. И.`;

test('список из МИС: имена, пол, диагнозы и операции', () => {
 const rows=parsePatientList(SAMPLE);
 assert.equal(rows.length,4);
 assert.deepEqual(rows[0],{surname:'Петров (Сидоров) Иван Иванович',sex:'male',diagnosis:'P37.9 Врожденная инфекционная или паразитарная болезнь неуточненная, P59.0 Неонатальная желтуха, связанная с преждевременным родоразрешением'});
 assert.equal(rows[1].surname,'Котова Неизвестно Вторая');assert.equal(rows[1].sex,'female');
 assert.match(rows[1].diagnosis,/рожденная в стационаре$/);
 assert.equal(rows[2].surname,'Ежов Пётр Павлович');
 assert.equal(rows[2].diagnosis,'P27.1 Бронхолегочная дисплазия, возникшая в перинатальном периоде\nОперация: Вентрикулостомия 24.08.2026');
 assert.equal(rows[3].surname,'Лисицына Анна-Мария Олеговна');assert.equal(rows[3].sex,'female');
 assert.ok(!rows.some(r=>/Врач/.test(r.diagnosis)));
});

test('без отчества пол не угадывается, без нумерации — строка на пациента', () => {
 assert.deepEqual(parseName('СОКОЛОВ НЕИЗВЕСТНО'),{surname:'Соколов Неизвестно',sex:''});
 assert.deepEqual(parseName('ГУСЕВ НЕИЗВЕСТНО ПЕРВЫЙ'),{surname:'Гусев Неизвестно Первый',sex:'male'});
 assert.deepEqual(parsePatientList('Иванова\n\nПетров Пётр Петрович\n').map(r=>r.surname),['Иванова','Петров Пётр Петрович']);
 assert.equal(nameKey('Ежов  Пётр'),nameKey('ЕЖОВ ПЕТР'));
});

test('таблица из МИС: пол, ИБ, дата рождения = госпитализация, вес, врач не нужен', () => {
 const tsv='Возраст (текущий)\tИБ №\tФИО\tДата госпитализации\tКойко дни\tДиагноз\tЛечащий врач\tВес при рождении, грамм\n'+
  '2 мес. 16 дн.\t643452-26-С\tКОТОВ ПЁТР ДМИТРИЕВИЧ\t15.08.2026 21:13\t77\tP27.1 БЛД\tИВАНОВА А. А.\t1 450\n'+
  '5 дн.\t702452-26-С\tЛИСИЦЫНА НЕИЗВЕСТНО \t27.10.2026 08:41\t4\tP37.9 Инфекция\tИВАНОВА А. А.\t\n'+
  '1 мес. 2 дн.\t1-26\tЕЖОВ ИВАН ИВАНОВИЧ\t30.10.2026 10:00\t1\t\t\t\n';
 const rows=parsePatientList(tsv,'2026-10-31');
 assert.deepEqual(rows[0],{surname:'Котов Пётр Дмитриевич',sex:'male',diagnosis:'P27.1 БЛД',historyNumber:'643452-26-С',birthDate:'2026-08-15',birthFromAge:false,admittedOn:'2026-08-15',birthWeight:'1450'});
 assert.equal(rows[1].sex,'');assert.equal(rows[1].birthDate,'2026-10-27');assert.equal(rows[1].surname,'Лисицына Неизвестно');
 assert.ok(!JSON.stringify(rows).includes('ИВАНОВА'));
 // переведён в месячном возрасте: дата рождения из возраста, с пометкой
 assert.equal(rows[2].birthDate,'2026-09-29');assert.equal(rows[2].birthFromAge,true);
 const csv='"ФИО";"Пол";"Дата рождения";"ИБ №"\n"ЕЖОВ ИВАН";"Мужской";"03.10.2026";"1-26"\n';
 assert.deepEqual(parsePatientList(csv,'2026-10-31')[0],{surname:'Ежов Иван',sex:'male',diagnosis:'',historyNumber:'1-26',birthDate:'2026-10-03',birthFromAge:false,admittedOn:'',birthWeight:''});
 assert.equal(birthFromAge('1 мес. 15 дн.','2026-10-31'),'2026-09-16');
 assert.equal(birthFromAge('1 мес.','2026-03-31'),'2026-02-28');
 assert.equal(birthFromAge('','2026-10-31'),'');
});
