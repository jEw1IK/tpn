'use client';

import {useEffect,useState} from 'react';
import {X} from 'lucide-react';
import {fluidNeed,fluidNeedColumns,fluidNeedCorrections,fluidNeedRows,fluidNeedRules,fluidNeedSource} from '@/lib/fluid-need';
import {anemiaRows,anemiaVerdict,biliBandIndex,biliBands,biliHourIndex,biliHourLabels,biliVerdict,electrolyteTargets,lipidControl,nutrientTargets,transfusionDefaults,transfusionPerKg} from '@/lib/reference';
import {numeric,type Inputs} from '@/lib/tpn';
import {formatNumber as f} from '@/lib/format';

export type RefTab='fluid'|'bili'|'anemia'|'pn';
const tabs:[RefTab,string][]=[['fluid','Жидкость'],['bili','Билирубин'],['anemia','Анемия'],['pn','Нормы ПП']];
const ru=(s:string)=>s.replace('.',',');

function Num({id,label,unit,value,onChange}:{id:string;label:string;unit?:string;value:string;onChange:(v:string)=>void}){
 return <label className="f"><span className="l">{label}</span><span className="w"><input id={id} value={ru(value)} inputMode="decimal" autoComplete="off" onChange={e=>onChange(e.target.value.replace(',','.'))}/>{unit&&<em>{unit}</em>}</span></label>;
}
function Seg<T extends string>({label,value,onChange,options}:{label:string;value:T;onChange:(v:T)=>void;options:[T,string][]}){
 return <div className="f"><span className="l">{label}</span><div className="seg2" role="group" aria-label={label}>{options.map(([v,t])=><button key={v} type="button" aria-pressed={value===v} onClick={()=>onChange(v)}>{t}</button>)}</div></div>;
}

/** Выезжающая методичка: таблицы и два калькулятора на данных пациента из листа. */
export function ReferenceDrawer({open,tab,onTab,onClose,p}:{open:boolean;tab:RefTab;onTab:(t:RefTab)=>void;onClose:()=>void;p:Inputs}){
 const [rc,setRc]=useState({ga:'',bdays:'',bili:'',bili0:'',dt:'',days:'',hb:'',ht:'',sample:'cap' as 'cap'|'ven',support:'yes' as 'yes'|'no',htPatient:'',htTarget:transfusionDefaults.htTarget,htProduct:transfusionDefaults.htProduct,bcc:transfusionDefaults.bcc});
 const set=(patch:Partial<typeof rc>)=>setRc(old=>({...old,...patch}));
 const day=numeric(p.day);const kg=(()=>{const w=numeric(p.weight);return w?w/1000:null;})();
 const corrGa=(()=>{const g=numeric(p.gestation);if(g===null)return null;return g+(day?Math.floor((day-1)/7):0);})();
 useEffect(()=>{if(!open)return;setRc(old=>({...old,ga:old.ga||(corrGa===null?'':String(corrGa)),bdays:old.bdays||(day===null?'':String(day)),days:old.days||(day===null?'':String(day))}));},[open,corrGa,day]);
 useEffect(()=>{if(!open)return;const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[open,onClose]);
 if(!open)return null;
 const who=[p.surname.trim(),f(numeric(p.weight),0)+' г',ru(p.day)+'-е сутки','ГВ '+ru(p.gestation)].filter(Boolean).join(' · ');
 return <div className="drawer open" role="dialog" aria-modal="true" aria-labelledby="ref-title">
  <div className="veil" onClick={onClose}/>
  <div className="pane glass">
   <div className="dh"><h2 id="ref-title">Методичка</h2><span className="hint">{who}</span><button type="button" className="x" onClick={onClose} aria-label="Закрыть"><X size={18}/></button></div>
   <div className="dtabs" role="tablist">{tabs.map(([id,name])=><button key={id} type="button" role="tab" aria-pressed={id===tab} onClick={()=>onTab(id)}>{name}</button>)}</div>
   <div className="db">
    {tab==='fluid'&&<FluidTab p={p}/>}
    {tab==='bili'&&<BiliTab rc={rc} set={set}/>}
    {tab==='anemia'&&<AnemiaTab rc={rc} set={set} kg={kg}/>}
    {tab==='pn'&&<PnTab/>}
   </div>
  </div>
 </div>;
}

function FluidTab({p}:{p:Inputs}){
 const need=fluidNeed(numeric(p.weight),numeric(p.day));
 return <>
  <h3>Физиологическая потребность, мл/кг/сут</h3>
  <p>КР РАСПМ «Парентеральное питание новорождённых», 2015, таблица 1. Подсвечена клетка пациента.</p>
  <table className="rt"><thead><tr><th>Возраст</th>{fluidNeedColumns.map(c=><th key={c.id}>{c.label}</th>)}</tr></thead><tbody>{fluidNeedRows.map((row,ri)=><tr key={row.label} className={ri===need.row?'cur':undefined}><td><b>{row.label}</b><br/><span className="hint">{row.days}</span></td>{row.ranges.map((r,ci)=><td key={ci} className={ri===need.row&&ci===need.column?'cur':undefined}>{r[0]}–{r[1]}</td>)}</tr>)}</tbody></table>
  <h3>Поправки к расчёту</h3>
  <p>Практические ориентиры из шпаргалки, вне таблицы КР.</p>
  <table className="rt"><tbody>{fluidNeedCorrections.map(([a,c])=><tr key={a}><td>{a}</td><td style={{textAlign:'right',whiteSpace:'nowrap'}}><b>{c}</b></td></tr>)}</tbody></table>
  <p className="hint">Про фототерапию КР «Неонатальная желтуха» 2025 говорит строже шпаргалки: дополнительная жидкость только если суточная потеря массы больше 5 % или молока не хватает.</p>
  <h3>Как применять</h3>
  {fluidNeedRules.map(x=><p key={x}>· {x}</p>)}
  <p className="src">{fluidNeedSource}</p>
 </>;
}

function BiliTab({rc,set}:{rc:{ga:string;bdays:string;bili:string;bili0:string;dt:string};set:(patch:Partial<typeof rc>)=>void}){
 const ga=numeric(rc.ga),dd=numeric(rc.bdays),v=numeric(rc.bili);
 const gi=biliBandIndex(ga),hi=biliHourIndex(dd);const band=gi>=0?biliBands[gi]:null;
 const verdict=biliVerdict(ga,dd,v,numeric(rc.bili0),numeric(rc.dt));
 return <>
  <h3>Калькулятор: общий билирубин против порогов КР</h3>
  <div className="calc"><Num id="ref-ga" label="ГВ / скорригированный" unit="нед" value={rc.ga} onChange={ga=>set({ga})}/><Num id="ref-bdays" label="Сутки жизни" unit="сут" value={rc.bdays} onChange={bdays=>set({bdays})}/><Num id="ref-bili" label="Общий билирубин" unit="мкмоль/л" value={rc.bili} onChange={bili=>set({bili})}/><Num id="ref-bili0" label="Предыдущий" unit="мкмоль/л" value={rc.bili0} onChange={bili0=>set({bili0})}/><Num id="ref-dt" label="Часов между ними" unit="ч" value={rc.dt} onChange={dt=>set({dt})}/></div>
  {!band?<div className="verdict"><span>Введите ГВ, сутки жизни и билирубин.</span></div>
   :!verdict?<div className="verdict"><span>Строка {band.label}. Введите сутки жизни и билирубин.</span></div>
   :<div className={'verdict '+verdict.tone} role="status"><b>{verdict.title}</b><span>{band.label}, {f(Math.floor(dd!),0)}-е сутки ({verdict.hourLabel}): ФТ {verdict.ft} · интенсивная {verdict.ift} · ОЗПК {verdict.ozpk} · у пациента <b>{f(v,0)}</b> · {verdict.what}{verdict.control?' · '+verdict.control:''}</span>{verdict.rise&&<span>Прирост <b>{f(verdict.rise.rate,1)} мкмоль/л/ч</b> · {verdict.rise.title} · {verdict.rise.action}</span>}</div>}
  <h3>Таблица КР для строки пациента</h3>
  {band&&<table className="rt"><thead><tr><th>{band.label}</th>{biliHourLabels.map((l,i)=><th key={l} className={i===hi?'cur':undefined}>{l}</th>)}</tr></thead><tbody>{([['Станд. ФТ','ft',''],['Интенс. ФТ','ift','w'],['ОЗПК','ozpk','d']] as const).map(([n,k,c])=><tr key={k}><td>{n}</td>{band[k].map((x,i)=><td key={i} className={i===hi?'cur':c||undefined}>{x}</td>)}</tr>)}</tbody></table>}
  <h3>Контроль по КР «Неонатальная желтуха»</h3>
  <p>· На фототерапии общий билирубин не позднее 24 ч от начала, при интенсивной не позднее 12 ч; у порога ОЗПК не реже 1 раза в 12 ч.<br/>· ФТ можно прекратить, когда билирубин ниже порога ФТ для постнатального и гестационного возраста; контроль через 12 ч после окончания.<br/>· При быстром нарастании желтухи повтор через 12 ч после начала ФТ.<br/>· Признаки острой билирубиновой энцефалопатии: ОЗПК независимо от цифры.<br/>· Дополнительная жидкость при ФТ только если суточная потеря массы больше 5 % или молока не хватает.</p>
  <p className="src">Строка ≥ 35 нед сверена построчно с КР МЗ РФ «Неонатальная желтуха» 2025, приложение А3.3 (критерии Kobe 2017). Строки 22–34 нед из КР «Гипербилирубинемия недоношенных» через справочник бота. Таблица ступенчатая: порог действует на весь интервал, сутки жизни переводятся в колонку часов (1-е сутки — до 24 ч, 2-е — 24–48 ч и так далее). Прямую фракцию не вычитать. Если до порога ОЗПК меньше 50 мкмоль/л — интенсивная ФТ независимо от своей строки.</p>
 </>;
}

function AnemiaTab({rc,set,kg}:{rc:{days:string;hb:string;ht:string;sample:'cap'|'ven';support:'yes'|'no';htPatient:string;htTarget:string;htProduct:string;bcc:string};set:(patch:Partial<typeof rc>)=>void;kg:number|null}){
 const d=numeric(rc.days),hb=numeric(rc.hb),ht=numeric(rc.ht);
 const verdict=anemiaVerdict(d,hb,ht,rc.sample,rc.support==='yes');
 const sampleName=rc.sample==='cap'?'капиллярная':'венозная';const supportName=rc.support==='yes'?'с поддержкой':'без поддержки';
 const h0=numeric(rc.htPatient)??ht,h1=numeric(rc.htTarget),hp=numeric(rc.htProduct),bcc=numeric(rc.bcc);
 const perKg=kg&&h0!==null&&h1!==null&&hp!==null&&bcc!==null?transfusionPerKg(h0,h1,hp,bcc):null;
 const dose=perKg===null?null:Math.min(transfusionDefaults.range[1],Math.max(transfusionDefaults.range[0],perKg));
 return <>
  <h3>Калькулятор: порог трансфузии</h3>
  <div className="calc"><Num id="ref-days" label="Сутки жизни" unit="сут" value={rc.days} onChange={days=>set({days})}/><Num id="ref-hb" label="Hb" unit="г/л" value={rc.hb} onChange={hb=>set({hb})}/><Num id="ref-ht" label="Ht" unit="%" value={rc.ht} onChange={ht=>set({ht})}/><Seg label="Проба" value={rc.sample} onChange={sample=>set({sample})} options={[['cap','капиллярная'],['ven','венозная']]}/><Seg label="Респираторная поддержка" value={rc.support} onChange={support=>set({support})} options={[['yes','любая, даже O₂'],['no','нет']]}/></div>
  {!verdict?<div className="verdict"><span>{d!==null&&d<2?'Таблица КР начинается со 2-х суток; в первые сутки ориентир по пуповинной крови и клинике.':'Введите сутки жизни.'}</span></div>
   :verdict.hit===null?<div className="verdict"><span>Порог для {verdict.row.days} сут, {sampleName} проба, {supportName}: <b>Hb ≤ {verdict.hb} г/л{verdict.ht!==null?', Ht ≤ '+verdict.ht+' %':''}</b>. Введите Hb или Ht.</span></div>
   :<div className={'verdict '+(verdict.hit?'warn':'ok')} role="status"><b>{verdict.hit?'Трансфузия по порогу КР':'Выше порога, можно ждать'}</b><span>{verdict.row.days} сут, {sampleName}, {supportName}: порог Hb ≤ {verdict.hb}{verdict.ht!==null?', Ht ≤ '+verdict.ht+' %':''} · у пациента Hb {hb===null?'—':f(hb,0)}{ht!==null?', Ht '+f(ht,0)+' %':''}{verdict.hit?'':' · при симптомах анемии порог не работает'}</span></div>}
  <h3>Сколько переливать</h3>
  <div className="calc"><Num id="ref-ht0" label="Ht больного" unit="%" value={rc.htPatient} onChange={htPatient=>set({htPatient})}/><Num id="ref-ht1" label="Ht цель" unit="%" value={rc.htTarget} onChange={htTarget=>set({htTarget})}/><Num id="ref-htp" label="Ht эр. взвеси" unit="%" value={rc.htProduct} onChange={htProduct=>set({htProduct})}/><Num id="ref-bcc" label="ОЦК" unit="мл/кг" value={rc.bcc} onChange={bcc=>set({bcc})}/></div>
  {perKg!==null&&kg&&dose!==null?<><dl className="kv"><dt>По формуле КР</dt><dd>{f(perKg,1)} мл/кг → {f(perKg*kg,0)} мл</dd><dt>Стандартно</dt><dd>{transfusionDefaults.standardMlPerKg} мл/кг → {f(transfusionDefaults.standardMlPerKg*kg,0)} мл (коридор {transfusionDefaults.range[0]}–{transfusionDefaults.range[1]}: {f(transfusionDefaults.range[0]*kg,0)}–{f(transfusionDefaults.range[1]*kg,0)} мл)</dd><dt>Скорость</dt><dd>{f(Math.round(dose*kg/transfusionDefaults.hours*10)/10,1)} мл/ч за {transfusionDefaults.hours} ч при {f(dose,0)} мл/кг</dd><dt>Ориентир</dt><dd>10 мл/кг поднимает Hb примерно на 20 г/л</dd></dl>{perKg>transfusionDefaults.range[1]&&<p className="hint">По формуле выходит больше 20 мл/кг: у ЭНМТ лучше в два приёма с интервалом 4 ч.</p>}</>
   :<p>Введите Ht больного; вес берётся из листа ({kg?f(kg*1000,0)+' г':'нет'}).</p>}
  <h3>Пороги Hb, г/л — таблица 3 КР</h3>
  <table className="rt"><thead><tr><th>Сутки</th><th>Проба</th><th>С поддержкой</th><th>Без поддержки</th></tr></thead><tbody>{anemiaRows.map(r=><Fragment2 key={r.days} r={r}/>)}</tbody></table>
  <p>Пороги для стабильного ребёнка. Не применяются при операциях, сепсисе, шоке, кровотечении и при симптомах анемии: тахикардия, тахипноэ, апноэ. При БЛД, пороках сердца и ЭКМО держат Ht около 40 %, Hb около 120 г/л.</p>
  <p className="src">КР «Ранняя анемия недоношенных»: таблица 3 (пороги), раздел 3 (объём 10–20 мл/кг, обычно 15; не дольше 4 ч; ЭНМТ можно в два приёма с интервалом 4 ч). Формула объёма: (Ht цель − Ht больного) ÷ Ht эритроцитной взвеси × ОЦК.</p>
 </>;
}
function Fragment2({r}:{r:(typeof anemiaRows)[number]}){
 return <><tr><td><b>{r.days}</b></td><td>капиллярная</td><td>≤ {r.cap[0]} (Ht {r.capHt[0]} %)</td><td>≤ {r.cap[1]} (Ht {r.capHt[1]} %)</td></tr><tr><td/><td>венозная</td><td>≤ {r.ven[0]}</td><td>≤ {r.ven[1]}</td></tr></>;
}

function PnTab(){
 return <>
  <h3>Нутриенты: старт, шаг, цель</h3>
  <table className="rt"><thead><tr><th>Компонент</th><th>Старт</th><th>Шаг</th><th>Цель, недонош.</th><th>Цель, донош.</th></tr></thead><tbody>{nutrientTargets.map(r=><tr key={r[0]}><td>{r[0]}</td>{r.slice(1).map((x,i)=><td key={i}>{x}</td>)}</tr>)}</tbody></table>
  <p>GIR = концентрация % × скорость мл/ч ÷ (6 × масса кг). Периферически не выше 12,5 % глюкозы. 1 г белка 4 ккал, 1 г глюкозы 3,4 ккал, 1 г жира 9 ккал; небелковых калорий 25–35 на 1 г белка.</p>
  <h3>Электролиты и минералы, на кг в сутки</h3>
  <table className="rt"><thead><tr><th>Компонент</th><th>Первые 24–48 ч</th><th>После диуреза</th><th>Примечание</th></tr></thead><tbody>{electrolyteTargets.map(r=><tr key={r[0]}><td>{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td><td style={{textAlign:'left',color:'var(--mute)'}}>{r[3]}</td></tr>)}</tbody></table>
  <h3>Контроль жиров</h3>
  <dl className="kv">{lipidControl.map(([k,v])=><div key={k} style={{display:'contents'}}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
  <p className="src">КР РАСПМ «Парентеральное питание новорождённых», 2015; дозы нутриентов сверены с ESPGHAN/ESPEN/ESPR 2018.</p>
 </>;
}
