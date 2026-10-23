import test from 'node:test';
import assert from 'node:assert/strict';
import {openDb} from '../lib/server/db.ts';
import {createUser,login,userByToken,logout,countUsers,setDisabled,audit,listAudit,verifyPassword,hashPassword} from '../lib/server/auth.ts';
import {createPatient,listPatients,openSheet,saveSheet,signSheet,unsignSheet,listWeights,courses,patientGlance,getSheet,setPatientStatus,upsertWeight} from '../lib/server/patients.ts';
import {newMedicine} from '../lib/tpn.ts';

const fresh=()=>openDb(':memory:');
const patientInput={surname:'Ярошенко',historyNumber:'1111',birthDate:'2026-10-15',sex:'male',gestationWeeks:30,gestationDays:2,birthWeight:1450,admittedOn:'2026-10-15'};

test('пользователи и сессии: вход, продление, выход, отключение', () => {
 const db=fresh();assert.equal(countUsers(db),0);
 const u=createUser(db,{login:'Doc',name:'Врач',role:'doctor',password:'secret123'});
 assert.equal(u.login,'doc');assert.equal(login(db,'doc','wrong'),null);
 const s=login(db,'DOC','secret123',{ip:'10.0.0.1'});assert.ok(s&&s.token.length===64);
 assert.equal(userByToken(db,s.token).login,'doc');assert.equal(userByToken(db,'nope'),null);
 logout(db,s.token);assert.equal(userByToken(db,s.token),null);
 const s2=login(db,'doc','secret123');setDisabled(db,u.id,true);assert.equal(userByToken(db,s2.token),null);assert.equal(login(db,'doc','secret123'),null);
 assert.throws(()=>createUser(db,{login:'x',name:'',role:'nurse',password:'secret123'}));assert.throws(()=>createUser(db,{login:'nurse1',name:'',role:'nurse',password:'short'}));
 assert.ok(verifyPassword('abc12345',hashPassword('abc12345')));
 audit(db,u,'login','user',u.id,'ok','10.0.0.1');assert.equal(listAudit(db)[0].action,'login');
});

test('пациент → лист на сегодня → подпись → лист на завтра с переносом', () => {
 const db=fresh();const doc=createUser(db,{login:'doc',name:'Врач',role:'doctor',password:'secret123'});
 const p=createPatient(db,patientInput,doc.id);
 assert.equal(listPatients(db).length,1);assert.deepEqual(listWeights(db,p.id),[{date:'2026-10-15',grams:1450}]);
 assert.throws(()=>createPatient(db,{...patientInput,surname:''},doc.id),/фамилию/);
 const s1=openSheet(db,p.id,'2026-10-16',doc.id);
 assert.equal(s1.status,'draft');assert.equal(s1.inputs.day,'2');assert.equal(s1.inputs.weightYesterday,'1450');assert.equal(s1.inputs.surname,'Ярошенко');
 assert.equal(openSheet(db,p.id,'2026-10-16',doc.id).id,s1.id);
 const filled={...s1.inputs,weightToday:'1400',weight:'1400',fluid:'80',gir:'4',aa:'2',fat:'1',calciumMlPerKg:'3',hospitalDay:'2',medicines:[Object.assign(newMedicine('ampsul','m1'),{dose:'37.5',interval:'12',first:'08:00',volume:'2',infusionHours:'0.5'})]};
 const saved=saveSheet(db,p.id,'2026-10-16',filled,{aaName:'Аминовен Инфант 10%'},doc.id);
 assert.equal(saved.summary.valid,true,JSON.stringify(saved.summary));assert.ok(saved.summary.total>0);assert.deepEqual(saved.summary.drugs,['Ампициллин + сульбактам 0,5 г + 0,25 г (Сультасин)']);
 assert.deepEqual(listWeights(db,p.id).map(w=>w.grams),[1450,1400]);
 signSheet(db,p.id,'2026-10-16',doc.id);assert.equal(getSheet(db,p.id,'2026-10-16').status,'signed');
 assert.throws(()=>saveSheet(db,p.id,'2026-10-16',filled,{},doc.id),/подписан/);
 const s2=openSheet(db,p.id,'2026-10-17',doc.id);
 assert.equal(s2.inputs.day,'3');assert.equal(s2.inputs.weightYesterday,'1400');assert.equal(s2.inputs.weightToday,'');assert.equal(s2.inputs.fluid,'80');assert.equal(s2.inputs.medicines.length,1);
 assert.deepEqual(courses(db,p.id,'2026-10-17').map(c=>[c.name,c.day]),[['Ампициллин + сульбактам 0,5 г + 0,25 г (Сультасин)',2]]);
 const g=patientGlance(db,p,'2026-10-17');assert.equal(g.day,3);assert.deepEqual(g.pcv,{weeks:30,days:4});assert.equal(g.lastSheet.date,'2026-10-17');
 unsignSheet(db,p.id,'2026-10-16');assert.equal(getSheet(db,p.id,'2026-10-16').version,2);
 upsertWeight(db,p.id,'2026-10-17',1380,doc.id);assert.equal(listWeights(db,p.id).length,3);
 setPatientStatus(db,p.id,'discharged','2026-10-20');assert.equal(listPatients(db).length,0);assert.equal(listPatients(db,'discharged').length,1);
});
