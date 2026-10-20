/** Reference ranges of daily fluid need, mL/kg/day, by birth-weight band and postnatal age.
 * Source: «Парентеральное питание новорождённых», клинические рекомендации РАСПМ под ред. Н.Н. Володина,
 * 2015, Таблица 1 «Ориентировочные потребности в жидкости у новорождённых». An orientation for the doctor,
 * not a prescription: the chosen value stays the doctor's entry in «Общая жидкость». */
export type FluidRange=readonly [number,number];
/** Weight bands exactly as the guideline prints them: 1500–2500 г is inclusive on both ends, > 2500 г starts above it. */
export const fluidNeedColumns=[
 {id:'lt750',label:'< 750 г',upTo:750,inclusive:false},
 {id:'750',label:'750–999 г',upTo:1000,inclusive:false},
 {id:'1000',label:'1000–1499 г',upTo:1500,inclusive:false},
 {id:'1500',label:'1500–2500 г',upTo:2500,inclusive:true},
 {id:'gt2500',label:'> 2500 г',upTo:Infinity,inclusive:true},
] as const;
/** Age columns of the guideline mapped to the day-of-life field: day 1 = first 24 h, day 2 = 24–48 h, day 3 = 48–72 h, day 4 and later = > 72 h. */
export const fluidNeedRows:readonly {label:string;days:string;from:number;to:number;ranges:readonly FluidRange[]}[]=[
 {label:'< 24 ч',days:'1-е сутки',from:1,to:2,ranges:[[90,110],[90,100],[80,100],[70,80],[60,70]]},
 {label:'24–48 ч',days:'2-е сутки',from:2,to:3,ranges:[[110,150],[110,120],[100,120],[80,110],[70,80]]},
 {label:'48–72 ч',days:'3-и сутки',from:3,to:4,ranges:[[120,150],[120,140],[120,130],[100,130],[90,100]]},
 {label:'> 72 ч',days:'4-е сутки и далее',from:4,to:Infinity,ranges:[[130,190],[140,190],[140,180],[110,160],[110,160]]},
];
/** What the guideline itself says about applying the table (разделы 1 и 10.1). */
export const fluidNeedRules:readonly string[]=[
 'В объём входит всё, что вводится ребёнку: парентеральное питание, энтеральное питание, растворители антибиотиков и других препаратов.',
 'Минимальное трофическое питание до 25 мл/кг/сут в общем объёме жидкости не учитывается.',
 'Суточная потеря массы не более 4 %, за первые 7 суток — не более 10 % у доношенного и 15 % у недоношенного.',
 'Натрий сыворотки держать в пределах 135–145 ммоль/л: рост — дефицит воды, снижение — чаще гипергидратация.',
];
/** Practical corrections from the POSTNEO cheatsheet; they are not part of the 2015 guideline table. */
export const fluidNeedCorrections:readonly [string,string][]=[
 ['Открытая реанимационная система, лучистое тепло','+ 10–30 мл/кг/сут'],
 ['Интенсивная фототерапия','+ 10–20 мл/кг/сут'],
 ['Кувез с влажностью > 80 %','− 10–20 мл/кг/сут'],
 ['ГИЭ на гипотермии, первые сутки','40–50 мл/кг/сут'],
 ['Значимый ОАП, сердечная недостаточность','ограничение до 120–130 мл/кг/сут'],
 ['Отёк мозга, СНАДГ','2/3 от расчётной потребности'],
];
export const fluidNeedSource='Клинические рекомендации РАСПМ «Парентеральное питание новорождённых» под ред. Н.Н. Володина, 2015, Таблица 1. Ориентир, а не назначение: объём корригируется по динамике массы, диурезу и натрию.';
export const fluidNeedSourceUrl='https://jew1ik.github.io/tpn/cheatsheets/pdf/fluids_tpn.pdf';

export type FluidNeed={column:number|null;row:number|null;range:FluidRange|null};
/** Weight in grams and day of life (1 = birthday). Anything unparseable yields nulls rather than a guessed band. */
export function fluidNeed(weightGrams:number|null,day:number|null):FluidNeed{
 const column=weightGrams!==null&&Number.isFinite(weightGrams)&&weightGrams>0?fluidNeedColumns.findIndex(c=>c.inclusive?weightGrams<=c.upTo:weightGrams<c.upTo):-1;
 const row=day!==null&&Number.isFinite(day)&&day>=1?fluidNeedRows.findIndex(r=>day>=r.from&&day<r.to):-1;
 return {column:column<0?null:column,row:row<0?null:row,range:column<0||row<0?null:fluidNeedRows[row].ranges[column]};
}
/** Where the entered value sits against the reference band. */
export function fluidNeedStatus(value:number|null,range:FluidRange|null):'below'|'within'|'above'|null{
 if(value===null||range===null||!Number.isFinite(value))return null;
 return value<range[0]?'below':value>range[1]?'above':'within';
}
