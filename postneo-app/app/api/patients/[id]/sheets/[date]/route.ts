import {getDb} from '@/lib/server/db';
import {audit} from '@/lib/server/auth';
import {deleteDraft,getPatient,openSheet,saveSheet,signSheet,unsignSheet} from '@/lib/server/patients';
import type {Inputs} from '@/lib/tpn';
import {canEdit,clientIp,fail,isAdmin,json,readJson,requireUser} from '@/lib/server/session';
export const dynamic='force-dynamic';
type Ctx={params:Promise<{id:string;date:string}>};
export async function GET(req:Request,{params}:Ctx){
 const u=requireUser(req);if(u instanceof Response)return u;
 const db=getDb();const {id,date}=await params;const pid=Number(id);if(!getPatient(db,pid))return fail('Пациент не найден',404);
 try{const sheet=canEdit(u)?openSheet(db,pid,date,u.id):null;if(!sheet)return fail('Лист не найден',404);return json({sheet});}
 catch(e){return fail((e as Error).message);}
}
export async function PUT(req:Request,{params}:Ctx){
 const u=requireUser(req);if(u instanceof Response)return u;if(!canEdit(u))return fail('Недостаточно прав',403);
 const db=getDb();const {id,date}=await params;const pid=Number(id);
 const body=await readJson<{inputs:Inputs;ui:Record<string,string>}>(req);if(!body?.inputs)return fail('Нет данных');
 try{const sheet=saveSheet(db,pid,date,body.inputs,body.ui??{},u.id);return json({sheet:{status:sheet.status,summary:sheet.summary,updated_at:sheet.updated_at,version:sheet.version}});}
 catch(e){return fail((e as Error).message,409);}
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
