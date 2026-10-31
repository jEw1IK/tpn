import {getDb} from '@/lib/server/db';
import {attemptLimit,attemptWindowMin,audit,clearAttempts,getUserWrap,login as signIn,noteFailedAttempt,tooManyAttempts} from '@/lib/server/auth';
import {getVault} from '@/lib/server/vault';
import {clientIp,fail,kartDisabled,readJson,sessionCookie} from '@/lib/server/session';
export const dynamic='force-dynamic';
export async function POST(req:Request){
 if(kartDisabled())return fail('Калькулятор без базы',404);
 const body=await readJson<{login:string;password:string}>(req);if(!body?.login||!body?.password)return fail('Введите логин и пароль');
 const db=getDb();const ip=clientIp(req)??'';const loginName=body.login.trim().toLowerCase().slice(0,32);
 const keys=['login:'+loginName,'ip:'+ip];
 if(tooManyAttempts(db,keys)){audit(db,null,'login-blocked','user',null,loginName,ip||undefined);return fail(`Слишком много неверных попыток. Подождите ${attemptWindowMin} минут`,429);}
 const s=signIn(db,loginName,body.password,{ip:ip||undefined,ua:req.headers.get('user-agent')??undefined});
 if(!s){noteFailedAttempt(db,keys);audit(db,null,'login-failed','user',null,loginName,ip||undefined);
  const left=tooManyAttempts(db,keys)?0:attemptLimit;return fail(left?'Неверный логин или пароль':`Неверный логин или пароль. Вход закрыт на ${attemptWindowMin} минут`,401);}
 clearAttempts(db,keys);
 audit(db,s.user,'login','user',s.user.id,'',ip||undefined);
 // копия ключа под паролем пользователя и параметры хранилища: браузер откроет ключ сразу, без фразы
 const v=getVault(db);const vault=v?{...v,recovery_wrapped_key:s.user.role==='admin'?v.recovery_wrapped_key:''}:null;
 return Response.json({user:s.user,keyWrap:getUserWrap(db,s.user.id),vault},{headers:{'Set-Cookie':sessionCookie(s.token)}});
}
