'use client';

import {routeShort} from '@/lib/directory';
import {clock,drugs,numeric,type Inputs,type Result} from '@/lib/tpn';
import {formatNumber as f} from '@/lib/format';
import {ru} from './fields';

/** Стеклянный «чек» справа: что получилось, построчно, как видит сестра. rs — расчёт без препаратов, у которых ещё нет дозы. */
export function SidePanel({p,r,rs,pending,aaName,fatName,headerIssues}:{p:Inputs;r:Result;rs:Result;pending:string[];aaName:string;fatName:string;headerIssues:string[]}){
 const v=(x:number|null|undefined,d=1)=>f(rs.valid?x:null,d);
 const e=rs.electrolytes;const high=rs.valid&&rs.mainLinePercent!==null&&rs.mainLinePercent>12.5;
 const en=rs.enteralNutrition;const kg=rs.kg;
 const lowName=p.lowSolution==='water'?'воды':p.lowSolution==='nacl'?'NaCl 0,9 %':'глюкозы '+ru(p.lowGlucose)+' %';
 const rows:[string,string,string,string?][]=[
  ['Глюкоза '+v(rs.glucosePercent,2)+' %',v(rs.mixVolume,1)+' мл',v(rs.glucoseGrams,2)+' г'],
  ['  из '+lowName+' + глюкозы '+ru(p.highGlucose)+' %',v(rs.lowMl,1)+' + '+v(rs.highMl,1),'в/в '+v(rs.girIv,1)+' из '+v(rs.girTotal,1)+' мг/кг/мин','dim'],
  ['Ca глюконат 10 %',v(rs.caMl,1)+' мл',f(rs.calciumMmolPerKg,2)+' ммоль/кг'],
  ['MgSO₄ 25 %',v(e.mgMl,1)+' мл',''],['KCl 4 %',v(e.kclMl,1)+' мл',''],['NaCl 0,9 %',v(e.nacl09Ml,1)+' мл',''],
  ['NaCl 10 %',v(e.nacl10Ml,1)+' мл',v(rs.baseRate,1)+' мл/ч'],
  ['Аддамель Н',v(e.addamelMl,1)+' мл',''],['Дипептивен',v(e.dipeptivenMl,1)+' мл',''],['Солувит Н',v(e.soluvitMl,1)+' мл',''],
  ['Гепарин',(rs.valid&&rs.heparinUnits!==null?String(rs.heparinUnits):'—')+' Ед',rs.insulinUnits?f(rs.insulinUnits,2)+' Ед · 12 мл':'—'],
  [aaName,v(rs.aaMl,1)+' мл',v(rs.aaRate,1)+' мл/ч','sum'],
  [fatName,v(rs.fatLineMl,1)+' мл',v(rs.fatRate,1)+' мл/ч','sum'],
  ['Виталипид',v(rs.vitalipidMl,1)+' мл',''],
  ['Энтерально',f(rs.enteralMl,0)+' мл',f(en.volumePerKg,1)+' мл/кг'],
  ['Препараты '+(rs.drugsOnTop?'сверх объёма':'в объёме'),f(rs.drugMl,1)+' мл',p.medicines.length+' в листе'],
  ['Всего за сутки',f(rs.total,0)+' мл',f(numeric(p.fluid),0)+' мл/кг','sum'],
 ];
 const alerts=[...rs.errors,...(pending.length?['Пока без дозы, в баланс не вошли: '+pending.join(', ')]:[])];
 return <aside className="side glass" id="side" aria-label="Полученная инфузия">
  <h2 className="h">Полученная инфузия</h2>
  <div className="big"><span data-testid="total-fluid">{f(rs.total,0)}</span><small>мл</small><span className={'pct'+(high?' w':'')}><span data-testid="line-percent">{v(rs.mainLinePercent,2)}</span> %</span></div>
  <div className="hint">основной раствор {v(rs.base,1)} мл · {v(rs.baseRate,1)} мл/ч · в/в {v(rs.ivTotal,0)} мл</div>
  <dl className="conc" aria-label="Концентрация глюкозы">
   <div><dt>Глюкоза в растворе</dt><dd className={high?'w':undefined}>{v(rs.glucosePercent,2)} <small>%</small></dd><span>{v(rs.glucoseGrams,2)} г в {v(rs.mixVolume,1)} мл глюкозы</span></div>
   <div><dt>Основной раствор</dt><dd className={high?'w':undefined}>{v(rs.mainLinePercent,2)} <small>%</small></dd><span>с электролитами, {v(rs.base,1)} мл · {v(rs.baseRate,2)} мл/ч</span></div>
  </dl>
  {alerts.length>0&&<div className="alerts" role="alert">{alerts.map((x,i)=><div key={i} className="alert err">{x}</div>)}</div>}
  <table className="tab"><tbody>
   <tr className="sum"><td>Основной раствор</td><td className="n">{v(rs.base,1)} мл</td><td className={'r'+(high?' w':'')}>{v(rs.mainLinePercent,2)} %</td></tr>
   {rows.map(([a,b,c,cls],i)=><tr key={i} className={cls}><td>{a}</td><td className="n">{b}</td><td className="r">{c}</td></tr>)}
  </tbody></table>
  <dl className="keys"><div><dt>Белок всего</dt><dd>{v(rs.proteinPlan.achievedPerKg,2)} г/кг</dd></div><div><dt>Жиры в/в</dt><dd>{v(kg&&rs.fatGrams!==null?rs.fatGrams/kg:null,2)} г/кг</dd></div><div><dt>ккал по КР</dt><dd>{v(rs.kr.perKg,0)} /кг</dd></div></dl>
  {p.medicines.length>0&&<MedList p={p} r={r} rs={rs}/>}
  <div className="na"><div><dt>Натрий за сутки</dt><dd><b>{f(rs.sodium.perKg,2)} ммоль/кг</b> · {f(rs.sodium.totalMmol,2)} ммоль</dd></div><div><dt>из растворителей препаратов</dt><dd>{f(rs.sodium.diluentMmol,2)} ммоль · {f(rs.sodium.diluentPerKg,2)} ммоль/кг</dd></div><div><dt>NaCl в основной линии</dt><dd>{f(rs.sodium.lineMmol,2)} ммоль</dd></div><div className="hint">NaCl 0,9 % даёт 0,154 ммоль/мл. Ориентир КР после начала диуреза 2–3 ммоль/кг/сут, ЭНМТ до 4–5.</div></div>
  {(rs.warnings.length>0||headerIssues.length>0)&&<div className="alerts">{rs.warnings.map(x=><div key={x} className="alert">{x}</div>)}{headerIssues.map(x=><div key={x} className="alert muted">Для печати: {x}</div>)}</div>}
 </aside>;
}

function MedList({p,r,rs}:{p:Inputs;r:Result;rs:Result}){
 return <>
  <h3 className="h">Препараты в листе</h3>
  <ul className="meds">{p.medicines.map(m=>{
   const d=drugs.find(x=>x.id===m.drug);const name=d?d.name:m.drug;const res=r.medicines.find(x=>x.id===m.id);
   if(!res||!res.valid)return <li key={m.id}><b>{name}</b><span className="pend">{res?res.errors.join(' · '):''}</span></li>;
   const times=res.times.map(t=>clock(t,p.start)).join(', ');
   if(res.kind==='continuous')return <li key={m.id}><b>{name}</b><span><em>{ru(m.dose)} {m.unit}</em> · {f(res.rate,1)} мл/ч · {f(res.fluidVolume,1)} мл/сут</span><span>шприц: <em>{f(res.amountMg,2)} мг</em>{res.stockMl!==null?<> ({f(res.stockMl,2)} мл) + {m.diluent.trim()||'растворитель'} {f(res.solventMl,2)} мл</>:<> в {m.diluent.trim()||'растворителе'}</>} = {ru(m.volume)} мл · {f(res.concentration,3)} мг/мл</span></li>;
   if(res.kind==='blood')return <li key={m.id}><b>{name}</b><span><em>{ru(m.dose)} мл/кг</em> → {f(res.volume,1)} мл · {times} · вне баланса</span></li>;
   const n=24/(numeric(m.interval)||24);const perDay=numeric(m.dose)!==null?numeric(m.dose)!*n:null;
   return <li key={m.id}><b>{name}</b><span><em>{ru(m.dose)} {m.unit||'мг/кг'} × {f(n,0)}</em>{perDay!==null&&<> · {f(perDay,1)} {m.unit||'мг/кг'}/сут</>}</span><span><em>{f(res.doseAmount,2)} {res.doseLabel}</em> на введение · {times}{res.intravenous?<> · {m.diluent.trim()||'растворитель'} до {ru(m.volume)} мл · {f(res.fluidVolume,1)} мл/сут</>:<> · {routeShort(m.route)}, {res.volume!==null&&m.volume.trim()?<>{m.diluent.trim()||'растворитель'} до {ru(m.volume)} мл</>:'без разведения'}</>}</span>{res.loadingMg!==null&&res.loadingMg>0&&<span>нагрузка: <em>{f(res.loadingMg,2)} мг</em> в {m.loadingFirst||'—'}{res.loadingVolume?<> · до {ru(m.loadingVolume)} мл{m.loadingHours.trim()?<> за {ru(m.loadingHours)} ч</>:null}</>:null}</span>}</li>;
  })}</ul>
  <div className="sum2"><span>Доп. жидкость с препаратами</span><b>{f(rs.drugMl,1)} мл</b></div>
 </>;
}
