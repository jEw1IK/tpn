import {getDb} from '@/lib/server/db';
import {audit,createInvite,listInvites,type KeyWrapRec,type Role} from '@/lib/server/auth';
import {clientIp,fail,json,readJson,requireUser} from '@/lib/server/session';
export const dynamic='force-dynamic';
export function GET(req:Request){const u=requireUser(req,['admin']);if(u instanceof Response)return u;return json({invites:listInvites(getDb())});}
/** Код создаёт браузер администратора; сюда приходят только его SHA-256 и копия ключа под кодом. */
export async function POST(req:Request){
 const u=requireUser(req,['admin']);if(u instanceof Response)return u;
 const body=await readJson<{role:Role;note?:string;days?:number;codeId:string;keyWrap?:KeyWrapRec|null}>(req);
 if(!body||!['admin','doctor','nurse'].includes(body.role))return fail('Укажите роль');
 try{
  const db=getDb();const inv=createInvite(db,body.role,body.note??'',u.id,body.codeId,body.keyWrap??null,Math.min(30,Math.max(1,Number(body.days)||7)));
  audit(db,u,'invite-create','invite',inv.id,body.role+(body.note?' '+body.note:''),clientIp(req)??undefined);
  return json({invite:inv},201);
 }catch(e){return fail((e as Error).message);}
}
