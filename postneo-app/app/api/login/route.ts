import {getDb} from '@/lib/server/db';
import {attemptLimit,attemptWindowMin,audit,clearAttempts,login as signIn,noteFailedAttempt,tooManyAttempts} from '@/lib/server/auth';
import {clientIp,fail,readJson,sessionCookie} from '@/lib/server/session';
export const dynamic='force-dynamic';
export async function POST(req:Request){
 const body=await readJson<{login:string;password:string}>(req);if(!body?.login||!body?.password)return fail('Введите логин и пароль');
 const db=getDb();const ip=clientIp(req)??'';const loginName=body.login.trim().toLowerCase().slice(0,32);
 const keys=['login:'+loginName,'ip:'+ip];
 if(tooManyAttempts(db,keys)){audit(db,null,'login-blocked','user',null,loginName,ip||undefined);return fail(`Слишком много неверных попыток. Подождите ${attemptWindowMin} минут`,429);}
 const s=signIn(db,loginName,body.password,{ip:ip||undefined,ua:req.headers.get('user-agent')??undefined});
 if(!s){noteFailedAttempt(db,keys);audit(db,null,'login-failed','user',null,loginName,ip||undefined);
  const left=tooManyAttempts(db,keys)?0:attemptLimit;return fail(left?'Неверный логин или пароль':`Неверный логин или пароль. Вход закрыт на ${attemptWindowMin} минут`,401);}
 clearAttempts(db,keys);
 audit(db,s.user,'login','user',s.user.id,'',ip||undefined);
 return Response.json({user:s.user},{headers:{'Set-Cookie':sessionCookie(s.token)}});
}
