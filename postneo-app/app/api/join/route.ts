import {getDb} from '@/lib/server/db';
import {audit,inviteByCode,login as signIn,noteFailedAttempt,redeemInvite,tooManyAttempts} from '@/lib/server/auth';
import {clientIp,fail,json,kartDisabled,readJson,sessionCookie} from '@/lib/server/session';
export const dynamic='force-dynamic';
/** Проверка кода до заполнения формы: показать роль. Перебор кодов ограничен так же, как пароли. */
export async function GET(req:Request){
 if(kartDisabled())return fail('Калькулятор без базы',404);
 const code=new URL(req.url).searchParams.get('code')||'';const db=getDb();const ip=clientIp(req)??'';
 if(tooManyAttempts(db,['join:'+ip]))return fail('Слишком много попыток, подождите 15 минут',429);
 const inv=inviteByCode(db,code);if(!inv){noteFailedAttempt(db,['join:'+ip]);return fail('Код приглашения не подходит или истёк',404);}
 return json({role:inv.role,note:inv.note});
}
/** Регистрация по приглашению и сразу вход. */
export async function POST(req:Request){
 if(kartDisabled())return fail('Калькулятор без базы',404);
 const body=await readJson<{code:string;login:string;name:string;password:string}>(req);if(!body?.code||!body?.login||!body?.password)return fail('Заполните код, логин и пароль');
 const db=getDb();const ip=clientIp(req)??'';
 if(tooManyAttempts(db,['join:'+ip]))return fail('Слишком много попыток, подождите 15 минут',429);
 try{
  const user=redeemInvite(db,body.code,{login:body.login,name:body.name||body.login,password:body.password});
  const s=signIn(db,user.login,body.password,{ip:ip||undefined,ua:req.headers.get('user-agent')??undefined})!;
  audit(db,user,'join','user',user.id,user.role,ip||undefined);
  return Response.json({user},{headers:{'Set-Cookie':sessionCookie(s.token)}});
 }catch(e){const msg=(e as Error).message;if(msg.includes('приглашения'))noteFailedAttempt(db,['join:'+ip]);return fail(msg.includes('UNIQUE')?'Такой логин уже есть':msg);}
}
