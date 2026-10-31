/** Разбор списка больных, скопированного из МИС (печать «Список больных»), в черновики карточек.
 *  Работает только в браузере: текст никуда не отправляется, на сервер уходят уже зашифрованные карточки. */

export type ImportRow={surname:string;sex:''|'male'|'female';diagnosis:string;historyNumber?:string;birthDate?:string;birthFromAge?:boolean;admittedOn?:string;birthWeight?:string};

const cap=(w:string)=>w.toLowerCase().replace(/(^|[-(])([а-яёa-z])/g,(_,p:string,c:string)=>p+c.toUpperCase());
const TWIN:Record<string,{sex:'male'|'female'}>={'ПЕРВЫЙ':{sex:'male'},'ВТОРОЙ':{sex:'male'},'ТРЕТИЙ':{sex:'male'},'ПЕРВАЯ':{sex:'female'},'ВТОРАЯ':{sex:'female'},'ТРЕТЬЯ':{sex:'female'}};

/** Имя остаётся как в МИС, только без капса: «ЛИБЕС НЕИЗВЕСТНО ВТОРАЯ» → «Либес Неизвестно Вторая».
 *  Пол по отчеству или по слову «первый/первая» у двоен. */
export function parseName(raw:string):{surname:string;sex:''|'male'|'female'}{
 const words=raw.replace(/\s+/g,' ').trim().split(' ').filter(Boolean);
 let sex:''|'male'|'female'='';
 for(const w of words){const t=TWIN[w.toUpperCase()];if(t)sex=t.sex;}
 const named=words.filter(w=>!TWIN[w.toUpperCase()]&&!/^НЕИЗВЕСТН/i.test(w));
 const last=named.length>=3?named[named.length-1].toUpperCase():'';
 if(/(ВИЧ|ИЧ|ОГЛЫ|УУЛУ)$/.test(last))sex='male';else if(/(ВНА|ЧНА|КЫЗЫ)$/.test(last))sex='female';
 return {surname:words.map(cap).join(' '),sex};
}

const flat=(s:string)=>s.replace(/\s+/g,' ').trim();

const ruDate=(v:string)=>{const m=v.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);return m?m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0'):'';};

/** Дата рождения из «1 мес. 15 дн.» на сегодня. МИС считает возраст вперёд от рождения: месяцы, потом дни,
 *  поэтому назад идём в обратном порядке — сначала дни, потом месяцы и годы (31.10, «1 мес. 15 дн.» → 16.09). */
export function birthFromAge(age:string,today:string):string{
 if(!/\d/.test(age))return '';
 const n=(re:RegExp)=>Number(age.match(re)?.[1]??0);
 const y=n(/(\d+)\s*(?:г|л)/i),mo=n(/(\d+)\s*мес/i),d=n(/(\d+)\s*дн/i);
 const t=new Date(today+'T00:00:00Z');t.setUTCDate(t.getUTCDate()-d);
 const day=t.getUTCDate();const first=new Date(Date.UTC(t.getUTCFullYear()-y,t.getUTCMonth()-mo,1));
 const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();first.setUTCDate(Math.min(day,last));
 return first.toISOString().slice(0,10);
}
const SEX=(v:string):''|'male'|'female'=>/^\s*(м|муж|мальч)/i.test(v)?'male':/^\s*(ж|жен|дев)/i.test(v)?'female':'';

/** Таблица из МИС, скопированная из Excel (табуляция) или сохранённая как CSV (точка с запятой).
 *  Колонки ищутся по заголовку: ФИО, Пол, ИБ №, Дата рождения или Возраст, Дата госпитализации, Диагноз. */
function parseTable(src:string,today:string):ImportRow[]|null{
 const lines=src.split('\n').filter(l=>l.trim());const h=lines.findIndex(l=>/(^|[\t;"])\s*ФИО/i.test(l)&&/[\t;]/.test(l));
 if(h<0)return null;
 const sep=lines[h].includes('\t')?'\t':';';const cells=(l:string)=>l.split(sep).map(c=>c.replace(/^"|"$/g,'').replace(/""/g,'"').trim());
 const head=cells(lines[h]);const col=(re:RegExp)=>head.findIndex(c=>re.test(c));
 const c={fio:col(/ФИО/i),sex:col(/^пол/i),hist:col(/(^|\s)ИБ|истори/i),birth:col(/рожд/i),age:col(/возраст/i),adm:col(/госпитал|поступ/i),dx:col(/диагноз/i),wt:col(/(вес|масса).*рожд/i)};
 const rows:ImportRow[]=[];
 for(const l of lines.slice(h+1)){const v=cells(l);const get=(i:number)=>i>=0?v[i]??'':'';
  const fio=flat(get(c.fio));if(!fio)continue;
  const named=parseName(fio);const exact=ruDate(get(c.birth));const adm=ruDate(get(c.adm));const byAge=!exact&&c.age>=0?birthFromAge(get(c.age),today):'';
  // В отделение поступают при рождении: дата госпитализации и есть дата рождения, если возраст из МИС этому не противоречит.
  const sameDay=!!adm&&(!byAge||Math.abs(Date.parse(adm)-Date.parse(byAge))<=2*864e5);
  const birthDate=exact||(sameDay?adm:byAge);
  const wt=get(c.wt).replace(',','.').replace(/[^\d.]/g,'');
  rows.push({surname:named.surname,sex:SEX(get(c.sex))||named.sex,diagnosis:flat(get(c.dx)),historyNumber:get(c.hist),birthDate,birthFromAge:!exact&&!sameDay&&!!byAge,admittedOn:adm,birthWeight:wt&&Number(wt)>0?String(Math.round(Number(wt))):''});}
 return rows;
}

/** Нумерованные блоки «12.ФАМИЛИЯ …, в отделении … / Диагноз: … / Операция: …».
 *  Без нумерации каждая непустая строка считается фамилией. */
export function parsePatientList(text:string,today=new Date().toISOString().slice(0,10)):ImportRow[]{
 const table=parseTable(text.replace(/\r/g,''),today);if(table)return table;
 const src=text.replace(/\r/g,'').replace(/^\s*Врач[^\n]*$/gim,'');
 const starts=[...src.matchAll(/(?:^|\n)\s*\d{1,3}\.\s*(?=[А-ЯЁA-Z])/g)];
 if(!starts.length)return src.split('\n').map(flat).filter(l=>l&&!/^(список|состоит)/i.test(l)).map(l=>({...parseName(l),diagnosis:''}));
 const rows:ImportRow[]=[];
 starts.forEach((m,i)=>{
  const body=src.slice(m.index!+m[0].length,i+1<starts.length?starts[i+1].index:src.length);
  const dx=body.search(/Диагноз\s*:/i);const head=flat(dx<0?body.split('\n')[0]:body.slice(0,dx));
  const name=head.replace(/,?\s*в отделении.*$/i,'').replace(/(\s-?\d+\s*(мес|дн|г|л)\.?)+\s*,?\s*$/i,'').replace(/[\s,]+$/,'');
  if(!name)return;
  let diagnosis='';
  if(dx>=0){const rest=body.slice(dx).replace(/^Диагноз\s*:\s*/i,'');const parts=rest.split(/Операция\s*:\s*/i).map(flat).filter(Boolean);
   const ops=/^Операция/i.test(flat(rest))?parts:parts.slice(1);const main=/^Операция/i.test(flat(rest))?'':parts[0]??'';
   diagnosis=[main,...ops.map(o=>'Операция: '+o)].filter(Boolean).join('\n');}
  rows.push({...parseName(name),diagnosis});
 });
 return rows;
}

/** Для сравнения с теми, кто уже заведён: регистр, ё и лишние пробелы не важны. */
export const nameKey=(s:string)=>s.toLowerCase().replace(/ё/g,'е').replace(/[^а-яa-z0-9]+/g,' ').trim();
