import {formatNumber} from './format.ts';
import {buildNurseRows,electrolyteLines,feedingMarks,lowSolutionLabel,type NurseRow} from './nurse-sheet.ts';
import {feedingHours,routeShort} from './directory.ts';
import {clock,enteredMinutes,firstOffset,hoursLabel,numeric,scheduleDay,type Group,type Inputs,type Result} from './tpn.ts';

export type WorkingRow={
 id:string;
 kind:NurseRow['kind'];
 label:string;
 /** Short administration instructions. Newlines separate at most three semantic lines. */
 instruction:string;
 /** Volume entering the balance of these calculation days, not the prepared dose or syringe. */
 volume:string;
 rate:string;
 /** Explicit prescribed start times only; +1 denotes the following calendar date. */
 timing:string[];
 partial:boolean;
 medicineId?:string;
 group?:Group;
 preparedVolume?:string;
 preparation?:string;
 /** Pre-filled hour cells (feeding volumes); empty strings stay blank for manual marks. */
 marks?:string[];
 warning?:string;
 /** Full references are for the optional appendix, not the hourly execution grid. */
 notes?:string[];
};
export type WorkingRows={infusion:WorkingRow[];medication:WorkingRow[];support:WorkingRow[]};

const entered=(value:string)=>value.trim().replaceAll('.',',')||'—';
const routeLabel=(route:string)=>routeShort(route)||'путь не указан';
function clockTime(offset:number|null,start:string):string{
 if(offset===null)return '—';
 const day=scheduleDay(offset,start);if(day===null)return '—';
 return clock(offset,start)+(day>0?' +1':'');
}

/** A compact working view of the existing calculation. Full descriptions remain in buildNurseRows. */
export function buildWorkingRows(p:Inputs,r:Result):WorkingRows{
 const fullRows=buildNurseRows(p,r);
 const full=(id:string)=>fullRows.find(row=>row.id===id)!;
 const show=(value:number|null|undefined,digits=3)=>formatNumber(r.valid?value:null,digits);
 const make=(row:NurseRow,instruction:string,extra:Partial<WorkingRow>={}):WorkingRow=>({
  id:row.id,kind:row.kind,label:row.label,instruction,volume:row.volume,rate:row.rate,timing:[],partial:false,
  ...(row.medicineId?{medicineId:row.medicineId,group:row.group}:{}),...(row.notes?{notes:row.notes}:{}),...extra,
 });
 // Working sheet: what the nurse draws up and when. Volumes to 0.1 ml as on the syringe; full precision is in the appendix.
 const ml=(value:number|null|undefined)=>show(value,1);
 const e=r.electrolytes;
 const electrolytes=([
  ['Ca глюконат 10%',e.caMl,p.calciumMlPerKg,'мл/кг'],['KCl 4%',e.kclMl,p.kcl,'ммоль/кг'],['NaCl 10%',e.nacl10Ml,p.nacl10,'ммоль/кг'],['NaCl 0,9%',e.nacl09Ml,p.nacl09,'ммоль/кг'],
  ['MgSO₄ 25%',e.mgMl,p.magnesium,'мл/кг'],['Солувит',e.soluvitMl,p.soluvit,'мл/кг'],['Дипептивен',e.dipeptivenMl,p.dipeptiven,'мл/кг'],['Аддамель',e.addamelMl,p.addamel,'мл'],
 ] as [string,number|null,string,string][]).filter(([,,dose])=>numeric(dose)!==0).map(([label,volume,dose,unit])=>`${label} ${ml(volume)} мл (${entered(dose)} ${unit})`);
 const infusion=[
  make(full('base'),[
   `${lowSolutionLabel(p)} ${ml(r.lowMl)} + глюкоза ${entered(p.highGlucose)}% ${ml(r.highMl)}${r.electrolytes.sumMl?` + электролиты ${ml(r.electrolytes.sumMl)}`:''}${r.carrierMl?` + проводник ${ml(r.carrierMl)}`:''} мл`,
   ...(electrolytes.length?[electrolytes.join('; ')]:[]),
   `За ${entered(p.baseHours)} ч · глюкоза ${show(r.glucoseGrams,2)} г, ${show(r.mainLinePercent,1)}% · GIR ${show(r.actualGir,1)} · гепарин ${r.valid&&r.heparinUnits!==null?r.heparinUnits:'—'} Ед`,
  ].join('\n')),
  ...(!r.valid||r.aaMl!==0?[make(full('amino'),`${show(r.proteinPlan.requiredIvPerKg)} г/кг/сут → ${show(r.aaGrams)} г · за ${r.aaPauses?`${show(r.aaInfusionHours,1)} ч (паузы на антибиотики ${show(r.aaPauses,1)} ч)`:`${entered(p.aaHours)} ч`}`)]:[]),
  make(full('fat'),`${entered(p.fat)} г/кг/сут → ${show(r.fatGrams)} г${r.enteralSubtracted.fatG?' в/в после смеси':''} · эмульсия ${ml(r.fatMl)} мл${r.vitalipidMl?` + Виталипид ${ml(r.vitalipidMl)} мл`:''} · за ${entered(p.fatHours)} ч`),
  ...(r.valid&&r.insulinMl?[make(full('insulin'),`${entered(p.insulin)} Ед/кг/ч → ${show(r.insulinUnits)} Ед/сут в 12 мл воды для инъекций · 0,5 мл/ч`)]:[]),
 ];
 const medication:WorkingRow[]=[];
 for(const m of p.medicines){
  const med=r.medicines.find(result=>result.id===m.id),ready=r.valid&&med?.valid===true;
  const medShow=(value:number|null|undefined,digits=4)=>formatNumber(ready?value:null,digits);
  const periodic=m.mode==='intermittent',row=full(m.id),blood=med?.kind==='blood';
  const partial=ready&&periodic&&!blood&&med?.minutes!==null&&med?.minutes!==undefined&&med.times.some(t=>t+med.minutes!>1440);
  const warning=partial?`${med!.times.length>1?'Последнее введение частично; всего':'Часть'} за сутки ${row.volume} мл; полный объём введения ${entered(m.volume)} мл.`:undefined;
  const timing=ready&&(periodic||blood)?med!.times.map(t=>clockTime(t,p.start)):[];
  const when=timing.length?timing.join(', '):(periodic||blood?'время —':'');
  const minutes=med?.minutes??enteredMinutes(m.infusionHours,m.minutes);
  const over=minutes!==null&&minutes>0&&!/\(за /.test(m.route)?` за ${hoursLabel(minutes)}`:'';
  const instruction=blood?[
   `${medShow(med?.volume,3)} мл (${entered(m.dose)} мл/кг) · ${routeLabel(m.route)} · ${medShow(med?.rate,1)} мл/ч`,
   `Вне баланса жидкости · ${when}`,
  ].join('\n'):periodic?[
   `${medShow(med?.doseAmount)} ${med?.doseLabel||'мг'} на введение (${entered(m.dose)} ${m.unit}) · ${routeLabel(m.route)}${over} · каждые ${entered(m.interval)} ч`,
   med&&!med.intravenous?`Вне баланса жидкости${m.volume.trim()?` · разведение ${entered(m.volume)} мл`:''} · ${when}`:`Раствор до ${entered(m.volume)} мл: ${m.diluent.trim()||'растворитель не задан'} · ${when}`,
   ...(warning?[warning]:[]),
  ].join('\n'):[
   `${medShow(med?.amountMg)} мг в шприце (${entered(m.dose)} ${m.unit}) · ${routeLabel(m.route)} · инфузия ${entered(m.hours)} ч`,
   `Шприц до ${entered(m.volume)} мл: ${m.diluent.trim()||'растворитель не задан'} · шприц на ${medShow(med?.syringeHours,3)} ч`,
  ].join('\n');
  medication.push(make(row,instruction,{timing,partial,warning,preparedVolume:entered(m.volume),
   ...(m.stock.trim()?{preparation:`${entered(m.stock)} мг/мл: препарат ${medShow(med?.stockMl)} мл + растворитель ${medShow(med?.solventMl)} мл.`}:{})}));
  if(m.loading){
   const load=full(m.id+'-loading'),offset=firstOffset(m.loadingFirst,p.start),loadMinutes=enteredMinutes(m.loadingHours,m.loadingMinutes);
   const loadPartial=ready&&offset!==null&&loadMinutes!==null&&offset+loadMinutes>1440;
   const loadWarning=loadPartial?`Часть за сутки ${load.volume} мл (${medShow(med?.loadingDeliveredMg)} мг); полный объём нагрузки ${entered(m.loadingVolume)} мл.`:undefined;
   const loadTiming=ready?[clockTime(offset,p.start)]:[];
   medication.push(make(load,[
    `${medShow(med?.loadingMg)} мг на нагрузку (${entered(m.loadingDose)} ${m.unit.startsWith('мкг')?'мкг/кг':'мг/кг'}) · ${routeLabel(m.route)} · за ${hoursLabel(loadMinutes)}`,
    `Раствор до ${entered(m.loadingVolume)} мл: ${m.diluent.trim()||'растворитель не задан'} · ${loadTiming.length?loadTiming.join(', '):'время —'}`,
    ...(loadWarning?[loadWarning]:[]),
   ].join('\n'),{timing:loadTiming,partial:loadPartial,warning:loadWarning,preparedVolume:entered(m.loadingVolume),
    preparation:m.stock.trim()?`Исходный препарат ${entered(m.stock)} мг/мл.`:undefined}));
  }
 }
 const support:WorkingRow[]=[];
 const en=r.enteralNutrition,enteral=full('enteral');
 const feeding=p.enteralMode==='feeds'?`${entered(p.feedingMl)} мл × ${entered(p.feedingCount)} кормлений`:
  p.enteralMode==='feeds8'?`по часам: ${feedingHours.map((hour,index)=>`${hour.slice(0,2)}ʰ ${entered(p.feeds[index]??'')}`).join(' · ')} мл${p.feedingRoute?`; ${p.feedingRoute.toLowerCase()}`:''}`:
  p.enteralMode==='daily'?`${entered(p.enteralVolume)} мл/сут`:`${entered(p.enteral)} мл/кг/сут`;
 const trophicNote=r.valid&&en.volumeMl?(en.counted?'':' Трофическое: сверх расчётной жидкости, нутриенты в ПП не учтены.'):'';
 support.push(make(enteral,r.valid&&!en.formula&&r.enteralMl===0?'':`${en.formula?.name||'Смесь не выбрана'}; ${feeding}.${trophicNote}`,{marks:p.enteralMode==='feeds8'?feedingMarks(p.feeds,p.start):undefined}));
 for(const row of p.extraFeeds){
  const extra=fullRows.find(x=>x.id==='enteral-'+row.id);if(!extra)continue;
  support.push(make(extra,`${extra.label.replace('Смесь: ','')}; по часам: ${feedingHours.map((hour,index)=>`${hour.slice(0,2)}ʰ ${entered(row.feeds[index]??'')}`).join(' · ')} мл${row.route?`; ${row.route.toLowerCase()}`:''}.`,{marks:feedingMarks(row.feeds,p.start)}));
 }
 for(const row of fullRows.filter(row=>row.kind==='other'||row.kind==='flush'))support.push(make(row,
  row.kind==='flush'?'Суммарный объём промывок за сутки.':'Состав и путь введения заполнить вручную.'));
 return {infusion,medication,support};
}
