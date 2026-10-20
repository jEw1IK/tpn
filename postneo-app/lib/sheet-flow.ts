/** Как лист на новый день вырастает из карточки пациента и вчерашнего листа. Чистая логика без базы, чтобы её можно было проверить тестами. */
import {blank,numeric,type Inputs,type Medicine} from './tpn.ts';

export type PatientCore={surname:string;historyNumber:string;birthDate:string;sex:string;gestationWeeks:number|null;gestationDays:number|null;birthWeight:number|null;admittedOn:string};
export type WeightPoint={date:string;grams:number};

const dayMs=86400000;
export function calendarDay(value:string):number|null{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const t=Date.parse(value+'T00:00:00Z');return Number.isFinite(t)?Math.round(t/dayMs):null;
}
/** Сколько календарных суток от from до to; сутки жизни = разница + 1. */
export function daysBetween(from:string,to:string):number|null{
 const a=calendarDay(from),b=calendarDay(to);return a===null||b===null?null:b-a;
}
export function shiftDate(date:string,days:number):string{
 const d=calendarDay(date);if(d===null)return date;return new Date((d+days)*dayMs).toISOString().slice(0,10);
}
export const todayIso=(now=new Date())=>new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);

/** Пустой лист отделения: кормления по часам, растворители сверх объёма, глюкоза 5 % и 40 %, жиры за 20 ч. */
export const freshSheet=():Inputs=>({...blank(),enteralMode:'feeds8',drugFluid:'extra',lowGlucose:'5',highGlucose:'40',fatHours:'20',start:'08:00'});

/** Вес на дату из взвешиваний; если на этот день нет, берём последний раньше. */
export function weightOn(weights:readonly WeightPoint[],date:string,exact=false):number|null{
 const hit=weights.find(w=>w.date===date);if(hit)return hit.grams;
 if(exact)return null;
 const before=weights.filter(w=>w.date<date).sort((a,b)=>b.date<a.date?-1:1);
 return before.length?before[0].grams:null;
}

/** Лист на дату: всё переносится с предыдущего листа, шапка и веса берутся из карточки, сутки и ПКВ считаются от даты рождения. */
export function nextSheetInputs({patient,date,previous,weights}:{patient:PatientCore;date:string;previous:Inputs|null;weights:readonly WeightPoint[]}):Inputs{
 const base:Inputs=previous?{...previous,medicines:previous.medicines.map(m=>({...m}))}:freshSheet();
 const life=daysBetween(patient.birthDate,date);const hospital=daysBetween(patient.admittedOn,date);
 const today=weightOn(weights,date,true);const yesterday=weightOn(weights,shiftDate(date,-1));
 const toStr=(n:number|null)=>n===null?'':String(n);
 return {...base,
  surname:patient.surname,historyNumber:patient.historyNumber,birthDate:patient.birthDate,sheetDate:date,sex:patient.sex,
  gestation:toStr(patient.gestationWeeks),gestationDays:toStr(patient.gestationDays??0),pcvMode:'auto',
  day:life===null?'':String(Math.max(1,life+1)),hospitalDay:hospital===null?'':String(Math.max(1,hospital+1)),
  birthWeight:toStr(patient.birthWeight),weightYesterday:toStr(yesterday),weightToday:toStr(today),
  weight:today!==null?String(today):(previous?.weight||toStr(yesterday)),
 };
}

export type CourseInfo={drug:string;name:string;since:string;day:number};
/** День курса по листам: сколько дней подряд до этой даты препарат стоит в листах. Пропуск дня обрывает курс. */
export function courseDays(sheets:readonly {date:string;medicines:readonly Medicine[]}[],date:string,names:(drug:string)=>string):CourseInfo[]{
 const byDate=new Map(sheets.map(s=>[s.date,s]));const current=byDate.get(date);if(!current)return [];
 return current.medicines.map(m=>{
  let since=date;let cursor=shiftDate(date,-1);
  while(byDate.get(cursor)?.medicines.some(x=>x.drug===m.drug)){since=cursor;cursor=shiftDate(cursor,-1);}
  return {drug:m.drug,name:names(m.drug),since,day:(daysBetween(since,date)??0)+1};
 });
}

/** Что записать во взвешивания из листа: вес сегодня на дату листа. */
export function weightFromSheet(p:Inputs):WeightPoint|null{
 const grams=numeric(p.weightToday);if(grams===null||grams<=0||!p.sheetDate)return null;
 return {date:p.sheetDate,grams};
}
