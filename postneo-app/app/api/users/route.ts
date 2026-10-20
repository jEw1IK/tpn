import {getDb} from '@/lib/server/db';
import {audit,createUser,listUsers,type Role} from '@/lib/server/auth';
import {clientIp,fail,json,readJson,requireUser} from '@/lib/server/session';
export const dynamic='force-dynamic';
export function GET(req:Request){const u=requireUser(req,['admin']);if(u instanceof Response)return u;return json({users:listUsers(getDb())});}
export async function POST(req:Request){
 const u=requireUser(req,['admin']);if(u instanceof Response)return u;
 const body=await readJson<{login:string;name:string;role:Role;password:string}>(req);if(!body)return fail('Нет данных');
 if(!['admin','doctor','nurse'].includes(body.role))return fail('Неизвестная роль');
 try{const db=getDb();const created=createUser(db,body);audit(db,u,'user-create','user',created.id,created.login+' '+created.role,clientIp(req)??undefined);return json({user:created},201);}
 catch(e){return fail((e as Error).message.includes('UNIQUE')?'Такой логин уже есть':(e as Error).message);}
}
