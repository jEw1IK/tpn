import type {Db} from './db.ts';

/** Сервер хранит карточки, веса и листы шифротекстом и не умеет их читать. Здесь только то, что нужно
 *  для порядка: кто пациент по номеру, активен ли, какие даты листов есть, подписан ли лист.
 *  Старые открытые записи (enc = null) отдаются как есть, пока администратор их не зашифрует. */
export type PatientRow={id:number;status:'active'|'discharged';discharged_on:string|null;enc:string|null;created_at:string;updated_at:string;
 surname:string;history_number:string;birth_date:string;birth_time:string|null;sex:string;gestation_weeks:number|null;gestation_days:number|null;birth_weight:number|null;admitted_on:string;diagnosis:string};
export type WeightRow={date:string;enc:string|null;grams:number|null};
export type SheetRow={id:number;patient_id:number;sheet_date:string;status:'draft'|'signed';valid:number;version:number;author_id:number|null;signed_by:number|null;signed_at:string|null;created_at:string;updated_at:string;enc:string|null;inputs_json:string|null;ui_json:string|null};

const isoDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'));
const isEnc=(v:unknown):v is string=>typeof v==='string'&&/^v1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/.test(v)&&v.length<2_000_000;
const now="strftime('%Y-%m-%dT%H:%M:%fZ','now')";

const publicPatient=(row:Record<string,unknown>):PatientRow=>{
 const r=row as PatientRow;
 // открытые поля отдаём только у незашифрованных записей: у зашифрованных там заглушки
 return r.enc?{...r,surname:'',history_number:'',birth_date:'',birth_time:null,sex:'',gestation_weeks:null,gestation_days:null,birth_weight:null,admitted_on:'',diagnosis:''}:r;
};
export function getPatient(db:Db,id:number):PatientRow|null{const r=db.prepare('select * from patients where id=?').get(id);return r?publicPatient(r):null;}
export function listPatients(db:Db,status:'active'|'discharged'|'all'='active'):(PatientRow&{last_sheet_date:string|null;last_sheet_status:string|null;last_weight_date:string|null;last_weight_enc:string|null;last_weight_grams:number|null})[]{
 const sql=`select p.*,
  (select sheet_date from sheets s where s.patient_id=p.id order by sheet_date desc limit 1) as last_sheet_date,
  (select status from sheets s where s.patient_id=p.id order by sheet_date desc limit 1) as last_sheet_status,
  (select date from weights w where w.patient_id=p.id order by date desc limit 1) as last_weight_date,
  (select enc from weights w where w.patient_id=p.id order by date desc limit 1) as last_weight_enc,
  (select case when enc is null then grams end from weights w where w.patient_id=p.id order by date desc limit 1) as last_weight_grams
  from patients p ${status==='all'?'':'where p.status=?'} order by p.status,p.id desc`;
 const rows=(status==='all'?db.prepare(sql).all():db.prepare(sql).all(status)) as Record<string,unknown>[];
 return rows.map(r=>({...publicPatient(r),last_sheet_date:r.last_sheet_date as string|null,last_sheet_status:r.last_sheet_status as string|null,last_weight_date:r.last_weight_date as string|null,last_weight_enc:r.last_weight_enc as string|null,last_weight_grams:r.last_weight_grams as number|null}));
}
/** Новая карточка: только шифротекст. Заглушки в старых обязательных полях. */
export function createPatient(db:Db,enc:string,userId:number|null):PatientRow{
 if(!isEnc(enc))throw new Error('Карточка должна быть зашифрована');
 const info=db.prepare("insert into patients(surname,history_number,birth_date,sex,admitted_on,enc,created_by) values ('','','','','',?,?)").run(enc,userId);
 return getPatient(db,Number(info.lastInsertRowid))!;
}
export function updatePatient(db:Db,id:number,enc:string):PatientRow{
 if(!isEnc(enc))throw new Error('Карточка должна быть зашифрована');
 db.prepare(`update patients set enc=?,surname='',history_number='',birth_date='',birth_time=null,sex='',gestation_weeks=null,gestation_days=null,birth_weight=null,admitted_on='',diagnosis='',updated_at=${now} where id=?`).run(enc,id);
 return getPatient(db,id)!;
}
export function setPatientStatus(db:Db,id:number,status:'active'|'discharged',on:string|null){
 if(status==='discharged'&&on&&!isoDate(on))throw new Error('Неверная дата выписки');
 db.prepare(`update patients set status=?,discharged_on=?,updated_at=${now} where id=?`).run(status,status==='discharged'?on:null,id);
}

export function listWeights(db:Db,patientId:number):WeightRow[]{
 return (db.prepare('select date,enc,case when enc is null then grams end as grams from weights where patient_id=? order by date').all(patientId) as WeightRow[]);
}
export function upsertWeight(db:Db,patientId:number,date:string,enc:string,userId:number|null){
 if(!isoDate(date))throw new Error('Взвешивание: неверная дата');
 if(!isEnc(enc))throw new Error('Взвешивание должно быть зашифровано');
 db.prepare('insert into weights(patient_id,date,grams,enc,created_by) values (?,?,0,?,?) on conflict(patient_id,date) do update set enc=excluded.enc,grams=0,created_by=excluded.created_by').run(patientId,date,enc,userId);
}
export function deleteWeight(db:Db,patientId:number,date:string){db.prepare('delete from weights where patient_id=? and date=?').run(patientId,date);}

const publicSheet=(r:Record<string,unknown>):SheetRow=>{const s=r as SheetRow;return s.enc?{...s,inputs_json:null,ui_json:null}:s;};
export function listSheets(db:Db,patientId:number):SheetRow[]{return (db.prepare('select * from sheets where patient_id=? order by sheet_date desc').all(patientId) as Record<string,unknown>[]).map(publicSheet);}
export function getSheet(db:Db,patientId:number,date:string):SheetRow|null{const r=db.prepare('select * from sheets where patient_id=? and sheet_date=?').get(patientId,date);return r?publicSheet(r):null;}
/** Черновик на дату: создаётся или перезаписывается. Подписанный лист не трогается. */
export function putSheet(db:Db,patientId:number,date:string,enc:string,valid:boolean,userId:number|null):SheetRow{
 if(!isoDate(date))throw new Error('Неверная дата листа');
 if(!isEnc(enc))throw new Error('Лист должен быть зашифрован');
 const existing=getSheet(db,patientId,date);
 if(existing?.status==='signed')throw new Error('Лист подписан, правка невозможна');
 if(existing)db.prepare(`update sheets set enc=?,valid=?,inputs_json='{}',ui_json='{}',summary_json='{}',author_id=coalesce(?,author_id),updated_at=${now} where id=?`).run(enc,valid?1:0,userId,existing.id);
 else db.prepare("insert into sheets(patient_id,sheet_date,inputs_json,ui_json,summary_json,enc,valid,author_id) values (?,?,'{}','{}','{}',?,?,?)").run(patientId,date,enc,valid?1:0,userId);
 return getSheet(db,patientId,date)!;
}
export function signSheet(db:Db,patientId:number,date:string,userId:number){
 const sheet=getSheet(db,patientId,date);if(!sheet)throw new Error('Лист не найден');
 if(!sheet.valid)throw new Error('Лист неполный: заполните шапку и исправьте ошибки расчёта');
 db.prepare(`update sheets set status='signed',signed_by=?,signed_at=${now},updated_at=${now} where id=?`).run(userId,sheet.id);
}
/** Снять подпись может только администратор; версия растёт, история остаётся в журнале. */
export function unsignSheet(db:Db,patientId:number,date:string){
 const sheet=getSheet(db,patientId,date);if(!sheet)throw new Error('Лист не найден');
 db.prepare(`update sheets set status='draft',signed_by=null,signed_at=null,version=version+1,updated_at=${now} where id=?`).run(sheet.id);
}
export function deleteDraft(db:Db,patientId:number,date:string){
 const sheet=getSheet(db,patientId,date);if(!sheet)return;if(sheet.status==='signed')throw new Error('Подписанный лист не удаляется');
 db.prepare('delete from sheets where id=?').run(sheet.id);
}
/** Перешифровка старой открытой записи: клиент прочитал открытые поля, зашифровал и прислал. Применяется только к записям без enc. */
export function encryptLegacy(db:Db,kind:'patient'|'weight'|'sheet',id:number,enc:string,date?:string){
 if(!isEnc(enc))throw new Error('Нужен шифротекст');
 if(kind==='patient')return db.prepare(`update patients set enc=?,surname='',history_number='',birth_date='',birth_time=null,sex='',gestation_weeks=null,gestation_days=null,birth_weight=null,admitted_on='',diagnosis='',updated_at=${now} where id=? and enc is null`).run(enc,id).changes;
 if(kind==='weight')return db.prepare('update weights set enc=?,grams=0 where patient_id=? and date=? and enc is null').run(enc,id,date??'').changes;
 return db.prepare(`update sheets set enc=?,inputs_json='{}',ui_json='{}',summary_json='{}' where patient_id=? and sheet_date=? and enc is null`).run(enc,id,date??'').changes;
}
