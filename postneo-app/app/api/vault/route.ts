import {getDb} from '@/lib/server/db';
import {audit,setUserWrap,type KeyWrapRec} from '@/lib/server/auth';
import {createVaultRecord,getVault,plainCounts,updateVaultRecord} from '@/lib/server/vault';
import type {VaultRecord} from '@/lib/crypto';
import {clientIp,fail,isAdmin,json,readJson,requireUser} from '@/lib/server/session';
export const dynamic='force-dynamic';
/** Обёртки ключа отделения. Код восстановления нужен только администратору, остальным его обёртка не отдаётся. */
export function GET(req:Request){
 const u=requireUser(req);if(u instanceof Response)return u;
 const db=getDb();const v=getVault(db);
 if(!v)return json({vault:null,plain:isAdmin(u)?plainCounts(db):undefined});
 const {recovery_wrapped_key,...rest}=v;
 return json({vault:isAdmin(u)?v:{...rest,recovery_wrapped_key:''},plain:isAdmin(u)?plainCounts(db):undefined});
}
export async function POST(req:Request){
 const u=requireUser(req,['admin']);if(u instanceof Response)return u;
 const body=await readJson<Omit<VaultRecord,'created_at'>&{adminWrap?:KeyWrapRec}>(req);if(!body)return fail('Нет данных');
 try{const db=getDb();const {adminWrap,...record}=body;const v=db.transaction(()=>{const v=createVaultRecord(db,record);if(adminWrap)setUserWrap(db,u.id,adminWrap);return v;})();audit(db,u,'vault-create','vault',null,'',clientIp(req)??undefined);const {recovery_wrapped_key:_r,...rest}=v;return json({vault:rest},201);}
 catch(e){return fail((e as Error).message);}
}
export async function PUT(req:Request){
 const u=requireUser(req,['admin']);if(u instanceof Response)return u;
 const body=await readJson<Partial<Pick<VaultRecord,'kdf_salt'|'kdf_iterations'|'wrapped_key'|'recovery_wrapped_key'>>>(req);if(!body)return fail('Нет данных');
 try{const db=getDb();updateVaultRecord(db,body);audit(db,u,'vault-rewrap','vault',null,'',clientIp(req)??undefined);return json({ok:true});}
 catch(e){return fail((e as Error).message);}
}
