/** Разбор списка больных, скопированного из МИС (печать «Список больных»), в черновики карточек.
 *  Работает только в браузере: текст никуда не отправляется, на сервер уходят уже зашифрованные карточки. */

export type ImportRow={surname:string;sex:''|'male'|'female';diagnosis:string};

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

/** Нумерованные блоки «12.ФАМИЛИЯ …, в отделении … / Диагноз: … / Операция: …».
 *  Без нумерации каждая непустая строка считается фамилией. */
export function parsePatientList(text:string):ImportRow[]{
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
