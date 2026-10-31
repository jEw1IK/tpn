import {getDb} from '@/lib/server/db';
import {audit,changeOwnPassword,cookieName,getUserWrap,setUserWrap,type KeyWrapRec} from '@/lib/server/auth';
import {clientIp,fail,json,readJson,requireUser,userFromRequest} from '@/lib/server/session';
export const dynamic='force-dynamic';
export function GET(req:Request){const u=userFromRequest(req);return json({user:u,keyWrap:u?getUserWrap(getDb(),u.id):null},u?200:401);}
/** Своя копия ключа под своим паролем: при переходе со старой фразы отделения. */
export async function PUT(req:Request){
 const u=requireUser(req);if(u instanceof Response)return u;
 const body=await readJson<{keyWrap:KeyWrapRec}>(req);if(!body?.keyWrap)return fail('Нет данных');
 try{setUserWrap(getDb(),u.id,body.keyWrap);return json({ok:true});}catch(e){return fail((e as Error).message);}
}
/** Смена своего пароля. Остальные сессии этого пользователя закрываются, текущая остаётся. */
export async function PATCH(req:Request){
 const u=requireUser(req);if(u instanceof Response)return u;
 const body=await readJson<{oldPassword:string;newPassword:string;keyWrap?:KeyWrapRec|null}>(req);if(!body?.oldPassword||!body?.newPassword)return fail('Укажите текущий и новый пароль');
 const m=(req.headers.get('cookie')||'').match(new RegExp('(?:^|;\\s*)'+cookieName+'=([^;]+)'));
 try{const db=getDb();changeOwnPassword(db,u.id,body.oldPassword,body.newPassword,m?decodeURIComponent(m[1]):undefined,body.keyWrap??null);audit(db,u,'password-change','user',u.id,'',clientIp(req)??undefined);return json({ok:true});}
 catch(e){return fail((e as Error).message);}
}
