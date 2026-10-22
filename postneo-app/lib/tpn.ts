import {bolusUnits,doseUnits,drugs as directoryDrugs,isIntravenousRoute,routeMinutes,type Drug,type DrugKind,type Group} from './directory.ts';
export type {Group,Drug} from './directory.ts';
export type Medicine = {
 id:string; drug:string; group:Group; mode:'intermittent'|'continuous'; dose:string; unit:string;
 interval:string; first:string; minutes:string; volume:string; diluent:string; route:string;
 /** Administration time in hours as the doctor enters it (0.5 = 30 min). Takes precedence over the legacy `minutes`. */
 infusionHours:string; loadingHours:string;
 hours:string; pump:string; amount:string; stock:string; method:'rate'|'amount';
 loading:boolean; loadingDose:string; loadingVolume:string; loadingFirst:string; loadingMinutes:string; loadingSource:string;
};
/** Additional enteral mixture: eight feedings at three-hour intervals, as on the mytpn sheet. */
export type EnteralRow={id:string;formulaId:string;feeds:string[];route:string};
export type Inputs = {weight:string; day:string; gestation:string; fluid:string; enteral:string;
 surname:string; historyNumber:string; birthDate:string; sheetDate:string; sex:string; hospitalDay:string;
 gestationDays:string; pcvMode:'auto'|'manual'; pcvWeeks:string; pcvDays:string;
 /** Weight today drives drug doses and «получит мл/кг»; `weight` (вес для счёта) drives nutrition. Empty = same as weight. */
 weightToday:string; weightYesterday:string; birthWeight:string;
 /** КР 2015: enteral volume below 25 ml/kg/day is trophic — on top of the need, nutrients not counted. */
 trophicRule:'kr'|'always';
 /** КР 2015: drug diluents are part of the daily volume; mytpn without the manual field keeps them on top. */
 drugFluid:'included'|'extra';
 enteralMode:'perKg'|'daily'|'feeds'|'feeds8'; formulaId:string; enteralVolume:string; feedingMl:string; feedingCount:string;
 feeds:string[]; feedingRoute:string; extraFeeds:EnteralRow[];
 other:string; flush:string;
 aa:string; aaPercent:string; aaHours:string; aaPause:'on'|'off'; fat:string; fatPercent:string; fatHours:string; gir:string; baseHours:string;
 /** Calcium gluconate 10 % in ml/kg/day, the way КР 2015 (таблица 3) and the sheet state it; calciumContent converts to mmol. */
 calciumMlPerKg:string; calciumContent:string;
 kcl:string; kclMmolPerMl:string; nacl10:string; nacl10MmolPerMl:string; nacl09:string; nacl09MmolPerMl:string; magnesium:string;
 soluvit:string; vitalipid:string; addamel:string; dipeptiven:string; heparin:string; insulin:string; carrier:string; carrierMl:string;
 lowSolution:'glucose'|'water'|'nacl'; lowGlucose:string; highGlucose:string; start:string; medicines:Medicine[]};
export type Issue = {field:string;message:string;medicineId?:string};
export const drugs:readonly Drug[]=directoryDrugs;
export function newMedicine(drug:string,id:string):Medicine {
 const d=drugs.find(x=>x.id===drug);
 if(!d)throw new RangeError('Неизвестный препарат: '+drug);
 const continuous=d.kind==='continuous';
 const stock=d.percent!==undefined?String(d.percent*10):'';
 return {id,drug,group:d.group,mode:continuous?'continuous':'intermittent',dose:'',unit:d.unit,
 interval:d.kind==='blood'?'24':'',first:'00:00',minutes:'',infusionHours:'',loadingHours:'',volume:continuous?'12':'',diluent:'NaCl 0,9%',route:'в/в',hours:'24',pump:continuous?'0.5':'',amount:'',stock,method:'rate',
 loading:false,loadingDose:'',loadingVolume:'',loadingFirst:'00:00',loadingMinutes:'',loadingSource:''};
}
export const emptyFeeds=()=>Array<string>(8).fill('');
export function newEnteralRow(id:string):EnteralRow{return {id,formulaId:'none',feeds:emptyFeeds(),route:''};}
export function example():Inputs {
 const a=newMedicine('ampsul','example-amp');Object.assign(a,{dose:'37.5',interval:'12',infusionHours:'0.5',volume:'2',first:'08:00'});
 const n=newMedicine('netil','example-net');Object.assign(n,{dose:'3',interval:'12',infusionHours:'0.5',volume:'2',first:'09:00'});
 return {surname:'Тестовый',historyNumber:'УЧ-001',birthDate:'2026-10-04',sheetDate:'2026-10-06',sex:'male',hospitalDay:'3',gestationDays:'0',pcvMode:'auto',pcvWeeks:'',pcvDays:'',weight:'1300',day:'3',gestation:'30',fluid:'120',
 weightToday:'',weightYesterday:'',birthWeight:'',trophicRule:'kr',drugFluid:'included',
 enteral:'0',enteralMode:'perKg',formulaId:'none',enteralVolume:'0',feedingMl:'0',feedingCount:'8',feeds:emptyFeeds(),feedingRoute:'',extraFeeds:[],other:'0',flush:'0',
 aa:'3.5',aaPercent:'10',aaHours:'24',aaPause:'off',fat:'1.5',fatPercent:'20',fatHours:'24',gir:'7',baseHours:'24',calciumMlPerKg:'2',calciumContent:'0.225',
 kcl:'0',kclMmolPerMl:'0.56',nacl10:'0',nacl10MmolPerMl:'1.7',nacl09:'0',nacl09MmolPerMl:'0.15',magnesium:'0',soluvit:'0',vitalipid:'0',addamel:'0',dipeptiven:'0',heparin:'0.5',insulin:'0',carrier:'none',carrierMl:'0',
 lowSolution:'glucose',lowGlucose:'10',highGlucose:'20',start:'08:00',medicines:[a,n]};
}
export function blank():Inputs {return {...example(),surname:'',historyNumber:'',birthDate:'',sheetDate:'',sex:'',hospitalDay:'',gestationDays:'',pcvWeeks:'',pcvDays:'',weight:'',day:'',gestation:'',fluid:'',enteral:'0',other:'0',flush:'0',aa:'',fat:'',gir:'',calciumMlPerKg:'0',feeds:emptyFeeds(),extraFeeds:[],medicines:[]};}
export function numeric(v:unknown):number|null {if(typeof v!=='string'&&typeof v!=='number')return null;const s=String(v).trim().replace(',','.');if(!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(s))return null;const n=Number(s);return Number.isFinite(n)?n:null;}

export type Nutrients={energyKcal:number;proteinG:number;fatG:number;carbohydrateG:number};
export type EnteralFormula={id:string;name:string;population:string;proteinType:string;per100ml:Nutrients;powderGrams:number;source:string;productUrl:string;note:string};
export const formulaCheckedAt='06.10.2026';
const preSource='https://static.nutricia-medical.ru/iblock/9d4/9d40dde961bab9e4aac91fc4bd7a07af.pdf';
const ownFormulas:readonly EnteralFormula[]=[
 {id:'nutrilon-pre-0',name:'Нутрилон Пре 0',population:'Недоношенные и маловесные, масса менее 1800 г',proteinType:'Цельный молочный белок',per100ml:{energyKcal:79,proteinG:2.6,fatG:3.8,carbohydrateG:8.3},powderGrams:16.5,source:preSource,productUrl:'https://www.nutriclub.ru/nutrilon-pre-0-400/',note:'Повышенная белковая плотность. Переход на другую смесь определяют индивидуально.'},
 {id:'nutrilon-pre-1',name:'Нутрилон Пре 1',population:'Недоношенные и маловесные, масса более 1800 г',proteinType:'Цельный молочный белок',per100ml:{energyKcal:74,proteinG:2,fatG:3.9,carbohydrateG:7.4},powderGrams:15,source:preSource,productUrl:'https://www.nutriclub.ru/nutrilon-pre-1-400/',note:'При одинаковом объёме белка меньше, чем в Пре 0; это учитывают при смене питания.'},
 {id:'nutrilon-pepti-gastro',name:'Нутрилон Пепти Гастро',population:'С рождения; лечебное питание при нарушении всасывания и пищевой непереносимости',proteinType:'Глубокий гидролиз сывороточного белка',per100ml:{energyKcal:66,proteinG:1.8,fatG:3.4,carbohydrateG:7},powderGrams:12.9,source:'https://nutricia-medical.ru/catalog/short-bowel-syndrome/nutrilon-pepti-gastro/',productUrl:'https://www.nutriclub.ru/nutrilon-pepti-gastro-450/',note:'Белок указан как белковый эквивалент. Содержит среднецепочечные триглицериды; не является смесью для недоношенных.'},
 {id:'nutrilon-ha-1',name:'Нутрилон ГА 1 (Гипоаллергенный 1)',population:'Доношенные, с рождения до 6 месяцев',proteinType:'Частичный гидролиз сывороточного белка',per100ml:{energyKcal:65,proteinG:1.5,fatG:3.4,carbohydrateG:7.2},powderGrams:13.8,source:'https://www.nutriclub.ru/nutrilon-ga-1-400/',productUrl:'https://www.nutriclub.ru/nutrilon-ga-1-400/',note:'На странице производителя указано 65 ккал/100 мл, в прежнем каталоге — 67. Сверьте калорийность с банкой перед расчётом. ГА 1 не заменяет лечебную смесь при подтверждённой АБКМ.'},
];
import {directoryMixtures} from './directory.ts';
export const directoryMixtureNote='значения на 100 мл готового продукта, с этикеткой производителя не сверены. Сверяйте с этикеткой вашей партии.';
export const enteralFormulas:readonly EnteralFormula[]=[
 ...ownFormulas,
 ...directoryMixtures.map(m=>({id:m.id,name:m.name,population:'Состав не сверен с этикеткой производителя',proteinType:'Тип белка не указан',per100ml:{...m.per100ml},powderGrams:0,source:'',productUrl:'',note:'Проверьте калорийность и белок по банке перед расчётом.'})),
];

/** Label values are per 100 mL of prepared formula, never per 100 mL of water. */
export type EnteralRowResult={id:string;formula:EnteralFormula|null;volumeMl:number|null;daily:Nutrients|null;route:string};
/** The КР 2015 trophic threshold: below it the feeding is on top of the need and its nutrients are not counted. */
export const trophicThresholdMlPerKg=25;
/** Infusion pumps in the unit are set in steps of 0.1 ml/h; the slowest rate is 0.1 ml/h. */
export const pumpMinMlPerHour=0.1;
export const pumpRate=(rate:number)=>Math.round(rate*10)/10;
const zeroNutrients=():Nutrients=>({energyKcal:0,proteinG:0,fatG:0,carbohydrateG:0});
export function calculateEnteral(p:Inputs){
 const errors:string[]=[];
 const issues:Issue[]=[];
 const error=(field:string,message:string)=>{errors.push(message);issues.push({field,message});};
 const weight=numeric(p.weight);const kg=weight!==null&&weight>0?weight/1000:null;
 if(kg===null||kg===0)error('weight','Для расчёта на килограмм укажите массу больше 0 г');
 const formula=enteralFormulas.find(x=>x.id===p.formulaId)??null;
 const mode=p.enteralMode??'perKg';
 const sumFeeds=(feeds:readonly string[],field:string):number|null=>{
  let total=0;
  for(const [index,raw] of feeds.entries()){if(raw.trim()==='')continue;const value=numeric(raw);if(value===null){error(field,`Кормление ${index+1}: объём в мл или пустое поле`);return null;}total+=value;}
  return total;
 };
 let volumeMl:number|null=null,volumePerKg:number|null=null;
 if(mode==='perKg'){
  volumePerKg=numeric(p.enteral);
  if(volumePerKg===null)error('enteral','Укажите энтеральный объём в мл/кг/сут');
  if(volumePerKg!==null&&kg!==null)volumeMl=volumePerKg*kg;
 }else if(mode==='daily'){
  volumeMl=numeric(p.enteralVolume);
  if(volumeMl===null)error('enteralVolume','Укажите энтеральный объём в мл/сут');
 }else if(mode==='feeds'){
  const portion=numeric(p.feedingMl),count=numeric(p.feedingCount);
  if(portion===null)error('feedingMl','Укажите объём готовой смеси на кормление');
  if(count===null||count<1||count>48||!Number.isInteger(count))error('feedingCount','Количество кормлений: целое число от 1 до 48');
  else if(portion!==null)volumeMl=portion*count;
 }else if(mode==='feeds8'){
  volumeMl=sumFeeds(p.feeds??[],'feeds');
 }else error('enteralMode','Выберите способ ввода энтерального объёма');
 const volumeField=mode==='daily'?'enteralVolume':mode==='feeds'?'feedingMl':mode==='feeds8'?'feeds':'enteral';
 if(volumeMl!==null&&!Number.isFinite(volumeMl)){error(volumeField,'Энтеральный объём превышает числовой диапазон');volumeMl=null;}
 if(volumeMl!==null&&kg!==null)volumePerKg=volumeMl/kg;
 if(volumePerKg!==null&&!Number.isFinite(volumePerKg)){error(volumeField,'Объём на килограмм превышает числовой диапазон');volumePerKg=null;}
 if(!formula&&((volumeMl??0)>0||(volumePerKg??0)>0))error('formulaId','Выберите смесь: без состава нутриенты не рассчитаны');
 const scaleWith=(base:EnteralFormula|null,volume:number|null,field:string):Nutrients|null=>{
  if(volume===null)return null;
  if(volume===0)return zeroNutrients();
  if(!base)return null;
  const n=base.per100ml;
  const result={energyKcal:volume/100*n.energyKcal,proteinG:volume/100*n.proteinG,fatG:volume/100*n.fatG,carbohydrateG:volume/100*n.carbohydrateG};
  if(Object.values(result).some(v=>!Number.isFinite(v))){error(field,'Количество энтеральных нутриентов превышает числовой диапазон');return null;}
  return result;
 };
 const primaryDaily=scaleWith(formula,volumeMl,volumeField);
 const rows:EnteralRowResult[]=[];
 let extraMl=0,extraOk=true;const extraDaily=zeroNutrients();
 for(const row of p.extraFeeds??[]){
  const field='extraFeeds:'+row.id;
  const rowFormula=enteralFormulas.find(x=>x.id===row.formulaId)??null;
  const rowMl=sumFeeds(row.feeds,field);
  if(rowMl!==null&&rowMl>0&&!rowFormula)error(field,'Выберите смесь для дополнительной строки кормления');
  const rowDaily=scaleWith(rowFormula,rowMl,field);
  rows.push({id:row.id,formula:rowFormula,volumeMl:rowMl,daily:rowDaily,route:row.route});
  if(rowMl===null||rowDaily===null)extraOk=false;
  else{extraMl+=rowMl;for(const key of Object.keys(extraDaily) as (keyof Nutrients)[])extraDaily[key]+=rowDaily[key];}
 }
 const totalMl=volumeMl===null||!extraOk?null:volumeMl+extraMl;
 if(totalMl!==null&&!Number.isFinite(totalMl))error('extraFeeds','Суммарный энтеральный объём превышает числовой диапазон');
 const totalPerKg=totalMl===null||kg===null||!Number.isFinite(totalMl)?null:totalMl/kg;
 const daily=primaryDaily===null||!extraOk?null:Object.fromEntries((Object.keys(primaryDaily) as (keyof Nutrients)[]).map(key=>[key,primaryDaily[key]+extraDaily[key]])) as Nutrients;
 const perKg=daily===null||kg===null?null:Object.fromEntries((Object.keys(daily) as (keyof Nutrients)[]).map(key=>[key,daily[key]/kg])) as Nutrients;
 // Trophic feeding (below 25 ml/kg/day by the weight used for nutrition) stays outside the parenteral calculation.
 const counted=(p.trophicRule??'kr')==='always'||(totalPerKg!==null&&totalPerKg>=trophicThresholdMlPerKg);
 const countedMl=totalMl===null?null:counted?totalMl:0;
 const trophicMl=totalMl===null?null:counted?0:totalMl;
 const countedDaily=daily===null?null:counted?daily:zeroNutrients();
 return {valid:errors.length===0,errors,issues,formula,volumeMl:totalMl,primaryMl:volumeMl,volumePerKg:totalPerKg,daily,primaryDaily,perKg,rows,counted,countedMl,trophicMl,countedDaily};
}
export type EnteralResult=ReturnType<typeof calculateEnteral>;

export type ProteinPlan={valid:boolean;targetPerKg:number|null;targetGrams:number|null;enteralGrams:number|null;enteralPerKg:number|null;
 requiredIvGrams:number|null;requiredIvPerKg:number|null;achievedGrams:number|null;
 achievedPerKg:number|null;excessGrams:number|null;excessPerKg:number|null;issues:Issue[]};


/** Allocate a total protein goal to enteral/other protein first, then amino acids. Never infer absent composition as zero. */
export function calculateProteinPlan(p:Inputs,en:EnteralResult=calculateEnteral(p)):ProteinPlan{
 const issues:Issue[]=[];
 const issue=(field:string,message:string,medicineId?:string)=>{if(!issues.some(x=>x.field===field&&x.medicineId===medicineId))issues.push({field,message,...(medicineId?{medicineId}:{})});};
 const positiveText=(value:unknown)=>numeric(value)!==null&&/[1-9]/.test(String(value));
 const read=(field:keyof Inputs,label:string):number|null=>{
  const value=numeric(p[field]);
  if(value===null){issue(field,label);return null;}
  if(value===0&&positiveText(p[field])){issue(field,'Положительное значение белкового плана теряется до нуля: проверьте слишком малые значения');return null;}
  return value;
 };
 const checked=(value:number,positive:boolean,field:string):number|null=>{
  if(!Number.isFinite(value)||value<0){issue(field,'Количество белка превышает числовой диапазон');return null;}
  if(positive&&value===0){issue(field,'Положительное количество белка теряется до нуля: проверьте слишком малые значения');return null;}
  return Object.is(value,-0)?0:value;
 };
 // Scale mantissas if an intermediate product overflows or becomes subnormal while its final result is representable.
 const product=(numerators:number[],divisors:number[],field:string):number|null=>{
  if(numerators.some(x=>!Number.isFinite(x)||x<0)||divisors.some(x=>!Number.isFinite(x)||x<=0))return checked(NaN,false,field);
  if(numerators.some(x=>x===0))return 0;
  let numerator=1,divisor=1,normal=true;
  for(const value of numerators){numerator*=value;normal=normal&&numerator>=2**-1022&&Number.isFinite(numerator);}
  for(const value of divisors){divisor*=value;normal=normal&&divisor>=2**-1022&&Number.isFinite(divisor);}
  const direct=numerator/divisor;
  if(normal&&Number.isFinite(direct)&&direct>0)return direct;
  let mantissa=1,exponent=0;
  for(const [values,direction] of [[numerators,1],[divisors,-1]] as const)for(const value of values){
   const power=Math.min(1023,Math.floor(Math.log2(value))),part=value/2**power;
   mantissa=direction===1?mantissa*part:mantissa/part;exponent+=direction*power;
   while(mantissa>=2){mantissa/=2;exponent++;}while(mantissa<1){mantissa*=2;exponent--;}
  }
  return checked(exponent< -1022?(mantissa*2**(exponent+1074))*Number.MIN_VALUE:mantissa*2**exponent,true,field);
 };
 const grams=read('weight','Для белкового плана укажите массу больше 0 г');
 let kg=grams!==null&&grams>0?grams/1000:null;
 if(grams===0)issue('weight','Для белкового плана укажите массу больше 0 г');
 if(kg===0){issue('weight','Масса слишком мала для белкового плана');kg=null;}
 const targetPerKg=read('aa','Укажите суммарную цель белка: число от 0 г/кг/сут');
 const targetGrams=kg===null||targetPerKg===null?null:product([kg,targetPerKg],[],'aa');
 for(const item of en.issues)issue(item.field,item.message,item.medicineId);
 let enteralGrams=en.valid?en.countedDaily?.proteinG??null:null;
 const volumeField=p.enteralMode==='daily'?'enteralVolume':p.enteralMode==='feeds'?'feedingMl':'enteral';
 if(en.valid&&((en.volumeMl===0&&positiveText(p[volumeField]))||(en.counted&&(en.volumeMl??0)>0&&enteralGrams===0&&(en.formula?.per100ml.proteinG??0)>0))){
  issue(volumeField,'Положительное энтеральное поступление белка теряется до нуля: проверьте слишком малые значения');enteralGrams=null;
 }
 if(enteralGrams!==null)enteralGrams=checked(enteralGrams,false,volumeField);
 const perKg=(value:number|null)=>kg===null||value===null?null:product([value],[kg],'weight');
 const enteralPerKg=perKg(enteralGrams);
 let requiredIvGrams:number|null=null,requiredIvPerKg:number|null=null,achievedGrams:number|null=null,achievedPerKg:number|null=null,excessGrams:number|null=null,excessPerKg:number|null=null;
 if(issues.length===0&&targetGrams!==null&&enteralGrams!==null){
  const supplied=checked(enteralGrams,false,'aa');
  if(supplied!==null){
   const gap=targetGrams-supplied,tolerance=Number.EPSILON*16*Math.max(Math.abs(targetGrams),Math.abs(supplied));
   requiredIvGrams=gap>tolerance?gap:0;excessGrams=gap< -tolerance?-gap:0;
   requiredIvPerKg=perKg(requiredIvGrams);excessPerKg=perKg(excessGrams);
   achievedGrams=checked(supplied+requiredIvGrams,false,'aa');achievedPerKg=perKg(achievedGrams);
  }
 }
 const valid=issues.length===0&&[targetGrams,enteralGrams,requiredIvGrams,requiredIvPerKg,achievedGrams,achievedPerKg,excessGrams,excessPerKg].every(x=>x!==null);
 return {valid,targetPerKg,targetGrams,enteralGrams,enteralPerKg,
  requiredIvGrams:valid?requiredIvGrams:null,requiredIvPerKg:valid?requiredIvPerKg:null,achievedGrams:valid?achievedGrams:null,
  achievedPerKg:valid?achievedPerKg:null,excessGrams:valid?excessGrams:null,excessPerKg:valid?excessPerKg:null,issues};
}

/** Keep converted inputs readable by the decimal-only input parser, without rounding. */
export function decimalInput(value:number):string {
 const text=String(value);if(!/[eE]/.test(text))return text;
 const [coefficient,exponent]=text.toLowerCase().split('e');
 const [whole,fraction='']=coefficient.split('.');const digits=whole+fraction;
 const point=whole.length+Number(exponent);
 if(point<=0)return '0.'+'0'.repeat(-point)+digits;
 if(point>=digits.length)return digits+'0'.repeat(point-digits.length);
 return digits.slice(0,point)+'.'+digits.slice(point);
}

/** Convert only a complete active volume; never revive values from inactive modes. */
export function changeEnteralMode(p:Inputs,mode:Inputs['enteralMode']):{patch:Partial<Inputs>|null;error:string} {
 const blocked=(error:string)=>({patch:null,error});
 if(mode===p.enteralMode)return {patch:null,error:''};
 const field=p.enteralMode==='perKg'?'enteral':p.enteralMode==='daily'?'enteralVolume':p.enteralMode==='feeds'?'feedingMl':'feeds';
 const feedTotal=()=>{let total=0;for(const raw of p.feeds??[]){if(raw.trim()==='')continue;const value=numeric(raw);if(value===null)return null;total+=value;}return total;};
 const source=p.enteralMode==='feeds8'?feedTotal():numeric(p[field] as string);
 if(source===null)return blocked('Исправьте текущий объём перед сменой способа ввода. Введённые данные сохранены.');
 const count=numeric(p.feedingCount);
 const validCount=count!==null&&Number.isInteger(count)&&count>=1&&count<=48;
 if(p.enteralMode==='feeds'&&!validCount)return blocked('Укажите целое число кормлений от 1 до 48 перед сменой способа ввода.');
 const feeds=validCount?count!:8;
 const weight=numeric(p.weight),kg=weight!==null&&weight>0?weight/1000:null;
 if(source>0&&(p.enteralMode==='perKg'||mode==='perKg')&&(kg===null||kg<=0))return blocked('Укажите массу ребёнка, чтобы пересчитать объём между мл/кг/сут и мл/сут. Введённый объём сохранён.');
 const result=calculateEnteral({...p,extraFeeds:[]});
 const volume=source===0?0:result.primaryMl;
 const perKg=source===0?0:volume===null||kg===null?null:volume/kg;
 if(volume===null||(mode==='perKg'&&perKg===null))return blocked('Объём превышает числовой диапазон пересчёта. Проверьте текущий объём и массу.');
 const portion=volume/feeds,eighth=volume/8;
 if(source>0&&(volume===0||(mode==='feeds'&&portion===0)||(mode==='feeds8'&&eighth===0)||(mode==='perKg'&&perKg===0)))return blocked('Объём слишком мал для пересчёта без потери точности. Введённые данные сохранены.');
 const patch:Partial<Inputs>={enteralMode:mode,enteralVolume:decimalInput(volume),feedingMl:decimalInput(portion)};
 if(perKg!==null)patch.enteral=decimalInput(perKg);
 if(mode==='feeds')patch.feedingCount=String(feeds);
 if(mode==='feeds8')patch.feeds=Array<string>(8).fill(volume===0?'':decimalInput(eighth));
 return {patch,error:''};
}
function time(v:string):number|null {if(!/^\d{2}:\d{2}$/.test(v))return null;const [h,m]=v.split(':').map(Number);return h<24&&m<60?h*60+m:null;}
export function schedule(first:string,interval:number,start:string):number[] {
 const f=time(first),s=time(start);if(f===null||s===null||interval<=0||!Number.isFinite(interval))return [];
 const offset=(f-s+1440)%1440; const times:number[]=[];
 for(let t=offset;t<1440-1e-8&&times.length<288;t+=interval*60)times.push(t);
 return times;
}
export function clock(offset:number,start:string):string {
 if(!Number.isFinite(offset))return '—';
 const aligned=Math.abs(offset-Math.round(offset))<1e-8;
 const minutes=((time(start)??0)+(aligned?Math.round(offset):offset))%1440;
 const normalized=(minutes+1440)%1440;
 const pad=(value:number)=>String(value).padStart(2,'0');
 const label=pad(Math.floor(normalized/60))+':'+pad(Math.floor(normalized%60));
 return aligned?label:label+':'+pad(Math.min(59,Math.floor((normalized%1)*60+1e-7)));
}
/** Calendar day relative to the start date, preserving fractional minutes at midnight. */
export function scheduleDay(offset:number,start:string):number|null {
 const begin=time(start);if(begin===null||!Number.isFinite(offset)||offset<0)return null;
 const aligned=Math.abs(offset-Math.round(offset))<1e-8;
 return Math.floor((begin+(aligned?Math.round(offset):offset))/1440);
}
export function firstOffset(first:string,start:string):number|null {
 const begin=time(start),at=time(first);return begin===null||at===null?null:(at-begin+1440)%1440;
}
export type MedResult={id:string;name:string;group:Group;kind:DrugKind;valid:boolean;errors:string[];issues:Issue[];volume:number|null;fluidVolume:number|null;intravenous:boolean;rate:number|null;doseMg:number|null;doseAmount:number|null;doseLabel:string;amountMg:number|null;stockMl:number|null;solventMl:number|null;concentration:number|null;times:number[];loadingMg:number|null;loadingDeliveredMg:number|null;loadingVolume:number|null;loadingDeliveredVolume:number|null;loadingRate:number|null;minutes:number|null;duration:number|null;unit:string;syringeHours:number|null;syringeCount:number|null};
/** Accept arithmetic roundoff only at the scale of the two compared volumes. */
function exceedsVolume(source:number,final:number):boolean {
 return !Number.isFinite(source)||source-final>Number.EPSILON*16*Math.max(Math.abs(source),Math.abs(final));
}
const massUnits:Record<string,number>={'мг':1,'мкг':0.001,'гр':1000};
/** Doses use the weight given as `kg`: in calculate() that is the weight today, as on the mytpn sheet. */
export function calculateMedicine(m:Medicine,kg:number,start:string):MedResult {
 const d=drugs.find(x=>x.id===m.drug);const name=d?.name??m.drug;const kind:DrugKind=d?.kind??(m.mode==='continuous'?'continuous':'intermittent');const errors:string[]=[];
 const issues:Issue[]=[];
 const error=(field:string,message:string)=>{errors.push(message);issues.push({field,message,medicineId:m.id});};
 const read=(key:keyof Medicine,label:string,positive=false)=>{const v=numeric(m[key]);if(v===null||(positive?v<=0:v<0)){error(key,label);return null;}return v;};
 const mass=Number.isFinite(kg)&&kg>0?kg:null;
 if(mass===null)error('weight','Укажите массу больше 0 г');
 const positiveResult=(field:string,value:number):number|null=>{
  if(value===0){error(field,'Значение слишком мало для точного расчёта: положительный результат теряется до нуля');return null;}
  return value;
 };
 if(time(start)===null)error('start','Укажите начало расчётных суток');
 if(!d)error('drug','Неизвестный препарат');
 if(!['intermittent','continuous'].includes(m.mode))error('mode','Проверьте режим введения');
 const intravenous=isIntravenousRoute(m.route);
 const routeTime=routeMinutes(m.route);
 /** Hours entered by the doctor win; the legacy minutes field still works for older inputs. */
 const durationField=(hoursKey:'infusionHours'|'loadingHours',minutesKey:'minutes'|'loadingMinutes')=>String(m[hoursKey]??'').trim()!==''?hoursKey:String(m[minutesKey]??'').trim()!==''?minutesKey:hoursKey;
 const duration=(hoursKey:'infusionHours'|'loadingHours',minutesKey:'minutes'|'loadingMinutes',label:string,required:boolean):number|null=>{
  const hours=String(m[hoursKey]??'').trim();
  if(hours!==''){const value=numeric(hours);if(value===null||value<=0){error(hoursKey,'Время введения: число часов больше 0, например 0,5');return null;}return value*60;}
  if(String(m[minutesKey]??'').trim()!=='')return read(minutesKey,label,true);
  if(required)error(hoursKey,label);
  return null;
 };
 let volume:number|null=null,fluidVolume:number|null=null,rate:number|null=null,doseMg:number|null=null,doseAmount:number|null=null,doseLabel='',amountMg:number|null=null,stockMl:number|null=null,solventMl:number|null=null,concentration:number|null=null,minutes:number|null=null,hoursSpan:number|null=null;
 let times:number[]=[];let loadingMg:number|null=null,loadingDeliveredMg:number|null=null,loadingVolume:number|null=null,loadingDeliveredVolume:number|null=null,loadingRate:number|null=null,syringeHours:number|null=null,syringeCount:number|null=null;
 const dose=read('dose','Укажите дозу',true);
 if(kind==='blood'){
  // Transfusion: ml/kg once at the given time; the volume is reported but, as on the mytpn sheet, stays outside the fluid balance.
  doseLabel='мл';
  if(!m.route.trim())error('route','Укажите путь и длительность введения');
  if(time(m.first)===null)error('first','Укажите время введения');
  const offset=firstOffset(m.first,start);
  if(offset!==null)times=[offset];
  if(dose!==null&&mass!==null){volume=positiveResult('dose',dose*mass);doseAmount=volume;}
  minutes=routeTime??duration('infusionHours','minutes','Укажите время введения, ч',false);
  if(volume!==null&&minutes!==null&&minutes>0){rate=volume*60/minutes;hoursSpan=minutes/60;}
  fluidVolume=0;
 }else if(m.mode==='intermittent'){
  const unit=m.unit.trim();const baseUnit=unit.split('/')[0];const perKg=unit.endsWith('/кг');
  const allowed:readonly string[]=d?.group==='other'?doseUnits:bolusUnits;
  if(!allowed.includes(unit))error('dose','Нужны единицы разовой дозы');
  doseLabel=baseUnit;
  const interval=read('interval','Укажите интервал от 1 до 168 ч',true);
  if(intravenous)minutes=routeTime??duration('infusionHours','minutes','Укажите время введения, ч',true);
  else minutes=routeTime??duration('infusionHours','minutes','Укажите время введения, ч',false)??0;
  if(interval!==null&&(interval<1||interval>168))error('interval','Интервал должен быть от 1 до 168 ч');
  if(minutes!==null&&interval!==null&&minutes>interval*60)error(routeTime!==null?'route':durationField('infusionHours','minutes'),'Время введения больше интервала');
  if(time(m.first)===null)error('first','Укажите время первого введения');
  if(interval!==null&&interval>=1&&time(m.first)!==null&&time(start)!==null){times=schedule(m.first,interval,start);if(times.length===0)error('first','Не задано расписание');}
  if(dose!==null&&(mass!==null||!perKg)){
   doseAmount=positiveResult('dose',dose*(perKg?mass!:1));
   const factor=massUnits[baseUnit];
   if(doseAmount!==null&&factor!==undefined)doseMg=positiveResult('dose',doseAmount*factor);
   if(doseMg!==null&&minutes!==null&&times.length>0)amountMg=positiveResult('dose',doseMg*times.reduce((sum,t)=>sum+Math.min(1,Math.max(0,1440-t)/Math.max(minutes!,1e-9)),0));
  }
  const final=intravenous?read('volume','Укажите конечный объём',true):(m.volume.trim()?read('volume','Проверьте конечный объём',true):null);
  if(final!==null){
   const fractions=minutes!==null&&times.length>0?times.reduce((sum,t)=>sum+(minutes!>0?Math.min(1,Math.max(0,1440-t)/minutes!):1),0):null;
   volume=fractions!==null?positiveResult('volume',final*fractions):null;
   if(minutes!==null&&minutes>0)rate=positiveResult('minutes',final*60/minutes);
   if(doseMg!==null)concentration=positiveResult('dose',doseMg/final);
  }
  fluidVolume=intravenous?volume:0;
  if(m.stock.trim()!==''){const stock=read('stock','Проверьте исходную концентрацию',true);if(stock!==null&&doseMg!==null&&final!==null){stockMl=positiveResult('stock',doseMg/stock);if(stockMl!==null){solventMl=final-stockMl;if(exceedsVolume(stockMl,final))error('volume','Объём препарата больше конечного объёма');else solventMl=Math.max(0,solventMl);}}}
 }else{
  const factors:Record<string,number>={'мкг/кг/мин':0.06,'мкг/кг/ч':0.001,'мг/кг/ч':1};
  const factor=factors[m.unit];if(!factor)error('dose','Проверьте единицы скорости дозы');
  if(!['rate','amount'].includes(m.method))error('method','Проверьте способ расчёта');
  doseLabel='мг';
  const final=read('volume','Укажите конечный объём',true);
  hoursSpan=read('hours','Укажите длительность больше 0 и не более 24 ч',true);if(hoursSpan!==null&&hoursSpan>24)error('hours','Длительность не должна превышать 24 ч');
  const hourly=dose!==null&&factor&&mass!==null?positiveResult('dose',dose*mass*factor):null;
  if(m.method==='rate'){
   rate=read('pump','Укажите скорость насоса',true);
   if(rate!==null&&hourly!==null&&final!==null){concentration=positiveResult('pump',hourly/rate);if(concentration!==null)amountMg=positiveResult('volume',concentration*final);}
  }else{
   amountMg=read('amount','Укажите количество препарата в шприце',true);
   if(amountMg!==null&&final!==null&&hourly!==null){concentration=positiveResult('volume',amountMg/final);if(concentration!==null)rate=positiveResult('dose',hourly/concentration);}
  }
  const stock=String(m.stock??'').trim()===''?null:read('stock','Концентрация исходного препарата: число больше 0 мг/мл',true);
  if(amountMg!==null&&stock!==null&&final!==null){stockMl=positiveResult('stock',amountMg/stock);if(stockMl!==null){solventMl=final-stockMl;if(exceedsVolume(stockMl,final))error('volume','Объём препарата больше объёма шприца');else solventMl=Math.max(0,solventMl);}}
  if(rate!==null&&hoursSpan!==null){volume=positiveResult('hours',rate*hoursSpan);if(final!==null&&rate>0&&volume!==null){syringeHours=positiveResult('pump',final/rate);syringeCount=Math.max(1,Math.ceil(volume/final-1e-10));}}
  doseAmount=amountMg;
  fluidVolume=intravenous?volume:0;
 }
 if(m.loading){
  const ld=read('loadingDose','Укажите нагрузочную дозу',true);loadingVolume=read('loadingVolume','Укажите объём нагрузки',true);const lm=duration('loadingHours','loadingMinutes','Укажите время введения нагрузки, ч',true);
  if(!m.loadingSource.trim())error('loadingSource','Укажите источник схемы с нагрузкой');
  if(time(m.loadingFirst)===null)error('loadingFirst','Укажите время нагрузки');
  if(lm!==null&&lm>1440)error(durationField('loadingHours','loadingMinutes'),'Время нагрузки не должно превышать 24 ч');
  if(ld!==null&&mass!==null)loadingMg=positiveResult('loadingDose',ld*mass*(m.unit.startsWith('мкг')?0.001:1));
  if(loadingVolume!==null&&lm!==null)loadingRate=positiveResult(durationField('loadingHours','loadingMinutes'),loadingVolume*60/lm);
  const stock=numeric(m.stock);
  if(stock!==null&&stock>0&&loadingMg!==null&&loadingVolume!==null){const loadingStock=positiveResult('stock',loadingMg/stock);if(loadingStock!==null&&exceedsVolume(loadingStock,loadingVolume))error('loadingVolume','Объём исходного препарата больше конечного объёма нагрузки');}
  const loadOffset=firstOffset(m.loadingFirst,start);
  if(loadingVolume!==null&&lm!==null&&loadOffset!==null){const fraction=Math.min(1,(1440-loadOffset)/lm);loadingDeliveredVolume=positiveResult(durationField('loadingHours','loadingMinutes'),loadingVolume*fraction);if(volume!==null&&loadingDeliveredVolume!==null){volume+=loadingDeliveredVolume;if(intravenous&&fluidVolume!==null)fluidVolume+=loadingDeliveredVolume;}loadingDeliveredMg=loadingMg!==null?positiveResult('loadingDose',loadingMg*fraction):null;}
 }
 if([volume,fluidVolume,rate,doseMg,doseAmount,amountMg,stockMl,solventMl,concentration,loadingMg,loadingDeliveredMg,loadingVolume,loadingDeliveredVolume,loadingRate,syringeHours,syringeCount].some(v=>v!==null&&!Number.isFinite(v)))error('dose','Расчёт превышает числовой диапазон');
 return {id:m.id,name,group:d?.group??m.group,kind,valid:errors.length===0,errors,issues,volume,fluidVolume,intravenous,rate,doseMg,doseAmount,doseLabel,amountMg,stockMl,solventMl,concentration,times,loadingMg,loadingDeliveredMg,loadingVolume,loadingDeliveredVolume,loadingRate,minutes,duration:hoursSpan,unit:m.unit,syringeHours,syringeCount};
}

/** Changing the calculation direction keeps the current prepared solution unchanged. */
export function changeMedicineMethod(m:Medicine,method:Medicine['method'],kg:number,start:string):{patch:Partial<Medicine>|null;error:string} {
 if(method===m.method)return {patch:null,error:''};
 const result=calculateMedicine({...m,loading:false},kg,start);
 const value=method==='amount'?result.amountMg:result.rate;
 if(m.mode!=='continuous'||!result.valid||value===null||!Number.isFinite(value)||value<=0){
  const target=method==='amount'?m.amount:m.pump;
  if(m.mode==='continuous'&&!target.trim())return {patch:{method},error:''};
  return {patch:null,error:'Исправьте параметры поддерживающей инфузии перед сменой способа расчёта. Введённые данные сохранены.'};
 }
 return {patch:{method,...(method==='amount'?{amount:decimalInput(value)}:{pump:decimalInput(value)})},error:''};
}
export type ElectrolyteVolumes={caMl:number|null;kclMl:number|null;nacl10Ml:number|null;nacl09Ml:number|null;mgMl:number|null;soluvitMl:number|null;dipeptivenMl:number|null;addamelMl:number|null;carrierMl:number|null;sumMl:number|null};
/** Перебор суточной жидкости дополнительными объёмами, который лист ещё терпит (мл). */
export const overshootToleranceMl=5;
export function calculate(p:Inputs){
 const errors:string[]=[];
 const issues:Issue[]=[];
 const warnings:string[]=[];
 const error=(field:string,message:string)=>{errors.push(message);issues.push({field,message});};
 const get=(key:keyof Inputs,label:string,positive=false,max=Infinity)=>{const n=numeric(p[key]);if(n===null||(positive?n<=0:n<0)||n>max){error(key,label);return null;}return n;};
 const optional=(key:keyof Inputs,label:string,positive=false)=>String(p[key]??'').trim()===''?null:get(key,label,positive);
 const grams=get('weight','Укажите массу больше 0 г',true),kg=grams===null?null:grams/1000;
 if(kg===0)error('weight','Масса слишком мала для расчёта');
 // Weight today (mytpn): drug doses and «получит мл/кг». Empty means the same as the weight used for nutrition.
 const todayGrams=String(p.weightToday??'').trim()===''?grams:get('weightToday','Вес сегодня: число больше 0 г',true);
 const kgToday=todayGrams===null?null:todayGrams/1000;
 const soft=(key:keyof Inputs,label:string)=>{const raw=String(p[key]??'').trim();if(raw==='')return null;const n=numeric(raw);if(n===null||n<=0){warnings.push(label);return null;}return n;};
 const yesterdayGrams=soft('weightYesterday','Вес вчера не учтён в динамике: нужно число больше 0 г'),birthGrams=soft('birthWeight','Вес при рождении не учтён в динамике: нужно число больше 0 г');
 const dynamics={dayGrams:todayGrams!==null&&yesterdayGrams!==null?todayGrams-yesterdayGrams:null,dayPercent:todayGrams!==null&&yesterdayGrams!==null?100*(todayGrams-yesterdayGrams)/yesterdayGrams:null,birthPercent:todayGrams!==null&&birthGrams!==null?100*(todayGrams-birthGrams)/birthGrams:null};
 if(dynamics.dayPercent!==null&&dynamics.dayPercent<=-4)warnings.push('Убыль массы за сутки '+dynamics.dayPercent.toLocaleString('ru-RU',{maximumFractionDigits:1})+' % — больше допустимых 4 % (КР 2015)');
 if(dynamics.birthPercent!==null&&dynamics.birthPercent<=-10)warnings.push('Убыль массы от рождения '+dynamics.birthPercent.toLocaleString('ru-RU',{maximumFractionDigits:1})+' % — проверьте объём жидкости');
 const day=get('day','Укажите сутки жизни (целое число)',true),ga=get('gestation','Укажите гестационный возраст',true,44);
 if(day!==null&&!Number.isInteger(day))error('day','Сутки жизни должны быть целым числом');
 if(ga!==null&&ga<20)error('gestation','Гестационный возраст должен быть не менее 20 недель');
 if(time(p.start)===null)error('start','Укажите начало расчётных суток');
 const enteralNutrition=calculateEnteral(p);for(const issue of enteralNutrition.issues)if(issue.field!=='weight')error(issue.field,issue.message);
 const fluid=get('fluid','Укажите суточную жидкость',true),other=get('other','Укажите прочую жидкость'),flush=get('flush','Укажите объём промывок');
 const proteinPlan=calculateProteinPlan(p,enteralNutrition);
 for(const item of proteinPlan.issues)if(!issues.some(x=>x.field===item.field&&x.medicineId===item.medicineId)){errors.push(item.message);issues.push(item);}
 const aaGrams=proteinPlan.requiredIvGrams;
 const ap=aaGrams!==null&&aaGrams>0?get('aaPercent','Проверьте концентрацию аминокислот',true,100):null;
 const ah=aaGrams!==null&&aaGrams>0?get('aaHours','Время аминокислот: больше 0 и не более 24 ч',true,24):null;
 const fat=get('fat','Укажите дозу жиров'),fp=get('fatPercent','Проверьте концентрацию жиров',true,100),fh=get('fatHours','Время жиров: больше 0 и не более 24 ч',true,24);
 const gir=get('gir','Укажите дозу глюкозы'),bh=get('baseHours','Время базы: больше 0 и не более 24 ч',true,24);
 const caPerKg=get('calciumMlPerKg','Глюконат кальция 10 %: мл/кг/сут, число от 0'),cc=get('calciumContent','Укажите содержание кальция в растворе',true);
 // КР 2015, таблица 3: старт 1–2 мл/кг (0,25–0,5 ммоль/кг), максимум 2–4 мл/кг (0,5–1 ммоль/кг).
 if(caPerKg!==null&&caPerKg>4)warnings.push('Глюконат кальция 10 % '+caPerKg.toLocaleString('ru-RU',{maximumFractionDigits:2})+' мл/кг — больше 4 мл/кг (1 ммоль/кг), максимума по КР 2015, таблица 3');
 const kcl=get('kcl','Калий: ммоль/кг/сут, число от 0'),kclC=get('kclMmolPerMl','KCl: ммоль в 1 мл раствора, больше 0',true);
 const nacl10=get('nacl10','Натрий 10 %: ммоль/кг/сут, число от 0'),nacl10C=get('nacl10MmolPerMl','NaCl 10 %: ммоль в 1 мл, больше 0',true);
 const nacl09=get('nacl09','Натрий 0,9 %: ммоль/кг/сут, число от 0'),nacl09C=get('nacl09MmolPerMl','NaCl 0,9 %: ммоль в 1 мл, больше 0',true);
 const magnesium=get('magnesium','Магния сульфат 25 %: мл/кг/сут, число от 0'),soluvit=get('soluvit','Солувит: мл/кг/сут, число от 0'),vitalipid=get('vitalipid','Виталипид: мл/кг/сут, число от 0');
 const addamel=get('addamel','Аддамель: мл/сут, число от 0'),dipeptiven=get('dipeptiven','Дипептивен: мл/кг/сут, число от 0');
 const heparin=get('heparin','Гепарин: Ед/мл, число от 0'),insulin=get('insulin','Инсулин: Ед/кг/час, число от 0');
 const carrierName=p.carrier&&p.carrier!=='none'?p.carrier:'';
 const carrierMl=carrierName?get('carrierMl','Проводниковый раствор: объём в мл, число от 0'):0;
 const lowSolution=p.lowSolution??'glucose';
 const low=lowSolution==='glucose'?get('lowGlucose','Укажите меньшую концентрацию глюкозы',false,100):0,high=get('highGlucose','Укажите большую концентрацию глюкозы',true,100);
 const mul=(a:number|null,b:number|null)=>a===null||b===null?null:a*b;
 const total=mul(kg,fluid),enteralMl=enteralNutrition.volumeMl,enteralCountedMl=enteralNutrition.countedMl,enteralTrophicMl=enteralNutrition.trophicMl;
 const counted=enteralNutrition.countedDaily;
 const enteralSubtracted={proteinG:counted?.proteinG??null,fatG:counted?.fatG??null,carbohydrateG:counted?.carbohydrateG??null};
 // Fat and glucose doses are IV doses net of the counted enteral intake (КР 2015, раздел 10; mytpn e45/e47).
 const fatTotal=mul(kg,fat);
 const fatGrams=fatTotal===null||enteralSubtracted.fatG===null?null:Math.max(0,fatTotal-enteralSubtracted.fatG);
 const caMl=mul(kg,caPerKg);
 const calciumMmol=caMl!==null&&cc!==null?caMl*cc:null;
 const calciumMmolPerKg=caPerKg!==null&&cc!==null?caPerKg*cc:null;
 let aaMl=aaGrams===0?0:aaGrams!==null&&ap!==null?100*aaGrams/ap:null;
 if(aaGrams!==null&&aaGrams>0&&ap!==null&&aaMl!==null&&!Number.isFinite(aaMl))aaMl=aaGrams/ap*100;
 if(aaMl!==null&&(!Number.isFinite(aaMl)||(aaGrams!==null&&aaGrams>0&&aaMl===0))){error('aaPercent',aaMl===0?'Положительный объём аминокислот теряется до нуля: проверьте слишком малые значения':'Объём аминокислот превышает числовой диапазон');aaMl=null;}
 const fatMl=fatGrams!==null&&fp!==null?100*fatGrams/fp:null;
 const glucoseTotal=kg!==null&&gir!==null?gir*kg*1.44:null;
 const glucoseGrams=glucoseTotal===null||enteralSubtracted.carbohydrateG===null?null:Math.max(0,glucoseTotal-enteralSubtracted.carbohydrateG);
 const perKgMl=(dose:number|null)=>mul(kg,dose);
 const electrolytes:ElectrolyteVolumes={caMl,
  kclMl:kcl!==null&&kclC!==null&&kg!==null?kcl*kg/kclC:null,
  nacl10Ml:nacl10!==null&&nacl10C!==null&&kg!==null?nacl10*kg/nacl10C:null,
  nacl09Ml:nacl09!==null&&nacl09C!==null&&kg!==null?nacl09*kg/nacl09C:null,
  mgMl:perKgMl(magnesium),soluvitMl:perKgMl(soluvit),dipeptivenMl:perKgMl(dipeptiven),addamelMl:addamel,carrierMl,sumMl:null};
 const electrolyteParts=[electrolytes.caMl,electrolytes.kclMl,electrolytes.nacl10Ml,electrolytes.nacl09Ml,electrolytes.mgMl,electrolytes.soluvitMl,electrolytes.dipeptivenMl,electrolytes.addamelMl];
 electrolytes.sumMl=electrolyteParts.every(v=>v!==null)?electrolyteParts.reduce<number>((sum,v)=>sum+v!,0):null;
 const vitalipidMl=perKgMl(vitalipid);
 const medicines=p.medicines.map(m=>calculateMedicine(m,kgToday??NaN,p.start));
 for(const m of medicines)for(const issue of m.issues){if(['weight','start'].includes(issue.field)&&issues.some(existing=>!existing.medicineId&&existing.field===issue.field))continue;errors.push(m.name+': '+issue.message);issues.push(issue);}
 // Insulin (mytpn): units per day from Ед/кг/час by the weight today; a 12 ml syringe at 0.5 ml/h enters the fluid balance.
 const insulinUnits=insulin!==null&&kgToday!==null?insulin*kgToday*24:null;
 const insulinMl=insulin===null?null:insulin>0?12:0;
 const drugSum=medicines.some(m=>!m.valid)||kgToday===null||insulinMl===null?null:medicines.reduce((s,m)=>s+(m.fluidVolume??0),0)+insulinMl;
 if(drugSum!==null&&!Number.isFinite(drugSum))error('fluid','Суммарный объём лекарств превышает числовой диапазон');
 const drugMl=drugSum!==null&&Number.isFinite(drugSum)?drugSum:null;
 const drugsOnTop=(p.drugFluid??'included')==='extra';
 const fatLineMl=fatMl!==null&&vitalipidMl!==null?fatMl+vitalipidMl:null;
 const ru=(value:number,digits=1)=>value.toLocaleString('ru-RU',{maximumFractionDigits:digits});
 const parts=[total,enteralCountedMl,aaMl,fatLineMl,drugsOnTop?0:drugMl,other,flush,carrierMl];
 // Main line (glucose + electrolytes + vitamins + carrier). The carrier is on top of the need, as in mytpn.
 const rawBase=parts.every(v=>v!==null)?total!-enteralCountedMl!-aaMl!-fatLineMl!-(drugsOnTop?0:drugMl!)-other!-flush!+carrierMl!:null;
 const tolerance=Number.EPSILON*16*Math.max(1,...parts.map(v=>Math.abs(v??0)));
 const snapped=rawBase!==null&&Number.isFinite(rawBase)&&Number.isFinite(tolerance)&&Math.abs(rawBase)<=tolerance?0:rawBase;
 // Перебор суточной жидкости до 5 мл — не ошибка: глюкозы в основной линии не будет, электролиты и проводник идут сверх. Больше — лист не считается.
 const baseOver=snapped!==null&&snapped<0?-snapped:0;
 const base=snapped!==null&&snapped<0?0:snapped;
 const rawMixVolume=base!==null&&electrolytes.sumMl!==null&&carrierMl!==null?base-electrolytes.sumMl-carrierMl:null;
 const mixSnapped=rawMixVolume!==null&&Number.isFinite(rawMixVolume)&&Number.isFinite(tolerance)&&Math.abs(rawMixVolume)<=tolerance?0:rawMixVolume;
 const mixOver=mixSnapped!==null&&mixSnapped<0?-mixSnapped:0;
 const mixVolume=mixSnapped!==null&&mixSnapped<0?0:mixSnapped;
 const overshoot=baseOver+mixOver;
 if(overshoot>overshootToleranceMl)error(baseOver>0?'fluid':'calciumMlPerKg',(baseOver>0?'Дополнительные объёмы':'Электролиты и проводник')+' превышают суточную жидкость на '+ru(overshoot,1)+' мл — больше допустимых '+overshootToleranceMl+' мл');
 else if(overshoot>0)warnings.push((baseOver>0?'Дополнительные объёмы':'Электролиты и проводник')+' превышают суточную жидкость на '+ru(overshoot,1)+' мл: глюкозы в основной линии нет, в/в выйдет на '+ru(overshoot,1)+' мл больше расчёта');
 // Фактический объём основной линии: без глюкозы это электролиты с проводником, они не сжимаются.
 const lineMl=base!==null&&mixVolume!==null&&electrolytes.sumMl!==null&&carrierMl!==null?mixVolume+electrolytes.sumMl+carrierMl:base;
 if(mixVolume===0&&glucoseGrams!==null&&glucoseGrams>0)error('gir','Для заданной глюкозы не осталось жидкости');
 let lowMl:number|null=null,highMl:number|null=null;
 if(low!==null&&high!==null&&high<=low)error('highGlucose','Большая концентрация глюкозы должна превышать меньшую');
 if(mixVolume!==null&&mixVolume>=0&&glucoseGrams!==null&&low!==null&&high!==null&&high>low){
  highMl=(glucoseGrams*100-low*mixVolume)/(high-low);lowMl=mixVolume-highMl;
  const mixTolerance=Number.EPSILON*16*Math.max(1,Math.abs(mixVolume),Math.abs(highMl),Math.abs(lowMl));
  if(highMl< -mixTolerance||lowMl< -mixTolerance){error('lowGlucose','Из выбранных растворов глюкозы нельзя получить заданную смесь');highMl=null;lowMl=null;}
  else{highMl=Math.max(0,highMl);lowMl=Math.max(0,lowMl);}
 }
 const baseRate=lineMl!==null&&lineMl>=0&&bh!==null?lineMl/bh:null;
 const glucosePercent=glucoseGrams!==null&&mixVolume!==null&&mixVolume>0?glucoseGrams*100/mixVolume:null;
 const mainLinePercent=glucoseGrams!==null&&lineMl!==null&&lineMl>0?glucoseGrams*100/lineMl:null;
 if(glucosePercent!==null&&glucosePercent>40)error('gir','Итоговая концентрация глюкозы больше 40 %: уменьшите дотацию глюкозы или увеличьте объём жидкости');
 else if(mainLinePercent!==null&&mainLinePercent>12.5)warnings.push('Глюкоза '+mainLinePercent.toLocaleString('ru-RU',{maximumFractionDigits:1})+' % в основной линии — выше 12,5 %, в периферическую вену не рекомендуется (КР 2015, раздел 15)');
 // mytpn: each intravenous antibiotic administration pauses the amino-acid line for half an hour.
 const aaPauses=(p.aaPause??'off')==='on'?medicines.filter(m=>m.valid&&m.group==='antibiotic'&&m.kind==='intermittent'&&m.intravenous&&(numeric(p.medicines.find(x=>x.id===m.id)?.interval??'')??99)<25).reduce((sum,m)=>sum+m.times.length,0)*0.5:0;
 const aaInfusionHours=ah===null?null:ah-aaPauses;
 if(aaInfusionHours!==null&&aaInfusionHours<=0)error('aaHours','Паузы на введение антибиотиков не оставляют времени для аминокислот');
 let aaRate=aaMl===0?0:aaMl!==null&&aaInfusionHours!==null&&aaInfusionHours>0?aaMl/aaInfusionHours:null;
 if(aaRate!==null&&(!Number.isFinite(aaRate)||(aaMl!==null&&aaMl>0&&aaRate===0))){error('aaHours',aaRate===0?'Положительная скорость аминокислот теряется до нуля: проверьте слишком малые значения':'Скорость аминокислот превышает числовой диапазон');aaRate=null;}
 const fatRate=fatLineMl!==null&&fh!==null?fatLineMl/fh:null;
 // The sheet prints rates to the pump step; flag a line or syringe that this rounding moves by 5 % or more.
 const pumpCheck=(name:string,rate:number|null,ml:number|null,hours:number|null)=>{
  if(rate===null||!Number.isFinite(rate)||rate<=0)return;
  if(rate<pumpMinMlPerHour){warnings.push(`${name}: ${ru(rate,3)} мл/ч — меньше минимальной скорости помпы 0,1 мл/ч. Увеличьте объём раствора или сократите время введения.`);return;}
  const set=pumpRate(rate),shift=(set-rate)/rate;
  if(Math.abs(shift)<0.05)return;
  const effect=ml===null||hours===null?`доза будет на ${ru(Math.abs(shift)*100,0)} % ${shift<0?'ниже':'выше'} расчётной`
   :shift<0?`за ${ru(hours)} ч уйдёт ${ru(set*hours)} мл из ${ru(ml)} (−${ru(-shift*100,0)} %)`:`${ru(ml)} мл закончатся за ${ru(ml/set)} ч вместо ${ru(hours)}`;
  warnings.push(`${name}: на помпе ${ru(set)} мл/ч вместо ${ru(rate,3)} — ${effect}. Подберите объём или длительность так, чтобы скорость была кратна 0,1 мл/ч.`);
 };
 pumpCheck('Основная линия',baseRate,lineMl,bh);
 pumpCheck('Аминокислоты',aaRate,aaMl,aaInfusionHours);
 pumpCheck('Жировая эмульсия',fatRate,fatLineMl,fh);
 for(const m of medicines)if(m.valid&&m.kind==='continuous')pumpCheck(m.name,m.rate,null,null);
 const actualGir=glucoseGrams!==null&&kg!==null&&kg>0&&bh!==null?glucoseGrams*1000/kg/(bh*60):null;
 // Углеводная нагрузка (мг/кг/мин за 24 ч, как «Глюкоза общ. / в/в»): общая задана врачом, энтеральная — углеводы учтённой смеси, в/в — остаток.
 const perMin=(grams:number|null)=>grams===null||kg===null||kg<=0?null:grams/(kg*1.44);
 const girTotal=gir,girEnteral=enteralSubtracted.carbohydrateG===null?null:enteralSubtracted.carbohydrateG===0?0:perMin(enteralSubtracted.carbohydrateG),girIv=perMin(glucoseGrams);
 if(girTotal!==null&&girEnteral!==null&&girEnteral>girTotal)warnings.push('Углеводы смеси дают '+ru(girEnteral,1)+' мг/кг/мин — больше заданной общей нагрузки '+ru(girTotal,1)+': глюкозы в/в не будет');
 // Heparin (mytpn/КР): per ml of the main line including amino acids, electrolytes and carrier; never in the lipid line.
 // Component volumes are taken to 0.1 ml, as they are drawn up and printed, so the units match the sheet (and mytpn).
 const tenth=(value:number|null)=>value===null?null:Math.round(value*10)/10;
 const heparinParts=[tenth(mixVolume),tenth(aaMl),tenth(carrierMl),...electrolyteParts.map(tenth)];
 const heparinUnits=heparin!==null&&heparinParts.every(v=>v!==null)?Math.round(heparin*heparinParts.reduce<number>((sum,v)=>sum+v!,0)):null;
 const ivTotal=lineMl!==null&&aaMl!==null&&fatLineMl!==null&&drugMl!==null&&other!==null&&flush!==null?lineMl+aaMl+fatLineMl+drugMl+other+flush:null;
 // Натрий за сутки: NaCl 10 % и 0,9 % в линии, NaCl 0,9 % как меньший раствор и проводник, растворители препаратов (0,9 % = 0,154 ммоль/мл).
 const naPerMl09=0.154;const isSaline=(name:string)=>/nacl/i.test(name);
 let diluentNaMmol:number|null=0;
 for(const med of medicines){
  const m=p.medicines.find(x=>x.id===med.id);if(!m)continue;
  if(!med.valid){diluentNaMmol=null;break;}
  if(!med.intravenous||!isSaline(m.diluent))continue;
  const final=numeric(m.volume);const fraction=med.solventMl!==null&&final?Math.min(1,Math.max(0,med.solventMl)/final):1;
  diluentNaMmol+=(med.fluidVolume??0)*fraction*naPerMl09+(m.loading?(med.loadingDeliveredVolume??0)*naPerMl09:0);
 }
 const lineNaMmol=nacl10!==null&&nacl09!==null&&kg!==null&&lowMl!==null?nacl10*kg+nacl09*kg+(p.lowSolution==='nacl'?lowMl*naPerMl09:0)+(isSaline(carrierName)?(carrierMl??0)*naPerMl09:0):null;
 const sodiumTotal=diluentNaMmol!==null&&lineNaMmol!==null?diluentNaMmol+lineNaMmol:null;
 const sodium={diluentMmol:diluentNaMmol,lineMmol:lineNaMmol,totalMmol:sodiumTotal,perKg:sodiumTotal!==null&&kg?sodiumTotal/kg:null,diluentPerKg:diluentNaMmol!==null&&kg?diluentNaMmol/kg:null};
 const allFluid=ivTotal!==null&&enteralMl!==null?ivTotal+enteralMl:null;
 const receivedPerKg=allFluid!==null&&kgToday!==null&&kgToday>0?allFluid/kgToday:null;
 // Energy by КР 2015 раздел 12 (as in mytpn): glucose 4 kcal/g, fat 9 kcal/g, amino acids not counted, enteral only when counted.
 const krGlucoseKcal=glucoseGrams===null?null:4*glucoseGrams,krFatKcal=fatGrams===null?null:9*fatGrams;
 const krParenteral=krGlucoseKcal!==null&&krFatKcal!==null?krGlucoseKcal+krFatKcal:null;
 const krEnteral=counted?.energyKcal??null;
 const krTotal=krParenteral!==null&&krEnteral!==null?krParenteral+krEnteral:null;
 const kr={glucoseKcal:krGlucoseKcal,fatKcal:krFatKcal,parenteralKcal:krParenteral,enteralKcal:krEnteral,totalKcal:krTotal,perKg:krTotal!==null&&kg!==null&&kg>0?krTotal/kg:null};
 for(const [field,value] of [['fluid',total],['enteral',enteralMl],['aa',aaGrams],['aa',aaMl],['aaHours',aaRate],['fat',fatGrams],['fat',fatMl],['fatHours',fatRate],['gir',glucoseGrams],['calciumMlPerKg',caMl],['calciumContent',calciumMmol],['kcl',electrolytes.kclMl],['nacl10',electrolytes.nacl10Ml],['nacl09',electrolytes.nacl09Ml],['magnesium',electrolytes.mgMl],['soluvit',electrolytes.soluvitMl],['vitalipid',vitalipidMl],['dipeptiven',electrolytes.dipeptivenMl],['fluid',lineMl],['lowGlucose',lowMl],['highGlucose',highMl],['baseHours',baseRate],['gir',glucosePercent],['baseHours',actualGir],['heparin',heparinUnits],['insulin',insulinUnits],['fluid',ivTotal],['weightToday',receivedPerKg]] as [string,number|null][]){if(value!==null&&!Number.isFinite(value))error(field,'Расчёт превышает числовой диапазон');}
 return {valid:errors.length===0,errors,issues,warnings,kg,kgToday,dynamics,day,total,enteralMl,enteralCountedMl,enteralTrophicMl,enteralSubtracted,enteralNutrition,proteinPlan,aaGrams,aaMl,aaRate,aaPauses,aaInfusionHours,fatTotal,fatGrams,fatMl,vitalipidMl,fatLineMl,fatRate,glucoseTotal,glucoseGrams,calciumMmol,calciumMmolPerKg,caMl,electrolytes,carrierName,carrierMl,base:lineMl,overshootMl:overshoot,baseRate,glucosePercent,mainLinePercent,actualGir,girTotal,girEnteral,girIv,mixVolume,lowMl,highMl,lowPercent:low,drugMl,drugsOnTop,insulinUnits,insulinMl,heparinUnits,ivTotal,allFluid,receivedPerKg,kr,medicines,other,flush,sodium};
}
export type Result=ReturnType<typeof calculate>;

/** Administration time for the sheet, in hours as the doctor entered it: 30 min → «0,5 ч». */
export function hoursLabel(minutes:number|null|undefined):string{
 if(minutes===null||minutes===undefined||!Number.isFinite(minutes)||minutes<=0)return '—';
 return new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(minutes/60)+' ч';
}
/** Minutes from the doctor's hours field, or from the legacy minutes field. */
export function enteredMinutes(hours:string|undefined,minutes:string|undefined):number|null{
 const h=String(hours??'').trim();
 if(h!==''){const value=numeric(h);return value!==null&&value>0?value*60:null;}
 return numeric(String(minutes??''));
}
