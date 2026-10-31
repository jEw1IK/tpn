import {calculate,drugs,type Inputs} from './tpn.ts';
import {patientHeader} from './patient-header.ts';

/** Коротко о листе для карточки и списка. Считается в браузере из расшифрованного листа. */
export type SheetSummary={valid:boolean;total:number|null;perKg:number|null;linePercent:number|null;protein:number|null;kcal:number|null;weightToday:number|null;drugs:string[]};
export function summarize(p:Inputs):SheetSummary{
 const r=calculate(p);const header=patientHeader(p);
 const kg=r.kg;const num=(v:string)=>{const n=Number(String(v).replace(',','.'));return Number.isFinite(n)&&n>0?n:null;};
 return {valid:r.valid&&header.valid,total:r.valid?r.total:null,perKg:num(p.fluid),linePercent:r.valid?r.mainLinePercent:null,protein:r.valid?r.proteinPlan.achievedPerKg:null,kcal:r.valid&&kg?r.kr.perKg:null,weightToday:num(p.weightToday)??num(p.weight),drugs:p.medicines.map(m=>drugs.find(d=>d.id===m.drug)?.name??m.drug)};
}
