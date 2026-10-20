import {getDb} from '@/lib/server/db';
import {audit} from '@/lib/server/auth';
import {deleteWeight,getPatient,listWeights,upsertWeight} from '@/lib/server/patients';
import {canEdit,clientIp,fail,json,readJson,requireUser} from '@/lib/server/session';
export const dynamic='force-dynamic';
type Ctx={params:Promise<{id:string}>};
export async function POST(req:Request,{params}:Ctx){
 const u=requireUser(req);if(u instanceof Response)return u;if(!canEdit(u))return fail('Недостаточно прав',403);
 const db=getDb();const id=Number((await params).id);if(!getPatient(db,id))return fail('Пациент не найден',404);
 const body=await readJson<{date:string;grams:number}>(req);if(!body)return fail('Нет данных');
 try{upsertWeight(db,id,body.date,Number(body.grams),u.id);audit(db,u,'weight','patient',id,body.date+' '+body.grams+' г',clientIp(req)??undefined);return json({weights:listWeights(db,id)});}
 catch(e){return fail((e as Error).message);}
}
export async function DELETE(req:Request,{params}:Ctx){
 const u=requireUser(req);if(u instanceof Response)return u;if(!canEdit(u))return fail('Недостаточно прав',403);
 const db=getDb();const id=Number((await params).id);const date=new URL(req.url).searchParams.get('date')||'';
 deleteWeight(db,id,date);audit(db,u,'weight-delete','patient',id,date,clientIp(req)??undefined);return json({weights:listWeights(db,id)});
}
