import {getSetting,setSetting,type Db} from './db.ts';
import type {VaultRecord} from '../crypto.ts';

/** Хранилище ключа отделения на сервере: только обёртки, сам ключ сервер не видит. */
export function getVault(db:Db):VaultRecord|null{
 const raw=getSetting(db,'vault');if(!raw)return null;
 try{return JSON.parse(raw) as VaultRecord;}catch{return null;}
}
const okB64=(s:unknown)=>typeof s==='string'&&s.length>0&&s.length<4096;
function check(r:Partial<VaultRecord>){
 if(!okB64(r.kdf_salt)||!okB64(r.recovery_wrapped_key)||(r.wrapped_key!==''&&!okB64(r.wrapped_key)))throw new Error('Неполные данные ключа');
 if(!Number.isInteger(r.kdf_iterations)||(r.kdf_iterations as number)<100000)throw new Error('Слишком мало итераций вывода ключа');
}
/** Первое создание: только пока ключа нет. */
export function createVaultRecord(db:Db,r:Omit<VaultRecord,'created_at'>):VaultRecord{
 if(getVault(db))throw new Error('Ключ отделения уже создан');
 check(r);
 const record:VaultRecord={kdf_salt:r.kdf_salt,kdf_iterations:r.kdf_iterations,wrapped_key:r.wrapped_key??'',recovery_wrapped_key:r.recovery_wrapped_key,key_version:r.key_version||1,created_at:new Date().toISOString()};
 setSetting(db,'vault',JSON.stringify(record));return record;
}
/** Смена фразы или кода: ключ данных тот же, меняются обёртки. */
export function updateVaultRecord(db:Db,patch:Partial<Pick<VaultRecord,'kdf_salt'|'kdf_iterations'|'wrapped_key'|'recovery_wrapped_key'>>):VaultRecord{
 const current=getVault(db);if(!current)throw new Error('Ключ отделения ещё не создан');
 const record={...current,...patch};check(record);
 setSetting(db,'vault',JSON.stringify(record));return record;
}
/** Сколько записей ещё лежит открыто (для кнопки «зашифровать всё»). */
export function plainCounts(db:Db){
 const c=(sql:string)=>(db.prepare(sql).get() as {c:number}).c;
 return {patients:c('select count(*) as c from patients where enc is null'),weights:c('select count(*) as c from weights where enc is null'),sheets:c('select count(*) as c from sheets where enc is null')};
}
