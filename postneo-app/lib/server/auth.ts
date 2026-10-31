import {createHash,randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import type {Db} from './db.ts';

import {type Role,type User,roleNames} from '../roles.ts';
export type {Role,User};export {roleNames};
export const cookieName='postneo_session';
/** Вход держится, пока человек сам не нажмёт «Выйти» (год с последнего действия). Смена пароля и отключение закрывают все сессии. */
export const sessionHours=24*365;

export function hashPassword(password:string):string{
 const salt=randomBytes(16).toString('hex');
 return salt+':'+scryptSync(password,salt,64).toString('hex');
}
export function verifyPassword(password:string,stored:string):boolean{
 const [salt,hash]=stored.split(':');if(!salt||!hash)return false;
 const a=Buffer.from(hash,'hex'),b=scryptSync(password,salt,64);
 return a.length===b.length&&timingSafeEqual(a,b);
}
const hashToken=(token:string)=>createHash('sha256').update(token).digest('hex');

export function countUsers(db:Db):number{return (db.prepare('select count(*) as c from users').get() as {c:number}).c;}
export function createUser(db:Db,user:{login:string;name:string;role:Role;password:string}):User{
 if(!/^[a-zA-Z0-9._-]{3,32}$/.test(user.login))throw new Error('Логин: 3–32 символа, латиница, цифры, точка, дефис');
 if(user.password.length<8)throw new Error('Пароль не короче 8 символов');
 const info=db.prepare('insert into users(login,name,role,password_hash) values (?,?,?,?)').run(user.login.toLowerCase(),user.name.trim()||user.login,user.role,hashPassword(user.password));
 return getUser(db,Number(info.lastInsertRowid))!;
}
export function getUser(db:Db,id:number):User|null{return (db.prepare('select id,login,name,role,disabled,created_at from users where id=?').get(id) as User|undefined)??null;}
export function listUsers(db:Db):User[]{return db.prepare('select id,login,name,role,disabled,created_at from users order by role,login').all() as User[];}
/** Смена пароля закрывает все сессии пользователя: на других компьютерах войдут заново. Текущую можно оставить по токену. */
export function setPassword(db:Db,id:number,password:string,keepToken?:string,keyWrap?:KeyWrapRec|null){
 if(password.length<8)throw new Error('Пароль не короче 8 символов');
 db.prepare('update users set password_hash=? where id=?').run(hashPassword(password),id);
 // старая копия ключа открывалась старым паролем: заменяем новой или убираем (откроется кодом восстановления у администратора)
 setUserWrap(db,id,keyWrap??null);
 if(keepToken)db.prepare('delete from sessions where user_id=? and token_hash<>?').run(id,hashToken(keepToken));
 else db.prepare('delete from sessions where user_id=?').run(id);
}
/** Смена своего пароля: нужен старый. */
export function changeOwnPassword(db:Db,id:number,oldPassword:string,newPassword:string,keepToken?:string,keyWrap?:KeyWrapRec|null){
 const row=db.prepare('select password_hash from users where id=?').get(id) as {password_hash:string}|undefined;
 if(!row||!verifyPassword(oldPassword,row.password_hash))throw new Error('Текущий пароль неверный');
 if(oldPassword===newPassword)throw new Error('Новый пароль совпадает со старым');
 setPassword(db,id,newPassword,keepToken,keyWrap);
}

/** Защита от перебора: не больше 5 неверных попыток за 15 минут на логин и на адрес. */
export const attemptLimit=5;export const attemptWindowMin=15;
export function tooManyAttempts(db:Db,keys:string[]):number{
 db.prepare(`delete from login_attempts where at<strftime('%Y-%m-%dT%H:%M:%fZ','now','-${attemptWindowMin} minutes')`).run();
 let max=0;
 for(const k of keys){const c=(db.prepare('select count(*) as c from login_attempts where key=?').get(k) as {c:number}).c;if(c>max)max=c;}
 return max>=attemptLimit?max:0;
}
export function noteFailedAttempt(db:Db,keys:string[]){for(const k of keys)db.prepare('insert into login_attempts(key) values (?)').run(k);}
export function clearAttempts(db:Db,keys:string[]){for(const k of keys)db.prepare('delete from login_attempts where key=?').run(k);}

/** Копия ключа данных: обёртка, соль, итерации. Проверяется только форма, открыть её сервер не может. */
export type KeyWrapRec={wrap:string;salt:string;iter:number};
export function checkWrap(k:unknown):KeyWrapRec{
 const w=k as KeyWrapRec;
 if(!w||typeof w.wrap!=='string'||!/^v1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/.test(w.wrap)||w.wrap.length>512||typeof w.salt!=='string'||w.salt.length<8||w.salt.length>64||!Number.isInteger(w.iter)||w.iter<100000||w.iter>5000000)throw new Error('Неверная копия ключа');
 return {wrap:w.wrap,salt:w.salt,iter:w.iter};
}
export function getUserWrap(db:Db,id:number):KeyWrapRec|null{const r=db.prepare('select key_wrap from users where id=?').get(id) as {key_wrap:string|null}|undefined;return r?.key_wrap?JSON.parse(r.key_wrap) as KeyWrapRec:null;}
export function setUserWrap(db:Db,id:number,k:KeyWrapRec|null){db.prepare('update users set key_wrap=? where id=?').run(k?JSON.stringify(checkWrap(k)):null,id);}
/** Приглашение: код создаёт браузер администратора, сервер получает только его SHA-256 (codeId) и копию ключа под кодом.
 *  Код одноразовый, живёт 7 дней. */
export function createInvite(db:Db,role:Role,note:string,createdBy:number,codeId:string,keyWrap:KeyWrapRec|null,days=7):{id:number;expires_at:string}{
 if(!/^[0-9a-f]{64}$/.test(codeId))throw new Error('Неверный код приглашения');
 const expires=new Date(Date.now()+days*86400000).toISOString();
 const info=db.prepare('insert into invites(code_hash,role,note,created_by,expires_at,key_wrap) values (?,?,?,?,?,?)').run(hashToken(codeId),role,note.trim().slice(0,80),createdBy,expires,keyWrap?JSON.stringify(checkWrap(keyWrap)):null);
 return {id:Number(info.lastInsertRowid),expires_at:expires};
}
export type Invite={id:number;role:Role;note:string;created_at:string;expires_at:string;used_by:number|null;used_at:string|null;used_login:string|null};
export function listInvites(db:Db):Invite[]{return db.prepare('select i.id,i.role,i.note,i.created_at,i.expires_at,i.used_by,i.used_at,u.login as used_login from invites i left join users u on u.id=i.used_by order by i.id desc limit 100').all() as Invite[];}
export function deleteInvite(db:Db,id:number){db.prepare('delete from invites where id=? and used_by is null').run(id);}
export function inviteByCode(db:Db,codeId:string):{id:number;role:Role;note:string;keyWrap:KeyWrapRec|null}|null{
 if(!/^[0-9a-f]{64}$/.test(codeId))return null;
 const row=db.prepare("select id,role,note,key_wrap from invites where code_hash=? and used_by is null and expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')").get(hashToken(codeId)) as {id:number;role:Role;note:string;key_wrap:string|null}|undefined;
 return row?{id:row.id,role:row.role,note:row.note,keyWrap:row.key_wrap?JSON.parse(row.key_wrap) as KeyWrapRec:null}:null;
}
/** Регистрация по приглашению: пользователь, его копия ключа и погашение кода в одной транзакции. */
export function redeemInvite(db:Db,codeId:string,user:{login:string;name:string;password:string},keyWrap?:KeyWrapRec|null):User{
 const inv=inviteByCode(db,codeId);if(!inv)throw new Error('Код приглашения не подходит или истёк');
 return db.transaction(()=>{
  const created=createUser(db,{...user,role:inv.role});
  if(keyWrap)setUserWrap(db,created.id,keyWrap);
  db.prepare("update invites set used_by=?,used_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') where id=? and used_by is null").run(created.id,inv.id);
  return created;
 })();
}
export function setDisabled(db:Db,id:number,disabled:boolean){db.prepare('update users set disabled=? where id=?').run(disabled?1:0,id);if(disabled)db.prepare('delete from sessions where user_id=?').run(id);}

export function login(db:Db,loginName:string,password:string,meta:{ip?:string;ua?:string}={}):{token:string;user:User}|null{
 const row=db.prepare('select id,password_hash,disabled from users where login=?').get(loginName.trim().toLowerCase()) as {id:number;password_hash:string;disabled:number}|undefined;
 if(!row||row.disabled||!verifyPassword(password,row.password_hash))return null;
 const token=randomBytes(32).toString('hex');
 const expires=new Date(Date.now()+sessionHours*3600000).toISOString();
 db.prepare('insert into sessions(user_id,token_hash,expires_at,ip,ua) values (?,?,?,?,?)').run(row.id,hashToken(token),expires,meta.ip??null,(meta.ua??'').slice(0,200));
 return {token,user:getUser(db,row.id)!};
}
/** Пользователь по cookie; каждое обращение продлевает сессию. */
export function userByToken(db:Db,token:string|undefined|null):User|null{
 if(!token)return null;
 db.prepare("delete from sessions where expires_at<strftime('%Y-%m-%dT%H:%M:%fZ','now')").run();
 const row=db.prepare('select s.id as sid,u.id,u.login,u.name,u.role,u.disabled,u.created_at from sessions s join users u on u.id=s.user_id where s.token_hash=?').get(hashToken(token)) as (User&{sid:number})|undefined;
 if(!row||row.disabled)return null;
 db.prepare('update sessions set expires_at=? where id=?').run(new Date(Date.now()+sessionHours*3600000).toISOString(),row.sid);
 const {sid:_sid,...user}=row;return user;
}
export function logout(db:Db,token:string|undefined|null){if(token)db.prepare('delete from sessions where token_hash=?').run(hashToken(token));}

export function audit(db:Db,user:User|null,action:string,entity:string,entityId:number|null,details='',ip?:string){
 db.prepare('insert into audit(user_id,action,entity,entity_id,details,ip) values (?,?,?,?,?,?)').run(user?.id??null,action,entity,entityId,details.slice(0,500),ip??null);
}
export function listAudit(db:Db,limit=200){return db.prepare('select a.id,a.at,a.action,a.entity,a.entity_id,a.details,a.ip,u.login,u.name from audit a left join users u on u.id=a.user_id order by a.id desc limit ?').all(limit) as {id:number;at:string;action:string;entity:string;entity_id:number|null;details:string;ip:string|null;login:string|null;name:string|null}[];}
