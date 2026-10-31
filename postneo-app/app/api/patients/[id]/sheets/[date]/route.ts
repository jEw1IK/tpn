import {getDb} from '@/lib/server/db';
import {audit} from '@/lib/server/auth';
import {deleteDraft,getPatient,getSheet,putSheet,signSheet,unsignSheet,upsertWeight} from '@/lib/server/patients';
import {canEdit,clientIp,fail,isAdmin,json,readJson,requireUser} from '@/lib/server/session';
export const dynamic='force-dynamic';
type Ctx={params:Promise<{id:string;date:string}>};
export async function GET(req:Request,{params}:Ctx){
 const u=requireUser(req);if(u instanceof Response)return u;
 const db=getDb();const {id,date}=await params;const pid=Number(id);if(!getPatient(db,pid))return fail('Пациент не найден',404);
 const sheet=getSheet(db,pid,date);if(!sheet)return fail('Лист не найден',404);
 audit(db,u,'open','sheet',pid,date,clientIp(req)??undefined);
 return json({sheet});
}
/** Черновик: шифротекст листа, флаг полноты для подписи и, если взвесили, шифротекст массы на дату. */
export async function PUT(req:Request,{params}:Ctx){
 const u=requireUser(req);if(u instanceof Response)return u;if(!canEdit(u))return fail('Недостаточно прав',403);
 const db=getDb();const {id,date}=await params;const pid=Number(id);const patient=getPatient(db,pid);if(!patient)return fail('Пациент не найден',404);
 if(patient.status!=='active')return fail('Пациент выписан: листы не ведутся',409);
 const body=await readJson<{enc:string;valid:boolean;weight?:{date:string;enc:string}}>(req);if(!body?.enc)return fail('Нет данных');
 try{
  const created=!getSheet(db,pid,date);
  const sheet=db.transaction(()=>{const s=putSheet(db,pid,date,body.enc,!!body.valid,u.id);if(body.weight)upsertWeight(db,pid,body.weight.date,body.weight.enc,u.id);return s;})();
  if(created)audit(db,u,'open','sheet',pid,date,clientIp(req)??undefined);
  return json({sheet:{status:sheet.status,valid:sheet.valid,updated_at:sheet.updated_at,version:sheet.version}});
 }catch(e){return fail((e as Error).message,409);}
}
/** Действия над листом: подписать, снять подпись (администратор), удалить черновик. */
export async function POST(req:Request,{params}:Ctx){
 const u=requireUser(req);if(u instanceof Response)return u;if(!canEdit(u))return fail('Недостаточно прав',403);
 const db=getDb();const {id,date}=await params;const pid=Number(id);const ip=clientIp(req)??undefined;
 const body=await readJson<{action:'sign'|'unsign'|'delete'}>(req);if(!body?.action)return fail('Нет действия');
 try{
  if(body.action==='sign'){signSheet(db,pid,date,u.id);audit(db,u,'sign','sheet',pid,date,ip);}
  else if(body.action==='unsign'){if(!isAdmin(u))return fail('Снять подпись может только администратор',403);unsignSheet(db,pid,date);audit(db,u,'unsign','sheet',pid,date,ip);}
  else if(body.action==='delete'){deleteDraft(db,pid,date);audit(db,u,'delete-draft','sheet',pid,date,ip);}
  else return fail('Неизвестное действие');
  return json({ok:true});
 }catch(e){return fail((e as Error).message,409);}
}
