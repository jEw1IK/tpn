import {getDb} from '@/lib/server/db';
import {audit,changeOwnPassword,cookieName} from '@/lib/server/auth';
import {clientIp,fail,json,readJson,requireUser,userFromRequest} from '@/lib/server/session';
export const dynamic='force-dynamic';
export function GET(req:Request){const u=userFromRequest(req);return json({user:u},u?200:401);}
/** Смена своего пароля. Остальные сессии этого пользователя закрываются, текущая остаётся. */
export async function PATCH(req:Request){
 const u=requireUser(req);if(u instanceof Response)return u;
 const body=await readJson<{oldPassword:string;newPassword:string}>(req);if(!body?.oldPassword||!body?.newPassword)return fail('Укажите текущий и новый пароль');
 const m=(req.headers.get('cookie')||'').match(new RegExp('(?:^|;\\s*)'+cookieName+'=([^;]+)'));
 try{const db=getDb();changeOwnPassword(db,u.id,body.oldPassword,body.newPassword,m?decodeURIComponent(m[1]):undefined);audit(db,u,'password-change','user',u.id,'',clientIp(req)??undefined);return json({ok:true});}
 catch(e){return fail((e as Error).message);}
}
