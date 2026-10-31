import {getDb} from '@/lib/server/db';
import {audit} from '@/lib/server/auth';
import {getPatient,listSheets,listWeights,setPatientStatus,updatePatient} from '@/lib/server/patients';
import {todayIso} from '@/lib/sheet-flow';
import {canEdit,clientIp,fail,json,readJson,requireUser} from '@/lib/server/session';
export const dynamic='force-dynamic';
type Ctx={params:Promise<{id:string}>};
/** Вся карточка одним ответом: шифротекст карточки, весов и листов. Браузер расшифрует и посчитает сводку сам. */
export async function GET(req:Request,{params}:Ctx){
 const u=requireUser(req);if(u instanceof Response)return u;
 const db=getDb();const id=Number((await params).id);const p=getPatient(db,id);if(!p)return fail('Пациент не найден',404);
 audit(db,u,'view','patient',id,'',clientIp(req)??undefined);
 return json({patient:p,weights:listWeights(db,id),sheets:listSheets(db,id)});
}
export async function PATCH(req:Request,{params}:Ctx){
 const u=requireUser(req);if(u instanceof Response)return u;if(!canEdit(u))return fail('Недостаточно прав',403);
 const db=getDb();const id=Number((await params).id);if(!getPatient(db,id))return fail('Пациент не найден',404);
 const body=await readJson<{enc?:string;status?:'active'|'discharged';dischargedOn?:string}>(req);if(!body)return fail('Нет данных');
 try{
  if(body.status){setPatientStatus(db,id,body.status,body.dischargedOn??todayIso());audit(db,u,body.status==='discharged'?'discharge':'return','patient',id,'',clientIp(req)??undefined);}
  else if(body.enc){updatePatient(db,id,body.enc);audit(db,u,'update','patient',id,'',clientIp(req)??undefined);}
  else return fail('Нет данных');
  return json({patient:getPatient(db,id)});
 }catch(e){return fail((e as Error).message);}
}
