import {cookies} from 'next/headers';
import {getDb} from './db.ts';
import {cookieName,userByToken,type Role,type User} from './auth.ts';

/** Пользователь текущего запроса в серверных компонентах. */
export async function currentUser():Promise<User|null>{
 const store=await cookies();
 return userByToken(getDb(),store.get(cookieName)?.value);
}
/** Пользователь в route handler: cookie читается из запроса напрямую. */
export function userFromRequest(req:Request):User|null{
 const cookie=req.headers.get('cookie')||'';
 const m=cookie.match(new RegExp('(?:^|;\\s*)'+cookieName+'=([^;]+)'));
 return userByToken(getDb(),m?decodeURIComponent(m[1]):null);
}
export function clientIp(req:Request):string|null{return (req.headers.get('x-forwarded-for')||'').split(',')[0].trim()||null;}
export const json=(data:unknown,status=200)=>Response.json(data,{status});
export const fail=(message:string,status=400)=>Response.json({error:message},{status});
/** Права: медсестра смотрит и печатает, врач ведёт пациентов, администратор заводит людей и снимает подписи. */
export const canEdit=(u:User)=>u.role==='doctor'||u.role==='admin';
export const isAdmin=(u:User)=>u.role==='admin';
export function requireUser(req:Request,roles?:Role[]):User|Response{
 const u=userFromRequest(req);
 if(!u)return fail('Нужен вход',401);
 if(roles&&!roles.includes(u.role))return fail('Недостаточно прав',403);
 return u;
}
export function sessionCookie(token:string|null):string{
 const secure=process.env.COOKIE_SECURE==='1'?'; Secure':'';
 return token?`${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${secure}`:`${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
export async function readJson<T>(req:Request):Promise<T|null>{try{return await req.json() as T;}catch{return null;}}
