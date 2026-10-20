import type {Db} from './db.ts';
import {calculate,drugs,type Inputs} from '../tpn.ts';
import {courseDays,daysBetween,nextSheetInputs,weightFromSheet,type CourseInfo,type PatientCore,type WeightPoint} from '../sheet-flow.ts';
import {patientHeader} from '../patient-header.ts';

export type Patient={id:number;surname:string;history_number:string;birth_date:string;birth_time:string|null;sex:string;gestation_weeks:number|null;gestation_days:number|null;birth_weight:number|null;admitted_on:string;diagnosis:string;status:'active'|'discharged';discharged_on:string|null;created_at:string;updated_at:string};
export type PatientInput={surname:string;historyNumber:string;birthDate:string;birthTime?:string;sex:string;gestationWeeks:number|null;gestationDays:number|null;birthWeight:number|null;admittedOn:string;diagnosis?:string};
export type SheetRow={id:number;patient_id:number;sheet_date:string;status:'draft'|'signed';inputs:Inputs;ui:Record<string,string>;summary:SheetSummary;version:number;author_id:number|null;signed_by:number|null;signed_at:string|null;created_at:string;updated_at:string};
/** Коротко о листе для карточки и списка: без пересчёта всего движка на каждой строке. */
export type SheetSummary={valid:boolean;total:number|null;perKg:number|null;linePercent:number|null;protein:number|null;kcal:number|null;weightToday:number|null;drugs:string[]};

const isoDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'));
export function validatePatient(input:PatientInput):string[]{
 const errors:string[]=[];
 if(!input.surname?.trim())errors.push('Укажите фамилию');
 if(!input.historyNumber?.trim())errors.push('Укажите номер истории');
 if(!isoDate(input.birthDate))errors.push('Укажите дату рождения');
 if(!isoDate(input.admittedOn))errors.push('Укажите дату поступления');
 if(isoDate(input.birthDate)&&isoDate(input.admittedOn)&&input.admittedOn<input.birthDate)errors.push('Поступление раньше рождения');
 if(!['male','female','undetermined'].includes(input.sex))errors.push('Укажите пол');
 if(input.gestationWeeks!==null&&(!Number.isInteger(input.gestationWeeks)||input.gestationWeeks<20||input.gestationWeeks>44))errors.push('ГВ: целые недели от 20 до 44');
 if(input.gestationDays!==null&&(!Number.isInteger(input.gestationDays)||input.gestationDays<0||input.gestationDays>6))errors.push('ГВ: дни от 0 до 6');
 if(input.birthWeight!==null&&(!Number.isFinite(input.birthWeight)||input.birthWeight<=0))errors.push('Масса при рождении: число больше 0 г');
 return errors;
}
export function createPatient(db:Db,input:PatientInput,userId:number|null):Patient{
 const errors=validatePatient(input);if(errors.length)throw new Error(errors.join('; '));
 const info=db.prepare('insert into patients(surname,history_number,birth_date,birth_time,sex,gestation_weeks,gestation_days,birth_weight,admitted_on,diagnosis,created_by) values (?,?,?,?,?,?,?,?,?,?,?)')
  .run(input.surname.trim(),input.historyNumber.trim(),input.birthDate,input.birthTime||null,input.sex,input.gestationWeeks,input.gestationDays??0,input.birthWeight,input.admittedOn,(input.diagnosis??'').trim(),userId);
 const id=Number(info.lastInsertRowid);
 if(input.birthWeight)db.prepare('insert or ignore into weights(patient_id,date,grams,created_by) values (?,?,?,?)').run(id,input.birthDate,Math.round(input.birthWeight),userId);
 return getPatient(db,id)!;
}
export function updatePatient(db:Db,id:number,input:PatientInput):Patient{
 const errors=validatePatient(input);if(errors.length)throw new Error(errors.join('; '));
 db.prepare("update patients set surname=?,history_number=?,birth_date=?,birth_time=?,sex=?,gestation_weeks=?,gestation_days=?,birth_weight=?,admitted_on=?,diagnosis=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') where id=?")
  .run(input.surname.trim(),input.historyNumber.trim(),input.birthDate,input.birthTime||null,input.sex,input.gestationWeeks,input.gestationDays??0,input.birthWeight,input.admittedOn,(input.diagnosis??'').trim(),id);
 return getPatient(db,id)!;
}
export function setPatientStatus(db:Db,id:number,status:'active'|'discharged',on:string|null){
 db.prepare("update patients set status=?,discharged_on=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') where id=?").run(status,status==='discharged'?on:null,id);
}
export function getPatient(db:Db,id:number):Patient|null{return (db.prepare('select * from patients where id=?').get(id) as Patient|undefined)??null;}
export function listPatients(db:Db,status:'active'|'discharged'|'all'='active'):Patient[]{
 return (status==='all'?db.prepare('select * from patients order by status,surname'):db.prepare('select * from patients where status=? order by surname').bind(status)).all() as Patient[];
}
export const patientCore=(p:Patient):PatientCore=>({surname:p.surname,historyNumber:p.history_number,birthDate:p.birth_date,sex:p.sex,gestationWeeks:p.gestation_weeks,gestationDays:p.gestation_days,birthWeight:p.birth_weight,admittedOn:p.admitted_on});

export function listWeights(db:Db,patientId:number):WeightPoint[]{return db.prepare('select date,grams from weights where patient_id=? order by date').all(patientId) as WeightPoint[];}
export function upsertWeight(db:Db,patientId:number,date:string,grams:number,userId:number|null){
 if(!isoDate(date)||!Number.isFinite(grams)||grams<=0)throw new Error('Взвешивание: дата и масса больше 0 г');
 db.prepare('insert into weights(patient_id,date,grams,created_by) values (?,?,?,?) on conflict(patient_id,date) do update set grams=excluded.grams,created_by=excluded.created_by').run(patientId,date,Math.round(grams),userId);
}
export function deleteWeight(db:Db,patientId:number,date:string){db.prepare('delete from weights where patient_id=? and date=?').run(patientId,date);}

function rowToSheet(row:Record<string,unknown>):SheetRow{
 return {...(row as unknown as SheetRow),inputs:JSON.parse(row.inputs_json as string),ui:JSON.parse((row.ui_json as string)||'{}'),summary:JSON.parse((row.summary_json as string)||'{}')};
}
export function listSheets(db:Db,patientId:number):SheetRow[]{return (db.prepare('select * from sheets where patient_id=? order by sheet_date desc').all(patientId) as Record<string,unknown>[]).map(rowToSheet);}
export function getSheet(db:Db,patientId:number,date:string):SheetRow|null{const row=db.prepare('select * from sheets where patient_id=? and sheet_date=?').get(patientId,date) as Record<string,unknown>|undefined;return row?rowToSheet(row):null;}
export function summarize(p:Inputs):SheetSummary{
 const r=calculate(p);const header=patientHeader(p);
 const kg=r.kg;const num=(v:string)=>{const n=Number(String(v).replace(',','.'));return Number.isFinite(n)&&n>0?n:null;};
 return {valid:r.valid&&header.valid,total:r.valid?r.total:null,perKg:num(p.fluid),linePercent:r.valid?r.mainLinePercent:null,protein:r.valid?r.proteinPlan.achievedPerKg:null,kcal:r.valid&&kg?r.kr.perKg:null,weightToday:num(p.weightToday)??num(p.weight),drugs:p.medicines.map(m=>drugs.find(d=>d.id===m.drug)?.name??m.drug)};
}
/** Лист на дату: существующий или новый из предыдущего по дате. Черновик сразу сохраняется, чтобы завтра было от чего отталкиваться. */
export function openSheet(db:Db,patientId:number,date:string,userId:number|null):SheetRow{
 if(!isoDate(date))throw new Error('Неверная дата листа');
 const existing=getSheet(db,patientId,date);if(existing)return existing;
 const patient=getPatient(db,patientId);if(!patient)throw new Error('Пациент не найден');
 const previous=(db.prepare('select * from sheets where patient_id=? and sheet_date<? order by sheet_date desc limit 1').get(patientId,date) as Record<string,unknown>|undefined);
 const inputs=nextSheetInputs({patient:patientCore(patient),date,previous:previous?rowToSheet(previous).inputs:null,weights:listWeights(db,patientId)});
 const ui=previous?(rowToSheet(previous).ui):{};
 db.prepare('insert into sheets(patient_id,sheet_date,inputs_json,ui_json,summary_json,author_id) values (?,?,?,?,?,?)').run(patientId,date,JSON.stringify(inputs),JSON.stringify(ui),JSON.stringify(summarize(inputs)),userId);
 return getSheet(db,patientId,date)!;
}
export function saveSheet(db:Db,patientId:number,date:string,inputs:Inputs,ui:Record<string,string>,userId:number|null):SheetRow{
 const sheet=getSheet(db,patientId,date);if(!sheet)throw new Error('Лист не найден');
 if(sheet.status==='signed')throw new Error('Лист подписан, правка невозможна');
 const patient=getPatient(db,patientId)!;
 // шапка листа принадлежит карточке: фамилия, номер и дата рождения не редактируются из листа
 const fixed:Inputs={...inputs,surname:patient.surname,historyNumber:patient.history_number,birthDate:patient.birth_date,sheetDate:date,sex:patient.sex};
 const tx=db.transaction(()=>{
  db.prepare("update sheets set inputs_json=?,ui_json=?,summary_json=?,author_id=coalesce(?,author_id),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') where id=?").run(JSON.stringify(fixed),JSON.stringify(ui),JSON.stringify(summarize(fixed)),userId,sheet.id);
  const w=weightFromSheet(fixed);if(w)upsertWeight(db,patientId,w.date,w.grams,userId);
 });tx();
 return getSheet(db,patientId,date)!;
}
export function signSheet(db:Db,patientId:number,date:string,userId:number){
 const sheet=getSheet(db,patientId,date);if(!sheet)throw new Error('Лист не найден');
 if(!sheet.summary.valid)throw new Error('Лист неполный: заполните шапку и исправьте ошибки расчёта');
 db.prepare("update sheets set status='signed',signed_by=?,signed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') where id=?").run(userId,sheet.id);
}
/** Снять подпись может только администратор или заведующий; версия растёт, история остаётся в журнале. */
export function unsignSheet(db:Db,patientId:number,date:string){
 const sheet=getSheet(db,patientId,date);if(!sheet)throw new Error('Лист не найден');
 db.prepare("update sheets set status='draft',signed_by=null,signed_at=null,version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') where id=?").run(sheet.id);
}
export function deleteDraft(db:Db,patientId:number,date:string){
 const sheet=getSheet(db,patientId,date);if(!sheet)return;if(sheet.status==='signed')throw new Error('Подписанный лист не удаляется');
 db.prepare('delete from sheets where id=?').run(sheet.id);
}
export function courses(db:Db,patientId:number,date:string):CourseInfo[]{
 const rows=db.prepare('select sheet_date,inputs_json from sheets where patient_id=? and sheet_date<=? order by sheet_date').all(patientId,date) as {sheet_date:string;inputs_json:string}[];
 const sheets=rows.map(r=>({date:r.sheet_date,medicines:(JSON.parse(r.inputs_json) as Inputs).medicines}));
 const last=sheets.length?sheets[sheets.length-1].date:date;
 return courseDays(sheets,last,id=>drugs.find(d=>d.id===id)?.name??id);
}
/** Сводка для карточки и списка: возраст на дату, последний лист, масса. */
export function patientGlance(db:Db,p:Patient,date:string){
 const life=daysBetween(p.birth_date,date);const weights=listWeights(db,p.id);const last=weights.length?weights[weights.length-1]:null;
 const sheet=db.prepare('select sheet_date,status,summary_json from sheets where patient_id=? order by sheet_date desc limit 1').get(p.id) as {sheet_date:string;status:string;summary_json:string}|undefined;
 const total=(p.gestation_weeks??0)*7+(p.gestation_days??0)+(life??0);
 return {day:life===null?null:life+1,pcv:p.gestation_weeks?{weeks:Math.floor(total/7),days:total%7}:null,lastWeight:last,lastSheet:sheet?{date:sheet.sheet_date,status:sheet.status,summary:JSON.parse(sheet.summary_json) as SheetSummary}:null};
}
