/** Методичка: справочные таблицы и маленькие калькуляторы у постели. Данные совпадают с ботом POSTNEO
 * (cheatsheets/data/bilirubin.json) и шпаргалками; строка ≥ 35 нед сверена с КР «Неонатальная желтуха» 2025, приложение А3.3. */

/** Пороги общего билирубина, мкмоль/л: строки по ГВ (скорригированному), колонки по возрасту в часах. Таблица ступенчатая. */
export const biliHourLabels=['< 24 ч','24–48 ч','48–72 ч','72–96 ч','96–120 ч','> 120 ч'] as const;
export type BiliBand={max:number|null;label:string;ft:readonly number[];ift:readonly number[];ozpk:readonly number[]};
export const biliBands:readonly BiliBand[]=[
 {max:26,label:'22–25 нед',ft:[86,86,86,103,120,137],ift:[103,137,137,154,171,171],ozpk:[137,171,205,222,222,222]},
 {max:28,label:'26–27 нед',ft:[86,86,103,137,154,171],ift:[103,154,171,188,205,205],ozpk:[137,171,205,239,257,257]},
 {max:30,label:'28–29 нед',ft:[103,120,137,171,188,205],ift:[120,171,205,222,239,239],ozpk:[154,205,239,274,308,308]},
 {max:32,label:'30–31 нед',ft:[120,137,171,205,222,239],ift:[137,205,239,257,274,274],ozpk:[171,239,274,308,342,342]},
 {max:35,label:'32–34 нед',ft:[137,171,205,239,257,274],ift:[154,239,274,308,325,325],ozpk:[171,274,308,342,376,376]},
 {max:null,label:'≥ 35 нед',ft:[171,205,239,274,291,308],ift:[188,274,308,342,376,376],ozpk:[205,308,342,376,428,428]},
];
/** Интенсивная ФТ показана и тогда, когда до порога ОЗПК осталось меньше этого (КР «Неонатальная желтуха», раздел 3.1). */
export const nearExchangeMargin=50;
export const biliRise=[
 {max:5.1,tone:'ok',title:'Обычный темп при физиологической желтухе',action:'стандартный контроль'},
 {max:6.8,tone:'info',title:'Гемолиз идёт',action:'фототерапия, контроль каждые 6 ч'},
 {max:8.5,tone:'warn',title:'Угрожающий темп',action:'интенсивная ФТ + ВВИГ, заказать кровь, готовить ОЗПК'},
 {max:null,tone:'danger',title:'Обгонит порог ОЗПК',action:'ОЗПК, не дожидаясь табличного порога'},
] as const;

export const biliBandIndex=(ga:number|null)=>ga===null||!Number.isFinite(ga)?-1:biliBands.findIndex(b=>b.max===null||ga<b.max);
/** Сутки жизни → колонка часов, как в таблице жидкости: 1-е сутки — до 24 ч, 2-е — 24–48 ч … с 6-х — больше 120 ч. */
export const biliHourIndex=(day:number|null)=>day===null||!Number.isFinite(day)||day<1?-1:Math.min(5,Math.floor(day)-1);

export type BiliVerdict={level:'none'|'ft'|'ift'|'ozpk';tone:'ok'|'warn'|'danger';title:string;what:string;control:string;ft:number;ift:number;ozpk:number;band:BiliBand;hourLabel:string;
 rise:{rate:number;title:string;action:string;tone:string}|null};
/** Вердикт по ступенчатой таблице КР. ga — ГВ или скорригированный возраст в неделях, day — сутки жизни, value — общий билирубин. */
export function biliVerdict(ga:number|null,day:number|null,value:number|null,previous:number|null=null,hoursBetween:number|null=null):BiliVerdict|null{
 const gi=biliBandIndex(ga),hi=biliHourIndex(day);
 if(gi<0||hi<0||value===null||!Number.isFinite(value))return null;
 const band=biliBands[gi];const ft=band.ft[hi],ift=band.ift[hi],ozpk=band.ozpk[hi];
 const near=ozpk-value<nearExchangeMargin;
 let level:BiliVerdict['level']='none',tone:BiliVerdict['tone']='ok',title='Ниже порога фототерапии',what=`до ФТ ${round(ft-value)} мкмоль/л`,control='если идёт ФТ, её можно прекратить; контроль через 12 ч после окончания';
 if(value>=ozpk){level='ozpk';tone='danger';title='Порог ОЗПК достигнут';what=`ОЗПК ${ozpk}; интенсивная ФТ, пока готовится кровь; ГВ < 32 нед — решение консилиума`;control='';}
 else if(value>=ift||near){level='ift';tone='warn';title=value>=ift?'Интенсивная фототерапия':`Интенсивная ФТ: до ОЗПК меньше ${nearExchangeMargin}`;what=`до ОЗПК ${round(ozpk-value)} мкмоль/л`;control='контроль не реже 1 раза в 12 ч';}
 else if(value>=ft){level='ft';tone='warn';title='Стандартная фототерапия';what=`до интенсивной ${round(ift-value)}, до ОЗПК ${round(ozpk-value)} мкмоль/л`;control='контроль не позднее 24 ч от начала ФТ';}
 let rise:BiliVerdict['rise']=null;
 if(previous!==null&&hoursBetween!==null&&hoursBetween>0&&Number.isFinite(previous)){
  const rate=(value-previous)/hoursBetween;const bandRise=biliRise.find(x=>x.max===null||rate<x.max)!;
  rise={rate,title:bandRise.title,action:bandRise.action,tone:bandRise.tone};
 }
 return {level,tone,title,what,control,ft,ift,ozpk,band,hourLabel:biliHourLabels[hi],rise};
}

/** Пороги трансфузии — таблица 3 КР «Ранняя анемия недоношенных»: Hb г/л [с респираторной поддержкой, без], Ht % только для капиллярной пробы. */
export type AnemiaRow={days:string;from:number;to:number;cap:readonly [number,number];capHt:readonly [number,number];ven:readonly [number,number]};
export const anemiaRows:readonly AnemiaRow[]=[
 {days:'2–7',from:2,to:7,cap:[115,100],capHt:[35,30],ven:[104,90]},
 {days:'8–14',from:8,to:14,cap:[100,85],capHt:[30,25],ven:[90,77]},
 {days:'≥ 15',from:15,to:Infinity,cap:[85,75],capHt:[25,23],ven:[77,68]},
];
export const anemiaRow=(day:number|null)=>day===null||!Number.isFinite(day)?null:anemiaRows.find(r=>day>=r.from&&day<=r.to)??null;
export type AnemiaVerdict={row:AnemiaRow;hb:number;ht:number|null;hit:boolean|null};
/** sample — капиллярная или венозная проба; support — любая респираторная поддержка, даже кислород через маску. */
export function anemiaVerdict(day:number|null,hb:number|null,ht:number|null,sample:'cap'|'ven',support:boolean):AnemiaVerdict|null{
 const row=anemiaRow(day);if(!row)return null;
 const i=support?0:1;const thr=sample==='cap'?row.cap[i]:row.ven[i];const thrHt=sample==='cap'?row.capHt[i]:null;
 const known=(hb!==null&&Number.isFinite(hb))||(ht!==null&&thrHt!==null&&Number.isFinite(ht));
 const hit=known?((hb!==null&&Number.isFinite(hb)&&hb<=thr)||(ht!==null&&thrHt!==null&&Number.isFinite(ht)&&ht<=thrHt)):null;
 return {row,hb:thr,ht:thrHt,hit};
}
/** Объём эритроцитной взвеси по КР: (Ht цель − Ht больного) ÷ Ht взвеси × ОЦК, всё в долях или процентах одинаково. */
export function transfusionPerKg(htPatient:number,htTarget:number,htProduct:number,bccMlPerKg:number):number|null{
 if(![htPatient,htTarget,htProduct,bccMlPerKg].every(Number.isFinite)||htProduct<=0||bccMlPerKg<=0)return null;
 return Math.max(0,(htTarget-htPatient)/htProduct*bccMlPerKg);
}
export const transfusionDefaults={htTarget:'35',htProduct:'60',bcc:'100',standardMlPerKg:15,range:[10,20] as const,hours:4};

/** Нутриенты и электролиты по КР РАСПМ 2015 (сверено с ESPGHAN 2018) — для вкладки «Нормы ПП». */
export const nutrientTargets=[
 ['Аминокислоты, г/кг/сут','1,5–2,5','+0,5–1,0','3,5–4,0','2,5–3,0'],
 ['Жировая эмульсия, г/кг/сут','1,0–2,0','+0,5–1,0','3,0–4,0','3,0'],
 ['Глюкоза, GIR мг/кг/мин','4–6','+1–2','8–12','6–10'],
 ['Энергия, ккал/кг/сут','40–50','+10–20','90–110','85–100'],
] as const;
export const electrolyteTargets=[
 ['Натрий','0','2–3 ммоль (ЭНМТ до 4–5)','раннее введение задерживает убыль массы'],
 ['Калий','0','1–3 ммоль','только после диуреза и при K < 5,0'],
 ['Кальций','0,8–1,5 ммоль','1,5–2,0 ммоль','профилактика ранней гипокальциемии'],
 ['Фосфор','1,0 ммоль','1,5–2,0 ммоль','Ca : P ≈ 1,3 : 1 по массе'],
 ['Магний','0,15–0,2 ммоль','0,2–0,4 ммоль','учесть магний, полученный матерью'],
] as const;
export const lipidControl=[
 ['Снижать жиры','триглицериды > 2,8 ммоль/л'],
 ['Остановить жиры','триглицериды > 3,4 ммоль/л'],
 ['Сепсис, гипербилирубинемия','не отменять, снизить до 1–2 г/кг/сут'],
 ['Максимум глюкозы','GIR 12 мг/кг/мин'],
] as const;

const round=(v:number)=>Math.round(v);
