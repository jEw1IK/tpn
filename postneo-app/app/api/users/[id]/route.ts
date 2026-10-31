import {getDb} from '@/lib/server/db';
import {audit,getUser,setDisabled,setPassword,type KeyWrapRec} from '@/lib/server/auth';
import {clientIp,fail,json,readJson,requireUser} from '@/lib/server/session';
export const dynamic='force-dynamic';
type Ctx={params:Promise<{id:string}>};
export async function PATCH(req:Request,{params}:Ctx){
 const u=requireUser(req,['admin']);if(u instanceof Response)return u;
 const db=getDb();const id=Number((await params).id);const target=getUser(db,id);if(!target)return fail('Пользователь не найден',404);
 const body=await readJson<{password?:string;disabled?:boolean;keyWrap?:KeyWrapRec|null}>(req);if(!body)return fail('Нет данных');
 try{
  if(typeof body.password==='string'){setPassword(db,id,body.password,undefined,body.keyWrap??null);audit(db,u,'user-password','user',id,'',clientIp(req)??undefined);}
  if(typeof body.disabled==='boolean'){if(id===u.id&&body.disabled)return fail('Нельзя отключить себя');setDisabled(db,id,body.disabled);audit(db,u,body.disabled?'user-disable':'user-enable','user',id,'',clientIp(req)??undefined);}
  return json({user:getUser(db,id)});
 }catch(e){return fail((e as Error).message);}
}
