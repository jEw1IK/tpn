import {formatNumber} from './format.ts';
import {formatDate,nextDate} from './patient-header.ts';
import {calculateMedicine,clock,enteredMinutes,firstOffset,hoursLabel,numeric,scheduleDay,trophicThresholdMlPerKg,type Group,type Inputs,type Medicine,type MedResult,type Result} from './tpn.ts';
import {feedingHours,routeShort} from './directory.ts';

export type NurseHour={index:number;offset:number;label:string;time:string;day:number|null;nextDay:boolean};
export type NurseRow={
 id:string;
 kind:'base'|'amino'|'fat'|'enteral'|'medicine'|'loading'|'other'|'flush'|'insulin';
 label:string;
 details:string[];
 /** Amount entering the balance of these calculation days, never a whole syringe. */
 volume:string;
 rate:string;
 /** Empty cells are reserved for handwritten execution marks by a nurse. */
 marks:string[];
 medicineId?:string;
 group?:Group;
 /** Full reference text, printed after the table without clipping or shortening. */
 notes?:string[];
};

const validTime=(value:string)=>/^\d{2}:\d{2}$/.test(value)&&Number(value.slice(0,2))<24&&Number(value.slice(3))<60;
const entered=(value:string)=>value.trim().replaceAll('.',',')||'—';
const formulaNote=(formula:{name:string;source:string})=>formula.source?`Источник состава смеси ${formula.name}: ${formula.source}`:`Состав смеси ${formula.name} с этикеткой производителя не сверен.`;
const cells=()=>Array<string>(24).fill('');
/** Feeding volumes land in the hour cells of their clock times (09:00, 12:00, … as on the mytpn sheet). */
export function feedingMarks(feeds:readonly string[],start:string):string[]{
 const marks=cells();if(!validTime(start))return marks;
 const begin=Number(start.slice(0,2))*60+Number(start.slice(3));
 feedingHours.forEach((hour,index)=>{const value=(feeds[index]??'').trim();if(!value||numeric(value)===null||numeric(value)===0)return;const at=Number(hour.slice(0,2))*60+Number(hour.slice(3));const offset=((at-begin)%1440+1440)%1440;marks[Math.floor(offset/60)]=value.replaceAll('.',',');});
 return marks;
}
export const lowSolutionLabel=(p:Inputs)=>p.lowSolution==='water'?'Вода для инъекций':p.lowSolution==='nacl'?'NaCl 0,9%':`Глюкоза ${entered(p.lowGlucose)}%`;
export function electrolyteLines(p:Inputs,r:Result,show:(value:number|null|undefined,digits?:number)=>string):string[]{
 const e=r.electrolytes;const items:[string,number|null,string,string][]=[['KCl 4%',e.kclMl,p.kcl,'ммоль/кг'],['NaCl 10%',e.nacl10Ml,p.nacl10,'ммоль/кг'],['NaCl 0,9%',e.nacl09Ml,p.nacl09,'ммоль/кг'],['MgSO₄ 25%',e.mgMl,p.magnesium,'мл/кг'],['Солувит Н',e.soluvitMl,p.soluvit,'мл/кг'],['Дипептивен',e.dipeptivenMl,p.dipeptiven,'мл/кг'],['Аддамель Н',e.addamelMl,p.addamel,'мл']];
 const used=items.filter(([,,dose])=>numeric(dose)!==0).map(([label,ml,dose,unit])=>`${label} ${show(ml)} мл (${entered(dose)} ${unit})`);
 if(r.carrierName)used.push(`проводник ${r.carrierName} ${show(r.carrierMl)} мл сверх потребности`);
 return used.length?[`Электролиты и витамины в основной линии: ${used.join('; ')}.`]:[];
}

/** Hourly columns are anchored to the chosen calculation start, not rounded to a clock hour. */
export function buildNurseHours(start:string):NurseHour[]{
 return Array.from({length:24},(_,index)=>{
  const offset=index*60,day=scheduleDay(offset,start);
  const time=validTime(start)?clock(offset,start):'—';
  const concise=time.endsWith(':00')?time.slice(0,2):time;
  return {index,offset,label:concise+(day!==null&&day>0?'⁺¹':''),time,day,nextDay:day!==null&&day>0};
 });
}

function eventTime(offset:number|null,start:string,date:string):string{
 if(offset===null||!validTime(start))return '—';
 const day=scheduleDay(offset,start);
 const calendar=day===0?formatDate(date):day===1?nextDate(date):'—';
 return calendar==='—'?clock(offset,start)+(day!==null&&day>0?' (+1 сут)':''):calendar+' '+clock(offset,start);
}

function medicineDetails(m:Medicine,med:MedResult|undefined,ready:boolean,start:string,date:string):string[]{
 const show=(value:number|null|undefined,digits=4)=>formatNumber(ready?value:null,digits);
 const periodic=m.mode==='intermittent';
 if(med?.kind==='blood'){
  return [
   `${entered(m.dose)} мл/кг → ${show(med.volume,3)} мл; ${routeShort(m.route)||'путь не указан'}; скорость ${show(med.rate,1)} мл/ч.`,
   ready?`Начало: ${med.times.length?eventTime(med.times[0],start,date):'—'}. Объём трансфузии в суточную жидкость не входит.`:'Время введения не рассчитано.',
  ];
 }
 const unitLabel=med?.doseLabel||'мг';const minutes=med?.minutes??enteredMinutes(m.infusionHours,m.minutes);
 const details=[
  `${entered(m.dose)} ${m.unit} → ${show(periodic?med?.doseAmount:med?.amountMg)} ${periodic?unitLabel:'мг'} ${periodic?'на введение':'в шприце'}; ${routeShort(m.route)||'путь не указан'}; ${periodic?`каждые ${entered(m.interval)} ч${minutes!==null&&minutes>0?`, за ${hoursLabel(minutes)}`:''}`:`инфузия ${entered(m.hours)} ч`}.`,
  med&&!med.intravenous?`Путь вне вены: объём в жидкость суток не входит${m.volume.trim()?`; разведение ${entered(m.volume)} мл`:''}.`:`Раствор ${entered(m.volume)} мл${med?.concentration!=null?`, ${show(med.concentration)} мг/мл`:''}; ${m.diluent.trim()||'растворитель не задан'}.`,
 ];
 if(m.stock.trim()){
  details.push(`Исходный ${entered(m.stock)} мг/мл: препарат ${show(med?.stockMl)} мл + растворитель ${show(med?.solventMl)} мл.`);
 }else details.push('Исходная концентрация не задана; разведение не рассчитано.');
 if(periodic){
  if(ready&&med){
   details.push(`Введения: ${med.times.map(t=>eventTime(t,start,date)).join(' · ')||'—'}; в сутки ${show(med.amountMg)} мг.`);
   const partial=med.minutes!==null?med.times.filter(t=>t+med.minutes!>1440):[];
   if(partial.length)details.push(`С ${partial.map(t=>eventTime(t,start,date)).join(' · ')} введение продолжается за границей суток; учтена только часть до их окончания.`);
  }else details.push(`Введения не рассчитаны; первое ${validTime(m.first)?m.first:'—'}; в сутки — мг.`);
 }else{
  details.push(`Шприц на ${show(med?.syringeHours,3)} ч; на заданную длительность ${show(med?.syringeCount,0)} шпр.`);
 }
 return details;
}

/** Adapt the existing calculation only: no new dose formulas or inferred administration times. */
export function buildNurseRows(p:Inputs,r:Result):NurseRow[]{
 const ready=r.valid;
 const show=(value:number|null|undefined,digits=3)=>formatNumber(ready?value:null,digits);
 const make=(row:Omit<NurseRow,'marks'>):NurseRow=>({...row,marks:cells()});
 const rows:NurseRow[]=[
  make({id:'base',kind:'base',label:'Основная линия: глюкоза + электролиты',volume:show(r.base),rate:show(r.baseRate,1),details:[
   `${lowSolutionLabel(p)}: ${show(r.lowMl)} мл; глюкоза ${entered(p.highGlucose)}%: ${show(r.highMl)} мл.`,
   `Глюконат кальция 10 %: ${entered(p.calciumMlPerKg)} мл/кг/сут → ${show(r.caMl)} мл; по ${entered(p.calciumContent)} ммоль/мл это ${show(r.calciumMmol)} ммоль (${show(r.calciumMmolPerKg,2)} ммоль/кг).`,
   ...electrolyteLines(p,r,show),
   `Глюкоза в/в за сутки: ${show(r.glucoseGrams)} г${r.enteralSubtracted.carbohydrateG?` (общая ${show(r.glucoseTotal)} г минус ${show(r.enteralSubtracted.carbohydrateG)} г из смеси)`:''}; концентрация ${show(r.glucosePercent)}% в растворе глюкозы, ${show(r.mainLinePercent)}% во всей линии.`,
   `Вводить за ${entered(p.baseHours)} ч; GIR за время введения ${show(r.actualGir)} мг/кг/мин. Гепарин ${entered(p.heparin)} Ед/мл → ${ready&&r.heparinUnits!==null?r.heparinUnits:'—'} Ед на линию с аминокислотами.`,
  ]}),
  make({id:'amino',kind:'amino',label:ready&&r.aaMl===0?'Аминокислоты в/в · не требуются':`Аминокислоты ${entered(p.aaPercent)}%`,volume:show(r.aaMl),rate:ready&&r.aaMl===0?'—':show(r.aaRate,1),details:ready&&r.aaMl===0?[
   'Дополнительные аминокислоты в/в не требуются: общая цель белка покрыта другими источниками.',
  ]:[
   `${show(r.proteinPlan.requiredIvPerKg)} г/кг/сут → ${show(r.aaGrams)} г; вводить за ${entered(p.aaHours)} ч.${r.aaPauses?` Паузы на в/в антибиотики ${show(r.aaPauses,1)} ч: фактически за ${show(r.aaInfusionHours,1)} ч.`:''}`,
  ]}),
  make({id:'fat',kind:'fat',label:`Жировая эмульсия ${entered(p.fatPercent)}%${r.vitalipidMl?' + Виталипид':''}`,volume:show(r.fatLineMl),rate:show(r.fatRate,1),details:[
   `${entered(p.fat)} г/кг/сут → ${show(r.fatGrams)} г${r.enteralSubtracted.fatG?` в/в (общая ${show(r.fatTotal)} г минус ${show(r.enteralSubtracted.fatG)} г из смеси)`:''}; ${show(r.fatMl)} мл эмульсии${r.vitalipidMl?` + Виталипид ${entered(p.vitalipid)} мл/кг → ${show(r.vitalipidMl)} мл`:''}; вводить за ${entered(p.fatHours)} ч.`,
  ]}),
 ];
 const en=r.enteralNutrition;
 const enteralDetails=[en.formula?.name||'Смесь не выбрана.'];
 if(p.enteralMode==='feeds')enteralDetails.push(`${entered(p.feedingMl)} мл на кормление × ${entered(p.feedingCount)} кормлений. Часы кормлений отмечаются вручную.`);
 else if(p.enteralMode==='feeds8')enteralDetails.push(`Кормления (мл): ${feedingHours.map((hour,index)=>`${hour} — ${entered(p.feeds[index]??'')}`).join('; ')}${p.feedingRoute?`; способ: ${p.feedingRoute}`:''}.`);
 else enteralDetails.push(p.enteralMode==='daily'?`Введённый объём: ${entered(p.enteralVolume)} мл/сут. Часы кормлений отмечаются вручную.`:`Введённый объём: ${entered(p.enteral)} мл/кг/сут. Часы кормлений отмечаются вручную.`);
 enteralDetails.push(`Объём на килограмм: ${show(en.volumePerKg)} мл/кг/сут (всего со всеми смесями ${show(en.volumeMl)} мл).`);
 if(ready&&en.volumeMl!==null&&en.volumeMl>0)enteralDetails.push(en.counted?`От ${trophicThresholdMlPerKg} мл/кг: объём вычтен из суточной жидкости, белок, жиры и углеводы смеси — из в/в доз.`:`Трофическое питание (меньше ${trophicThresholdMlPerKg} мл/кг): сверх расчётной жидкости, нутриенты в парентеральном расчёте не учтены.`);
 if(en.formula&&en.primaryDaily)enteralDetails.push(`За сутки: белок ${show(en.primaryDaily.proteinG)} г; жиры ${show(en.primaryDaily.fatG)} г; углеводы ${show(en.primaryDaily.carbohydrateG)} г; энергия ${show(en.primaryDaily.energyKcal)} ккал.`);
 if(en.formula&&en.perKg)enteralDetails.push(`На кг/сут (все смеси): белок ${show(en.perKg.proteinG)} г; жиры ${show(en.perKg.fatG)} г; углеводы ${show(en.perKg.carbohydrateG)} г; энергия ${show(en.perKg.energyKcal)} ккал.`);
 rows.push({...make({id:'enteral',kind:'enteral',label:'Энтеральное питание',details:ready&&!en.formula&&r.enteralMl===0?[]:enteralDetails,volume:show(en.primaryMl),rate:'—',
  notes:en.formula?[formulaNote(en.formula)]:undefined}),marks:p.enteralMode==='feeds8'?feedingMarks(p.feeds,p.start):cells()});
 for(const row of p.extraFeeds??[]){
  const res=en.rows.find(x=>x.id===row.id);
  rows.push({...make({id:'enteral-'+row.id,kind:'enteral',label:`Смесь: ${res?.formula?.name??'не выбрана'}`,volume:show(res?.volumeMl),rate:'—',details:[
   `Кормления (мл): ${feedingHours.map((hour,index)=>`${hour} — ${entered(row.feeds[index]??'')}`).join('; ')}${row.route?`; способ: ${row.route}`:''}.`,
   ...(res?.daily?[`За сутки: белок ${show(res.daily.proteinG)} г; жиры ${show(res.daily.fatG)} г; углеводы ${show(res.daily.carbohydrateG)} г; энергия ${show(res.daily.energyKcal)} ккал.`]:[]),
  ],notes:res?.formula?[formulaNote(res.formula)]:undefined}),marks:feedingMarks(row.feeds,p.start)});
 }
 if(ready&&r.insulinMl!==null&&r.insulinMl>0)rows.push(make({id:'insulin',kind:'insulin',label:'Инсулин',volume:show(r.insulinMl),rate:'0,5',details:[`${entered(p.insulin)} Ед/кг/ч → ${show(r.insulinUnits)} Ед/сут в 12 мл воды для инъекций; 0,5 мл/ч.`]}));
 for(const m of p.medicines){
  const med=r.medicines.find(result=>result.id===m.id);
  const medicationReady=ready&&med?.valid===true;
  // Read maintenance directly: subtracting a large load from the rounded total can erase a small positive volume.
  const maintenance=medicationReady?calculateMedicine({...m,loading:false},r.kg??NaN,p.start):undefined;
  const maintenanceVolume=maintenance?.valid?maintenance.volume:null;
  rows.push(make({id:m.id,kind:'medicine',label:med?.name||m.drug,medicineId:m.id,group:m.group,
   details:medicineDetails(m,med,medicationReady,p.start,p.sheetDate),volume:formatNumber(medicationReady?(med?.kind==='blood'?med.volume:maintenance?.valid?maintenance.fluidVolume:null):null,3),rate:formatNumber(medicationReady?med?.rate:null,1)}));
  if(m.loading){
   const loadShow=(value:number|null|undefined,digits=4)=>formatNumber(medicationReady?value:null,digits);
   const source=m.loadingSource.trim();
   rows.push(make({id:m.id+'-loading',kind:'loading',label:(med?.name||m.drug)+' · нагрузка',medicineId:m.id,group:m.group,
    volume:loadShow(med?.loadingDeliveredVolume,3),rate:loadShow(med?.loadingRate,1),details:[
     `${entered(m.loadingDose)} ${m.unit.startsWith('мкг')?'мкг/кг':'мг/кг'} → ${loadShow(med?.loadingMg)} мг; ${m.route.trim()||'путь не указан'}.`,
     `Полный объём нагрузки ${entered(m.loadingVolume)} мл; вводить за ${hoursLabel(enteredMinutes(m.loadingHours,m.loadingMinutes))}. Начало: ${eventTime(firstOffset(m.loadingFirst,p.start),p.start,p.sheetDate)}.`,
     `Растворитель: ${m.diluent.trim()||'не задан'}; исходная концентрация ${m.stock.trim()?entered(m.stock)+' мг/мл':'не задана'}.`,
     `В эти сутки поступает ${loadShow(med?.loadingDeliveredMg)} мг и ${loadShow(med?.loadingDeliveredVolume,3)} мл. Остаток после конца суток не включён в эту строку.`,
     source?'Источник схемы — в примечании к нагрузке.':'Источник схемы не задан.',
    ],notes:source?[`Источник схемы: ${source}`]:undefined}));
  }
 }
 if(numeric(p.other)!==0)rows.push(make({id:'other',kind:'other',label:'Прочая жидкость',details:['Состав, путь и время введения заполняются вручную.'],volume:show(r.other),rate:'—'}));
 if(numeric(p.flush)!==0)rows.push(make({id:'flush',kind:'flush',label:'Промывки',details:['Суммарный объём за сутки; время выполнения отмечается вручную.'],volume:show(r.flush),rate:'—'}));
 return rows;
}

/** A conservative layout estimate; references are printed as separate notes, not inside grid cells. */
export function estimateNurseRowLines(row:NurseRow):number{
 return Math.max(1,Math.ceil(row.label.length/55))+row.details.reduce((sum,line)=>sum+Math.max(1,Math.ceil(line.length/85)),0);
}

/** Keep whole row descriptions. Long rows occupy their own page rather than losing text. */
export function chunkNurseRows(rows:readonly NurseRow[],maxRows=12,lineBudget=maxRows*5):NurseRow[][]{
 if(!Number.isInteger(maxRows)||maxRows<1||!Number.isFinite(lineBudget)||lineBudget<1)throw new RangeError('Page limits must be positive');
 const pages:NurseRow[][]=[];let current:NurseRow[]=[],lines=0;
 for(const row of rows){
  const nextLines=estimateNurseRowLines(row);
  if(current.length&&(current.length>=maxRows||lines+nextLines>lineBudget)){pages.push(current);current=[];lines=0;}
  current.push(row);lines+=nextLines;
 }
 if(current.length)pages.push(current);
 return pages;
}
