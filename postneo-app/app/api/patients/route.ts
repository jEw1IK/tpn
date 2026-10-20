import {getDb} from '@/lib/server/db';
import {audit} from '@/lib/server/auth';
import {createPatient,listPatients,patientGlance,type PatientInput} from '@/lib/server/patients';
import {todayIso} from '@/lib/sheet-flow';
import {canEdit,clientIp,fail,json,readJson,requireUser} from '@/lib/server/session';
export const dynamic='force-dynamic';
export function GET(req:Request){
 const u=requireUser(req);if(u instanceof Response)return u;
 const db=getDb();const status=(new URL(req.url).searchParams.get('status')||'active') as 'active'|'discharged'|'all';const date=new URL(req.url).searchParams.get('date')||todayIso();
 return json({patients:listPatients(db,status).map(p=>({...p,glance:patientGlance(db,p,date)}))});
}
export async function POST(req:Request){
 const u=requireUser(req);if(u instanceof Response)return u;if(!canEdit(u))return fail('Недостаточно прав',403);
 const body=await readJson<PatientInput>(req);if(!body)return fail('Нет данных');
 try{const db=getDb();const p=createPatient(db,body,u.id);audit(db,u,'create','patient',p.id,p.surname+' № '+p.history_number,clientIp(req)??undefined);return json({patient:p},201);}
 catch(e){return fail((e as Error).message);}
}
