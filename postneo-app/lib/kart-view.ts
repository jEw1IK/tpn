/** Представление карточки пациента в браузере: всё, что раньше считал сервер по открытым полям,
 *  теперь считается здесь по расшифрованным данным. Чистые функции, проверяются тестами. */
import {drugs,type Inputs} from './tpn.ts';
import {courseDays,daysBetween,type CourseInfo,type PatientCore,type WeightPoint} from './sheet-flow.ts';

/** Карточка пациента: то, что лежит в шифрованном поле enc. */
export type PatientData={surname:string;historyNumber:string;birthDate:string;birthTime:string;sex:string;gestationWeeks:number|null;gestationDays:number|null;birthWeight:number|null;admittedOn:string;diagnosis:string};
/** Строка пациента с сервера: открытые поля и шифротекст карточки. */
export type PatientRowWire={id:number;status:'active'|'discharged';discharged_on:string|null;enc:string|null;created_at:string;updated_at:string;
 /* открытые поля старых записей, пока их не зашифровали */ surname?:string;history_number?:string;birth_date?:string;birth_time?:string|null;sex?:string;gestation_weeks?:number|null;gestation_days?:number|null;birth_weight?:number|null;admitted_on?:string;diagnosis?:string;
 last_sheet_date?:string|null;last_sheet_status?:string|null;last_weight_date?:string|null;last_weight_enc?:string|null;last_weight_grams?:number|null};
export type WeightWire={date:string;enc:string|null;grams?:number|null};
export type SheetWire={id:number;sheet_date:string;status:'draft'|'signed';valid:number;version:number;author_id:number|null;signed_by:number|null;signed_at:string|null;created_at:string;updated_at:string;enc:string|null;inputs_json?:string|null;ui_json?:string|null};
/** Содержимое листа внутри enc. */
export type SheetData={inputs:Inputs;ui:Record<string,string>};
export type Patient=PatientData&{id:number;status:'active'|'discharged';dischargedOn:string|null;createdAt:string;updatedAt:string;encrypted:boolean};

const isoDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'));
/** Проверка карточки перед сохранением. Та же, что раньше была на сервере: сервер шифротекст проверить не может. */
export function validatePatient(input:PatientData):string[]{
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
export const cleanPatient=(p:PatientData):PatientData=>({surname:p.surname.trim(),historyNumber:p.historyNumber.trim(),birthDate:p.birthDate,birthTime:p.birthTime||'',sex:p.sex,gestationWeeks:p.gestationWeeks,gestationDays:p.gestationDays??0,birthWeight:p.birthWeight,admittedOn:p.admittedOn,diagnosis:(p.diagnosis??'').trim()});

/** Старая открытая запись, пока администратор её не зашифровал. */
export function plainPatientData(row:PatientRowWire):PatientData{
 return {surname:row.surname??'',historyNumber:row.history_number??'',birthDate:row.birth_date??'',birthTime:row.birth_time??'',sex:row.sex??'',gestationWeeks:row.gestation_weeks??null,gestationDays:row.gestation_days??null,birthWeight:row.birth_weight??null,admittedOn:row.admitted_on??'',diagnosis:row.diagnosis??''};
}
export function assemblePatient(row:PatientRowWire,data:PatientData):Patient{
 return {...data,id:row.id,status:row.status,dischargedOn:row.discharged_on,createdAt:row.created_at,updatedAt:row.updated_at,encrypted:!!row.enc};
}
export const patientCore=(p:PatientData):PatientCore=>({surname:p.surname,historyNumber:p.historyNumber,birthDate:p.birthDate,sex:p.sex,gestationWeeks:p.gestationWeeks,gestationDays:p.gestationDays,birthWeight:p.birthWeight,admittedOn:p.admittedOn});

export type Glance={day:number|null;pcv:{weeks:number;days:number}|null;lastWeight:WeightPoint|null;bedDay:number|null};
/** Возраст на дату, ПКВ, последняя масса, койко-день. */
export function glance(p:PatientData,weights:readonly WeightPoint[],date:string):Glance{
 const life=daysBetween(p.birthDate,date);
 const sorted=[...weights].sort((a,b)=>a.date.localeCompare(b.date));const last=sorted.length?sorted[sorted.length-1]:null;
 const total=(p.gestationWeeks??0)*7+(p.gestationDays??0)+(life??0);
 const bed=daysBetween(p.admittedOn,date);
 return {day:life===null?null:life+1,pcv:p.gestationWeeks?{weeks:Math.floor(total/7),days:total%7}:null,lastWeight:last,bedDay:bed===null?null:Math.max(1,bed+1)};
}
/** Курсы препаратов по расшифрованным листам до даты включительно. */
export function coursesFromSheets(sheets:readonly {date:string;inputs:Inputs}[],date:string):CourseInfo[]{
 const upTo=sheets.filter(s=>s.date<=date).sort((a,b)=>a.date.localeCompare(b.date)).map(s=>({date:s.date,medicines:s.inputs.medicines}));
 const last=upTo.length?upTo[upTo.length-1].date:date;
 return courseDays(upTo,last,id=>drugs.find(d=>d.id===id)?.name??id);
}
/** Последний лист до даты: от него переносится следующий. */
export function previousSheet<T extends {date:string}>(sheets:readonly T[],date:string):T|null{
 const before=sheets.filter(s=>s.date<date).sort((a,b)=>b.date.localeCompare(a.date));return before[0]??null;
}
