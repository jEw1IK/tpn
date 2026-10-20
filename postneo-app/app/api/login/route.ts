import {getDb} from '@/lib/server/db';
import {audit,login as signIn} from '@/lib/server/auth';
import {clientIp,fail,readJson,sessionCookie} from '@/lib/server/session';
export const dynamic='force-dynamic';
export async function POST(req:Request){
 const body=await readJson<{login:string;password:string}>(req);if(!body?.login||!body?.password)return fail('Введите логин и пароль');
 const db=getDb();const ip=clientIp(req)??undefined;
 const s=signIn(db,body.login,body.password,{ip,ua:req.headers.get('user-agent')??undefined});
 if(!s){audit(db,null,'login-failed','user',null,body.login.slice(0,32),ip);return fail('Неверный логин или пароль',401);}
 audit(db,s.user,'login','user',s.user.id,'',ip);
 return Response.json({user:s.user},{headers:{'Set-Cookie':sessionCookie(s.token)}});
}
