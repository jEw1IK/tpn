import {formatNumber,formatConcentration} from './format.ts';
import {buildNurseRows,electrolyteLines,feedingMarks,lowSolutionLabel,type NurseRow} from './nurse-sheet.ts';
import {feedingHours,routeShort,takesDilution} from './directory.ts';
import {clock,enteredMinutes,firstOffset,hoursLabel,numeric,scheduleDay,type Group,type Inputs,type Result} from './tpn.ts';

export type WorkingRow={
 id:string;
 kind:NurseRow['kind'];
 label:string;
 /** Short administration instructions. Newlines separate at most three semantic lines. */
 instruction:string;
 /** Что набрать, построчно: название и объём. На печати идёт крупно, вместо первой строки instruction. */
 recipe?:[string,string][];
 /** Остальное из instruction, когда есть recipe: путь, время, скорость, расчётные величины. */
 detail?:string;
 /** Препараты на печати в одну строку: доза справа от названия и строка «что набрать · путь · кратность». Время — стрелками в клетках часов. */
 dose?:string;
 brief?:string;
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
 const show=(value:number|null|undefined,digits=2)=>formatNumber(r.valid?value:null,digits);
 const make=(row:NurseRow,instruction:string,extra:Partial<WorkingRow>={}):WorkingRow=>({
  id:row.id,kind:row.kind,label:row.label,instruction,volume:row.volume,rate:row.rate,timing:[],partial:false,
  ...(row.medicineId?{medicineId:row.medicineId,group:row.group}:{}),...(row.notes?{notes:row.notes}:{}),...extra,
 });
 // Working sheet: what the nurse draws up and when. Volumes to 0.1 ml as on the syringe; full precision is in the appendix.
 const ml=(value:number|null|undefined)=>show(value,1);
 const e=r.electrolytes;
 const electrolyteList=([
  ['Ca глюконат 10%',e.caMl,p.calciumMlPerKg,'мл/кг'],['KCl 4%',e.kclMl,p.kcl,'ммоль/кг'],['NaCl 10%',e.nacl10Ml,p.nacl10,'ммоль/кг'],['NaCl 0,9%',e.nacl09Ml,p.nacl09,'ммоль/кг'],
  ['MgSO₄ 25%',e.mgMl,p.magnesium,'мл/кг'],['Солувит',e.soluvitMl,p.soluvit,'мл/кг'],['Дипептивен',e.dipeptivenMl,p.dipeptiven,'мл/кг'],['Аддамель',e.addamelMl,p.addamel,'мл'],
 ] as [string,number|null,string,string][]).filter(([,,dose])=>numeric(dose)!==0);
 const electrolytes=electrolyteList.map(([label,volume,dose,unit])=>`${label} ${ml(volume)} мл (${entered(dose)} ${unit})`);
 const electrolyteRecipe=electrolyteList.map(([label,volume]):[string,string]=>[label,`${ml(volume)} мл`]);
 const baseRecipe:[string,string][]=[
  [lowSolutionLabel(p),`${ml(r.lowMl)} мл`],[`Глюкоза ${entered(p.highGlucose)}%`,`${ml(r.highMl)} мл`],
  ...electrolyteRecipe,...(r.carrierMl?[[`Проводник${r.carrierName?` ${r.carrierName}`:''}`,`${ml(r.carrierMl)} мл`] as [string,string]]:[]),
  ['Гепарин',`${r.valid&&r.heparinUnits!==null?r.heparinUnits:'—'} Ед`],
 ];
 const baseDetail=`За ${entered(p.baseHours)} ч · глюкоза ${show(r.glucoseGrams,2)} г, ${show(r.glucosePercent,2)}% в растворе глюкозы, ${show(r.mainLinePercent,2)}% в линии · GIR ${show(r.actualGir,1)} · гепарин ${r.valid&&r.heparinUnits!==null?r.heparinUnits:'—'} Ед`;
 const infusion=[
  make(full('base'),[
   `${lowSolutionLabel(p)} ${ml(r.lowMl)} + глюкоза ${entered(p.highGlucose)}% ${ml(r.highMl)}${r.electrolytes.sumMl?` + электролиты ${ml(r.electrolytes.sumMl)}`:''}${r.carrierMl?` + проводник ${ml(r.carrierMl)}`:''} мл`,
   ...(electrolytes.length?[electrolytes.join('; ')]:[]),
   baseDetail,
  ].join('\n'),{recipe:baseRecipe.filter(e=>e[1]!=='0 мл'),detail:`За ${entered(p.baseHours)} ч · ${show(r.glucosePercent,2)}% в р-ре глюкозы, ${show(r.mainLinePercent,2)}% в линии · GIR ${show(r.actualGir,1)}`}),
  ...(!r.valid||r.aaMl!==0?[(()=>{const aaText=`${show(r.proteinPlan.requiredIvPerKg)} г/кг/сут → ${show(r.aaGrams)} г · за ${r.aaPauses?`${show(r.aaInfusionHours,1)} ч (паузы на антибиотики ${show(r.aaPauses,1)} ч)`:`${entered(p.aaHours)} ч`}`;
   return make(full('amino'),aaText,{recipe:[[`Аминокислоты ${entered(p.aaPercent)}%`,`${ml(r.aaMl)} мл`]],detail:aaText});})()]:[]),
  ...(r.valid&&r.fatLineMl===0?[]:[make(full('fat'),`${entered(p.fat)} г/кг/сут → ${show(r.fatGrams)} г${r.enteralSubtracted.fatG?' в/в после смеси':''} · эмульсия ${ml(r.fatMl)} мл${r.vitalipidMl?` + Виталипид ${ml(r.vitalipidMl)} мл`:''} · за ${entered(p.fatHours)} ч`,
   {recipe:[[`Жировая эмульсия ${entered(p.fatPercent)}%`,`${ml(r.fatMl)} мл`],...(r.vitalipidMl?[['Виталипид',`${ml(r.vitalipidMl)} мл`] as [string,string]]:[])],detail:`${entered(p.fat)} г/кг/сут → ${show(r.fatGrams)} г${r.enteralSubtracted.fatG?' в/в после смеси':''} · за ${entered(p.fatHours)} ч`})]),
  ...(r.valid&&r.insulinMl?[make(full('insulin'),`${entered(p.insulin)} Ед/кг/ч → ${show(r.insulinUnits)} Ед/сут в 12 мл воды для инъекций · 0,5 мл/ч`)]:[]),
 ];
 const medication:WorkingRow[]=[];
 for(const m of p.medicines){
  const med=r.medicines.find(result=>result.id===m.id),ready=r.valid&&med?.valid===true;
  const medShow=(value:number|null|undefined,digits=2)=>formatNumber(ready?value:null,digits);
  const periodic=m.mode==='intermittent',row=full(m.id),blood=med?.kind==='blood';
  const partial=ready&&periodic&&!blood&&med?.minutes!==null&&med?.minutes!==undefined&&med.times.some(t=>t+med.minutes!>1440);
  const warning=partial?`${med!.times.length>1?'Последнее введение частично; всего':'Часть'} за сутки ${row.volume} мл; полный объём введения ${entered(m.volume)} мл.`:undefined;
  const timing=ready&&(periodic||blood)?med!.times.map(t=>clockTime(t,p.start)):[];
  const when=timing.length?timing.join(', '):(periodic||blood?'время —':'');
  const minutes=med?.minutes??enteredMinutes(m.infusionHours,m.minutes);
  const over=minutes!==null&&minutes>0&&!/\(за /.test(m.route)?` за ${hoursLabel(minutes)}`:'';
  // На листе — что набрать и когда: мг и мл без расчётных дозировок на кг; дозы на кг остаются в калькуляторе и приложении.
  // Без разведения: внесосудистые пути, а также в/м без указанного объёма
  const oral=!takesDilution(m.route)||(!(med?.intravenous??false)&&!m.volume.trim());
  const diluent=m.diluent.trim()||'растворитель не задан';
  const instruction=blood?[
   `${medShow(med?.volume,3)} мл · ${routeLabel(m.route)} · ${medShow(med?.rate,1)} мл/ч`,
   `Вне баланса жидкости · ${when}`,
  ].join('\n'):periodic?[
   `${medShow(med?.doseAmount)} ${med?.doseLabel||'мг'} на введение · ${routeLabel(m.route)}${over} · каждые ${entered(m.interval)} ч`,
   oral?`Без разведения${med&&!med.intravenous?', вне баланса жидкости':''} · ${when}`:`${m.stock.trim()?`препарат ${medShow(med?.stockMl,2)} мл + ${diluent} ${medShow(med?.solventMl,2)} мл = ${entered(m.volume)} мл`:`${diluent} до ${entered(m.volume)} мл`} · ${when}`,
   ...(warning?[warning]:[]),
  ].join('\n'):[
   `${m.stock.trim()?`${medShow(med?.amountMg,2)} мг (${medShow(med?.stockMl,2)} мл) + ${diluent} ${medShow(med?.solventMl,2)} мл = ${entered(m.volume)} мл`:`${medShow(med?.amountMg,2)} мг в ${diluent} до ${entered(m.volume)} мл`} · ${formatConcentration(med?.concentration)}`,
   `${routeLabel(m.route)} · ${medShow(med?.rate,1)} мл/ч · инфузия ${entered(m.hours)} ч · шприц на ${medShow(med?.syringeHours,1)} ч`,
  ].join('\n');
  const stockRow=(mlValue:number|null|undefined):[string,string]=>[`Препарат ${entered(m.stock)} мг/мл`,`${medShow(mlValue,2)} мл`];
  const routeLine=blood?undefined:periodic?`${routeLabel(m.route)}${over} · каждые ${entered(m.interval)} ч · ${when}`:`${routeLabel(m.route)} · ${medShow(med?.rate,1)} мл/ч · инфузия ${entered(m.hours)} ч · шприц на ${medShow(med?.syringeHours,1)} ч`;
  const recipe:[string,string][]|undefined=blood?undefined:periodic?[
   ['Доза',`${medShow(med?.doseAmount)} ${med?.doseLabel||'мг'}`],
   ...(oral?[]:m.stock.trim()?[stockRow(med?.stockMl),[diluent,`${medShow(med?.solventMl,2)} мл`] as [string,string],['В шприце',`${entered(m.volume)} мл`] as [string,string]]:[[diluent,`до ${entered(m.volume)} мл`] as [string,string]]),
  ]:[
   ...(m.stock.trim()?[['Доза за сутки',`${medShow(med?.amountMg,2)} мг`] as [string,string],stockRow(med?.stockMl),[diluent,`${medShow(med?.solventMl,2)} мл`] as [string,string]]:[['Доза за сутки',`${medShow(med?.amountMg,2)} мг`] as [string,string],[diluent,`до ${entered(m.volume)} мл`] as [string,string]]),
   ['В шприце',`${entered(m.volume)} мл · ${formatConcentration(med?.concentration)}`],
  ];
  const detail=recipe?[...(oral&&periodic?[`Без разведения${med&&!med.intravenous?', вне баланса жидкости':''}`]:[]),routeLine!,...(warning?[warning]:[])].join('\n'):undefined;
  const mix=oral?`без разведения${med&&!med.intravenous?', вне баланса':''}`:m.stock.trim()?`${medShow(med?.stockMl,2)} мл + ${diluent} ${medShow(med?.solventMl,2)} мл = ${entered(m.volume)} мл`:`${diluent} до ${entered(m.volume)} мл`;
  const dose=blood?undefined:periodic?`${medShow(med?.doseAmount)} ${med?.doseLabel||'мг'}`:`${medShow(med?.amountMg,2)} мг/сут`;
  const brief=blood?undefined:periodic?[`${mix} · ${routeLabel(m.route)}${over} · каждые ${entered(m.interval)} ч`,...(warning?[warning]:[])].join('\n')
   :`${mix} · ${formatConcentration(med?.concentration)} · ${routeLabel(m.route)} ${medShow(med?.rate,1)} мл/ч · шприц на ${medShow(med?.syringeHours,1)} ч`;
  const built=make(row,instruction,{timing,partial,warning,preparedVolume:entered(m.volume),...(recipe?{recipe,detail,dose,brief}:{})});
  // Кардиотоники и другие постоянные инфузии — в таблицу инфузий, рядом с основной линией.
  if(!periodic&&!blood)infusion.push(built);else medication.push(built);
  if(m.loading){
   const load=full(m.id+'-loading'),offset=firstOffset(m.loadingFirst,p.start),loadMinutes=enteredMinutes(m.loadingHours,m.loadingMinutes);
   const loadPartial=ready&&offset!==null&&loadMinutes!==null&&offset+loadMinutes>1440;
   const loadWarning=loadPartial?`Часть за сутки ${load.volume} мл (${medShow(med?.loadingDeliveredMg)} мг); полный объём нагрузки ${entered(m.loadingVolume)} мл.`:undefined;
   const loadTiming=ready?[clockTime(offset,p.start)]:[];
   medication.push(make(load,[
    `${medShow(med?.loadingMg,2)} мг на нагрузку · ${routeLabel(m.route)}${loadMinutes?` за ${hoursLabel(loadMinutes)}`:''}`,
    `${oral?'Без разведения':`${diluent} до ${entered(m.loadingVolume)} мл`} · ${loadTiming.length?loadTiming.join(', '):'время —'}`,
    ...(loadWarning?[loadWarning]:[]),
   ].join('\n'),{timing:loadTiming,partial:loadPartial,warning:loadWarning,preparedVolume:entered(m.loadingVolume),
    preparation:m.stock.trim()?`Исходный препарат ${entered(m.stock)} мг/мл.`:undefined,
    recipe:[['Нагрузочная доза',`${medShow(med?.loadingMg,2)} мг`],...(oral?[]:[[diluent,`до ${entered(m.loadingVolume)} мл`] as [string,string]])],
    dose:`${medShow(med?.loadingMg,2)} мг`,
    brief:[`${oral?'без разведения':`${diluent} до ${entered(m.loadingVolume)} мл`} · ${routeLabel(m.route)}${loadMinutes?` за ${hoursLabel(loadMinutes)}`:''} · однократно`,...(loadWarning?[loadWarning]:[])].join('\n'),
    detail:[`${routeLabel(m.route)}${loadMinutes?` за ${hoursLabel(loadMinutes)}`:''} · ${loadTiming.length?loadTiming.join(', '):'время —'}`,...(oral?['Без разведения']:[]),...(loadWarning?[loadWarning]:[])].join('\n')}));
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
