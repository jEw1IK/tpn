import type {Inputs,Issue} from './tpn';

const dayMs=86400000;
function calendarDay(value:string):number|null {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.startsWith('0000'))return null;
 const timestamp=Date.parse(value+'T00:00:00.000Z');
 if(!Number.isFinite(timestamp)||new Date(timestamp).toISOString().slice(0,10)!==value)return null;
 return timestamp/dayMs;
}
export function formatDate(value:string):string {
 if(calendarDay(value)===null)return '—';
 const [year,month,day]=value.split('-');return day+'.'+month+'.'+year;
}
export function nextDate(value:string):string {
 const day=calendarDay(value);if(day===null)return '—';
 return formatDate(new Date((day+1)*dayMs).toISOString().slice(0,10));
}
export const sexNames:Record<string,string>={male:'Мужской',female:'Женский',undetermined:'Не определён'};

export function patientHeader(p:Inputs){
 const issues:Issue[]=[];
 const error=(field:string,message:string)=>issues.push({field,message});
 if(!p.surname?.trim())error('surname','Укажите фамилию для печатного листа');
 if(!p.historyNumber?.trim())error('historyNumber','Укажите номер истории');
 const birth=calendarDay(p.birthDate??''),sheet=calendarDay(p.sheetDate??'');
 if(birth===null)error('birthDate','Укажите существующую дату рождения');
 if(sheet===null)error('sheetDate','Укажите дату листа');
 if(birth!==null&&sheet!==null&&birth>sheet)error('birthDate','Дата рождения позже даты листа');
 if(!Object.hasOwn(sexNames,p.sex))error('sex','Укажите пол');
 const integer=(field:keyof Inputs,label:string,min:number,max=Number.MAX_SAFE_INTEGER)=>{
  const raw=String(p[field]??'').trim();
  const value=/^\d+(?:[.,]0+)?$/.test(raw)?Number(raw.replace(',','.')):null;
  if(value===null||!Number.isSafeInteger(value)||value<min||value>max){error(field,label);return null;}
  return value;
 };
 const day=integer('day','Укажите сутки жизни (целое число)',1);
 integer('hospitalDay','Койко-день: целое число от 1',1);
 const birthWeeks=integer('gestation','Гестация: целые недели от 20 до 44',20,44);
 const birthDays=integer('gestationDays','Дни гестации: целое число от 0 до 6',0,6);
 let weeks:number|null=null,days:number|null=null;
 if(p.pcvMode==='auto'){
  if(birthWeeks!==null&&birthDays!==null&&day!==null){
   const total=birthWeeks*7+birthDays+day-1;
   if(Number.isSafeInteger(total)){weeks=Math.floor(total/7);days=total%7;}
   else error('day','Возраст превышает числовой диапазон');
  }
 }else if(p.pcvMode==='manual'){
  weeks=integer('pcvWeeks','ПКВ: укажите целые недели',0);
  days=integer('pcvDays','ПКВ: дни от 0 до 6',0,6);
 }else error('pcvMode','Выберите способ задания ПКВ');
 return {valid:issues.length===0,issues,pcv:weeks!==null&&days!==null?{weeks,days}:null};
}
export type PatientHeader=ReturnType<typeof patientHeader>;
