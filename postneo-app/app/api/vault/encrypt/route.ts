import {getDb} from '@/lib/server/db';
import {audit} from '@/lib/server/auth';
import {encryptLegacy} from '@/lib/server/patients';
import {clientIp,fail,json,readJson,requireUser} from '@/lib/server/session';
export const dynamic='force-dynamic';
/** Перешифровка старых открытых записей: администратор прочитал их в браузере, зашифровал и прислал. */
export async function POST(req:Request){
 const u=requireUser(req,['admin']);if(u instanceof Response)return u;
 const body=await readJson<{items:{kind:'patient'|'weight'|'sheet';id:number;date?:string;enc:string}[]}>(req);if(!body?.items?.length)return fail('Нет данных');
 if(body.items.length>500)return fail('Не больше 500 записей за раз');
 try{
  const db=getDb();let changed=0;
  const tx=db.transaction(()=>{for(const it of body.items)changed+=Number(encryptLegacy(db,it.kind,it.id,it.enc,it.date));});tx();
  audit(db,u,'vault-encrypt','vault',null,String(changed),clientIp(req)??undefined);
  return json({changed});
 }catch(e){return fail((e as Error).message);}
}
