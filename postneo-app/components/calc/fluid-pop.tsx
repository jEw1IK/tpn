'use client';

import {fluidNeed,fluidNeedRows,fluidNeedStatus} from '@/lib/fluid-need';
import {formatNumber as f} from '@/lib/format';

const statusText={below:'ниже ориентира',within:'в пределах',above:'выше ориентира'} as const;

/** Ненавязчивая подсказка под «Физ. потребностью»: ориентир КР 2015 для веса и суток и готовые объёмы одним нажатием. */
export function FluidPop({show,weightGrams,day,fluid,onPick,onTable}:{show:boolean;weightGrams:number|null;day:number|null;fluid:number|null;onPick:(value:number)=>void;onTable:()=>void}){
 const need=fluidNeed(weightGrams,day);
 const ml=(x:number)=>weightGrams?f(x*weightGrams/1000,0):'—';
 const status=fluidNeedStatus(fluid,need.range);
 const picks=need.range?[...new Set([need.range[0],Math.round((need.range[0]+need.range[1])/10)*5,need.range[1]])].sort((a,b)=>a-b):[];
 return <div className={'pop glass'+(show?' show':'')} role="status" aria-live="polite">
  {!need.range?<span>Введите вес и сутки жизни — покажу ориентир КР 2015.</span>:<>
   <b>{f(weightGrams,0)} г · {fluidNeedRows[need.row!].days}</b> · КР 2015: <b>{need.range[0]}–{need.range[1]} мл/кг</b> → {ml(need.range[0])}–{ml(need.range[1])} мл{status&&<> · введено {f(fluid,0)} <span className={'st '+status}>{statusText[status]}</span></>}
   <div className="picks">{picks.map(x=><button key={x} type="button" aria-pressed={fluid===x} onClick={()=>onPick(x)}>{x}<small>→ {ml(x)} мл</small></button>)}<a href="#" onClick={e=>{e.preventDefault();onTable();}}>таблица и поправки →</a></div>
  </>}
 </div>;
}
