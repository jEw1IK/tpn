import {getDb} from '@/lib/server/db';
import {audit} from '@/lib/server/auth';
import {createPatient,listPatients} from '@/lib/server/patients';
import {canEdit,clientIp,fail,json,readJson,requireUser} from '@/lib/server/session';
export const dynamic='force-dynamic';
export function GET(req:Request){
 const u=requireUser(req);if(u instanceof Response)return u;
 const s=new URL(req.url).searchParams.get('status');const status=s==='discharged'?'discharged':s==='all'?'all':'active';
 return json({patients:listPatients(getDb(),status)});
}
export async function POST(req:Request){
 const u=requireUser(req);if(u instanceof Response)return u;if(!canEdit(u))return fail('Недостаточно прав',403);
 const body=await readJson<{enc:string}>(req);if(!body?.enc)return fail('Нет данных');
 try{const db=getDb();const p=createPatient(db,body.enc,u.id);audit(db,u,'create','patient',p.id,'',clientIp(req)??undefined);return json({patient:p},201);}
 catch(e){return fail((e as Error).message);}
}
