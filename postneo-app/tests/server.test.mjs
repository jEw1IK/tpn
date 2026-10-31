import test from 'node:test';
import assert from 'node:assert/strict';
import {openDb} from '../lib/server/db.ts';
import {createUser,login,userByToken,logout,countUsers,setDisabled,audit,listAudit,verifyPassword,hashPassword,setPassword,changeOwnPassword,createInvite,inviteByCode,redeemInvite,listInvites,deleteInvite,tooManyAttempts,noteFailedAttempt,clearAttempts} from '../lib/server/auth.ts';
import {createPatient,updatePatient,listPatients,getPatient,putSheet,signSheet,unsignSheet,deleteDraft,listWeights,listSheets,getSheet,setPatientStatus,upsertWeight,encryptLegacy} from '../lib/server/patients.ts';
import {createVaultRecord,getVault,updateVaultRecord,plainCounts} from '../lib/server/vault.ts';

const fresh=()=>openDb(':memory:');

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

test('пациент и листы хранятся шифротекстом: сервер ведёт только статусы, даты и подписи', () => {
 const db=fresh();const doc=createUser(db,{login:'doc',name:'Врач',role:'doctor',password:'secret123'});
 const enc=(n)=>'v1.'+Buffer.from('iv'+n).toString('base64')+'.'+Buffer.from('ciphertext'+n).toString('base64');
 assert.throws(()=>createPatient(db,'{"surname":"Ярошенко"}',doc.id),/зашифрована/);
 const p=createPatient(db,enc('card'),doc.id);
 assert.equal(p.enc,enc('card'));assert.equal(p.surname,'');assert.equal(p.status,'active');
 assert.equal(listPatients(db).length,1);assert.equal(listPatients(db)[0].last_sheet_date,null);
 upsertWeight(db,p.id,'2026-10-15',enc('w1'),doc.id);
 assert.throws(()=>upsertWeight(db,p.id,'15.10.2026',enc('w'),doc.id),/дата/);
 assert.deepEqual(listWeights(db,p.id),[{date:'2026-10-15',enc:enc('w1'),grams:null}]);
 const s1=putSheet(db,p.id,'2026-10-16',enc('s1'),false,doc.id);
 assert.equal(s1.status,'draft');assert.equal(s1.valid,0);assert.equal(s1.inputs_json,null);
 assert.throws(()=>signSheet(db,p.id,'2026-10-16',doc.id),/неполный/);
 const s1b=putSheet(db,p.id,'2026-10-16',enc('s1b'),true,doc.id);assert.equal(s1b.id,s1.id);assert.equal(s1b.enc,enc('s1b'));
 signSheet(db,p.id,'2026-10-16',doc.id);assert.equal(getSheet(db,p.id,'2026-10-16').status,'signed');
 assert.throws(()=>putSheet(db,p.id,'2026-10-16',enc('x'),true,doc.id),/подписан/);
 assert.throws(()=>deleteDraft(db,p.id,'2026-10-16'),/не удаляется/);
 putSheet(db,p.id,'2026-10-17',enc('s2'),true,doc.id);
 const l=listPatients(db)[0];assert.equal(l.last_sheet_date,'2026-10-17');assert.equal(l.last_sheet_status,'draft');assert.equal(l.last_weight_enc,enc('w1'));
 assert.deepEqual(listSheets(db,p.id).map(s=>s.sheet_date),['2026-10-17','2026-10-16']);
 unsignSheet(db,p.id,'2026-10-16');assert.equal(getSheet(db,p.id,'2026-10-16').version,2);
 deleteDraft(db,p.id,'2026-10-17');assert.equal(listSheets(db,p.id).length,1);
 updatePatient(db,p.id,enc('card2'));assert.equal(getPatient(db,p.id).enc,enc('card2'));
 setPatientStatus(db,p.id,'discharged','2026-10-20');assert.equal(listPatients(db).length,0);assert.equal(listPatients(db,'discharged').length,1);
 assert.throws(()=>setPatientStatus(db,p.id,'discharged','вчера'),/дат/);
});

test('старые открытые записи отдаются как есть и перешифровываются один раз', () => {
 const db=fresh();
 db.prepare("insert into patients(surname,history_number,birth_date,sex,admitted_on) values ('Ярошенко','1111','2026-10-15','male','2026-10-15')").run();
 db.prepare("insert into weights(patient_id,date,grams) values (1,'2026-10-15',1450)").run();
 db.prepare("insert into sheets(patient_id,sheet_date,inputs_json,ui_json,summary_json) values (1,'2026-10-16','{\"fluid\":\"80\"}','{}','{}')").run();
 const p=getPatient(db,1);assert.equal(p.surname,'Ярошенко');assert.equal(p.enc,null);
 assert.deepEqual(listWeights(db,1),[{date:'2026-10-15',enc:null,grams:1450}]);
 assert.equal(listSheets(db,1)[0].inputs_json,'{"fluid":"80"}');assert.equal(listPatients(db)[0].last_weight_grams,1450);
 const enc='v1.'+Buffer.from('iv').toString('base64')+'.'+Buffer.from('ct').toString('base64');
 assert.equal(encryptLegacy(db,'patient',1,enc),1);assert.equal(encryptLegacy(db,'patient',1,enc),0);
 assert.equal(encryptLegacy(db,'weight',1,enc,'2026-10-15'),1);assert.equal(encryptLegacy(db,'sheet',1,enc,'2026-10-16'),1);
 const after=getPatient(db,1);assert.equal(after.surname,'');assert.equal(after.enc,enc);
 assert.equal(listWeights(db,1)[0].grams,null);assert.equal(listSheets(db,1)[0].inputs_json,null);
 assert.deepEqual(plainCounts(db),{patients:0,weights:0,sheets:0});
});

test('ключ отделения: создание один раз, обновление обёрток, проверка полей', () => {
 const db=fresh();assert.equal(getVault(db),null);
 const rec={kdf_salt:'c2FsdA==',kdf_iterations:600000,wrapped_key:'v1.a.b',recovery_wrapped_key:'v1.c.d',key_version:1};
 const v=createVaultRecord(db,rec);assert.equal(v.kdf_iterations,600000);assert.ok(v.created_at);
 assert.throws(()=>createVaultRecord(db,rec),/уже создан/);
 assert.throws(()=>updateVaultRecord(db,{kdf_iterations:10}),/итераций/);
 updateVaultRecord(db,{wrapped_key:'v1.e.f'});assert.equal(getVault(db).wrapped_key,'v1.e.f');assert.equal(getVault(db).recovery_wrapped_key,'v1.c.d');
});


test('приглашения: код одноразовый, роль из кода, истёкший и чужой не работают', () => {
 const db=fresh();const admin=createUser(db,{login:'admin',name:'А',role:'admin',password:'secret123'});
 const inv=createInvite(db,'doctor','Иванов',admin.id);
 assert.match(inv.code,/^[A-Z0-9]{8}$/);assert.equal(inviteByCode(db,inv.code.toLowerCase()).role,'doctor');
 assert.equal(inviteByCode(db,'NOPE1234'),null);
 const doc=redeemInvite(db,inv.code,{login:'ivanov',name:'Иванов',password:'secret123'});
 assert.equal(doc.role,'doctor');assert.equal(inviteByCode(db,inv.code),null);
 assert.throws(()=>redeemInvite(db,inv.code,{login:'x2',name:'',password:'secret123'}),/не подходит/);
 assert.equal(listInvites(db)[0].used_login,'ivanov');
 const old=createInvite(db,'nurse','',admin.id,0);assert.equal(inviteByCode(db,old.code),null);
 const open=createInvite(db,'nurse','',admin.id);deleteInvite(db,open.id);assert.equal(inviteByCode(db,open.code),null);
 // логин занят: приглашение не гасится
 const again=createInvite(db,'nurse','',admin.id);assert.throws(()=>redeemInvite(db,again.code,{login:'ivanov',name:'',password:'secret123'}));assert.ok(inviteByCode(db,again.code));
});

test('перебор: после 5 неверных попыток вход закрыт, удачный вход очищает счётчик; смена пароля закрывает чужие сессии', () => {
 const db=fresh();const u=createUser(db,{login:'doc',name:'Врач',role:'doctor',password:'secret123'});
 const keys=['login:doc','ip:10.0.0.1'];
 for(let i=0;i<4;i++)noteFailedAttempt(db,keys);assert.equal(tooManyAttempts(db,keys),0);
 noteFailedAttempt(db,keys);assert.ok(tooManyAttempts(db,keys)>=5);assert.ok(tooManyAttempts(db,['login:other','ip:10.0.0.1'])>=5);assert.equal(tooManyAttempts(db,['login:other','ip:10.0.0.2']),0);
 clearAttempts(db,keys);assert.equal(tooManyAttempts(db,keys),0);
 const s1=login(db,'doc','secret123'),s2=login(db,'doc','secret123');
 assert.throws(()=>changeOwnPassword(db,u.id,'wrong','newpass123'),/неверный/);
 changeOwnPassword(db,u.id,'secret123','newpass123',s1.token);
 assert.ok(userByToken(db,s1.token));assert.equal(userByToken(db,s2.token),null);
 assert.ok(login(db,'doc','newpass123'));assert.equal(login(db,'doc','secret123'),null);
 setPassword(db,u.id,'another123');assert.equal(userByToken(db,s1.token),null);
});
