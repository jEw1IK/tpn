import test from 'node:test';
import assert from 'node:assert/strict';
import {glance,coursesFromSheets,previousSheet,validatePatient,plainPatientData,assemblePatient} from '../lib/kart-view.ts';
import {readPatient,readWeights,readSheets,sealPatient,sealWeight,sealSheet} from '../lib/kart-client.ts';
import {createVault,importDataKey} from '../lib/crypto.ts';
import {freshSheet} from '../lib/sheet-flow.ts';
import {newMedicine} from '../lib/tpn.ts';

const card={surname:'Ярошенко',historyNumber:'1111',birthDate:'2026-10-15',birthTime:'',sex:'male',gestationWeeks:30,gestationDays:2,birthWeight:1450,admittedOn:'2026-10-15',diagnosis:''};

test('сводка в браузере: сутки, ПКВ, последняя масса, койко-день', () => {
 const g=glance(card,[{date:'2026-10-17',grams:1400},{date:'2026-10-15',grams:1450}],'2026-10-17');
 assert.equal(g.day,3);assert.deepEqual(g.pcv,{weeks:30,days:4});assert.deepEqual(g.lastWeight,{date:'2026-10-17',grams:1400});assert.equal(g.bedDay,3);
 assert.deepEqual(validatePatient({...card,surname:' '}),['Укажите фамилию']);
 assert.deepEqual(validatePatient(card),[]);
});

test('курсы и предыдущий лист считаются по расшифрованным листам', () => {
 const amp=id=>Object.assign(newMedicine('ampsul',id),{dose:'37.5'});
 const sheets=[{date:'2026-10-16',inputs:{...freshSheet(),medicines:[amp('a')]}},{date:'2026-10-15',inputs:{...freshSheet(),medicines:[amp('a')]}},{date:'2026-10-18',inputs:{...freshSheet(),medicines:[]}}];
 assert.deepEqual(coursesFromSheets(sheets,'2026-10-16').map(c=>[c.drug,c.day]),[['ampsul',2]]);
 assert.equal(previousSheet(sheets,'2026-10-17').date,'2026-10-16');assert.equal(previousSheet(sheets,'2026-10-15'),null);
});

test('шифрованные и старые открытые строки читаются одинаково', async () => {
 const key=await importDataKey((await createVault('фраза отделения для теста')).rawKey);
 const base={id:7,status:'active',discharged_on:null,created_at:'t',updated_at:'t'};
 const encRow={...base,enc:await sealPatient(key,card)};
 const plainRow={...base,enc:null,surname:'Ярошенко',history_number:'1111',birth_date:'2026-10-15',birth_time:null,sex:'male',gestation_weeks:30,gestation_days:2,birth_weight:1450,admitted_on:'2026-10-15',diagnosis:''};
 const a=await readPatient(key,encRow),b=await readPatient(null,plainRow);
 assert.equal(a.surname,'Ярошенко');assert.equal(a.encrypted,true);assert.equal(b.encrypted,false);assert.deepEqual({...a,encrypted:false},b);
 assert.deepEqual(assemblePatient(plainRow,plainPatientData(plainRow)).historyNumber,'1111');
 await assert.rejects(readPatient(null,encRow),/ключ/);
 const weights=await readWeights(key,[{date:'2026-10-16',enc:await sealWeight(key,1400.4)},{date:'2026-10-15',enc:null,grams:1450}]);
 assert.deepEqual(weights,[{date:'2026-10-15',grams:1450},{date:'2026-10-16',grams:1400}]);
 const sheetRow={id:1,sheet_date:'2026-10-16',status:'draft',valid:1,version:1,author_id:1,signed_by:null,signed_at:null,created_at:'t',updated_at:'t',enc:await sealSheet(key,{inputs:{...freshSheet(),fluid:'80'},ui:{aaName:'x'}})};
 const [s]=await readSheets(key,[sheetRow]);assert.equal(s.data.inputs.fluid,'80');assert.equal(s.valid,true);assert.equal(s.data.ui.aaName,'x');
 const legacy={...sheetRow,enc:null,inputs_json:JSON.stringify({...freshSheet(),fluid:'90'}),ui_json:'{}'};
 assert.equal((await readSheets(null,[legacy]))[0].data.inputs.fluid,'90');
});
