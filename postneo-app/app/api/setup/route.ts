import {getDb} from '@/lib/server/db';
import {audit,countUsers,createUser,login as signIn} from '@/lib/server/auth';
import {clientIp,fail,json,kartDisabled,readJson,sessionCookie} from '@/lib/server/session';
export const dynamic='force-dynamic';
/** Первый запуск: пока нет ни одного пользователя, можно завести администратора. Потом маршрут закрыт. */
export function GET(){if(kartDisabled())return fail('Калькулятор без базы',404);return json({needed:countUsers(getDb())===0});}
export async function POST(req:Request){
 if(kartDisabled())return fail('Калькулятор без базы',404);
 const db=getDb();if(countUsers(db)>0)return fail('Администратор уже создан',403);
 const body=await readJson<{login:string;name:string;password:string}>(req);if(!body)return fail('Нет данных');
 try{const user=createUser(db,{login:body.login,name:body.name,role:'admin',password:body.password});const s=signIn(db,user.login,body.password,{ip:clientIp(req)??undefined,ua:req.headers.get('user-agent')??undefined})!;audit(db,user,'setup','user',user.id,'первый администратор',clientIp(req)??undefined);
  return Response.json({user},{headers:{'Set-Cookie':sessionCookie(s.token)}});}
 catch(e){return fail((e as Error).message);}
}
