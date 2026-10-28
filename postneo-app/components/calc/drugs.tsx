'use client';

import {useEffect,useRef,useState} from 'react';
import {Search,X} from 'lucide-react';
import {bloodRoutes,diluents,doseUnits,drugDirectorySource,groupNames,routeShort,routes,type Drug,type Group,isOralRoute,needsDuration,takesDilution} from '@/lib/directory';
import {clock,drugs,newMedicine,scheduleDay,type Inputs,type MedResult,type Medicine,type Result} from '@/lib/tpn';
import {formatNumber as f,formatConcentration} from '@/lib/format';
import {Pick,dot,ru} from './fields';

/** Вкладки групп: антибиотики вместе с противогрибковыми и противовирусными, кардиотоники отдельно. */
const TABS:[string,string,readonly Group[],string][]=[
 ['abx','Антибиотики',['antibiotic','antifungal'],'цеф, ван, мер, флук…'],['tonic','Кардио',['vasoactive','cardiac'],'доф, добу, адр, нор, амио…'],['sed','Седация',['sedation'],'мида, фент, конв…'],
 ['horm','Гормоны',['hormone'],'название…'],['anal','Аналептики',['analeptic'],'название…'],['blood','Кровь',['blood'],'эр, плазма, тромбо…'],['other','Другие',['other'],'название…'],
];
export type DoseHint={dose:string;interval:string;loading:string};
/** Доза и интервал из текста подсказки справочника: «25 мг/кг (интервал 12ч)», «3 мг/кг каждые 12 ч»; нагрузочная доза отдельно. */
export function hintDose(d:Drug):DoseHint|null{
 const h=d.hint||'';
 const m=/(\d+(?:[.,]\d+)?)(?:[–-]\d+(?:[.,]\d+)?)?\s*мг\/кг(?:\s*в\/в\s*капельно)?\s*\(интервал\s*(\d+)\s*ч/i.exec(h)||/(\d+(?:[.,]\d+)?)\s*мг\/кг\s+(?:каждые|через)\s+(\d+)\s*ч/i.exec(h)||/(\d+(?:[.,]\d+)?)\s*мг\/кг[^.;]{0,60}?интервал(?:ом)?\s*(\d+)\s*ч/i.exec(h);
 if(!m)return null;
 const l=/нагрузочн\w*\s+доз\w*\s+(\d+(?:[.,]\d+)?)\s*мг\/кг/i.exec(h);
 return {dose:m[1].replace(',','.'),interval:m[2],loading:l?l[1].replace(',','.'):''};
}
export function shortHint(d:Drug):string{
 const h=hintDose(d);if(h)return ru(h.dose)+' мг/кг каждые '+h.interval+' ч'+(h.loading?', нагрузка '+ru(h.loading):'');
 return (d.hint||'').replace(/\s+/g,' ').slice(0,60);
}
/** Препарат из справочника с дозой из подсказки, временем первого введения от начала расчётных суток и типовым разведением. */
export function prepareMedicine(d:Drug,id:string,start:string):Medicine{
 const m=newMedicine(d.id,id);const at=start||'08:00';
 m.first=at;m.loadingFirst=at;
 if(d.kind==='intermittent'){const h=hintDose(d);if(h){m.dose=h.dose;m.interval=h.interval;if(h.loading){m.loading=true;m.loadingDose=h.loading;m.loadingVolume='2';m.loadingHours='0.5';m.loadingSource='подсказка справочника';}}m.volume='2';m.infusionHours='0.5';}
 else if(d.kind==='blood')m.route='в/в (за 3 часа)';
 return m;
}

export function DrugsBlock({p,r,update,notice}:{p:Inputs;r:Result;update:(patch:Partial<Inputs>)=>void;notice:(text:string)=>void}){
 const [tab,setTab]=useState('');const [query,setQuery]=useState('');const [active,setActive]=useState(0);const [open,setOpen]=useState(false);
 const [modal,setModal]=useState(false);const [filter,setFilter]=useState('');
 const search=useRef<HTMLInputElement>(null);const box=useRef<HTMLDivElement>(null);const seq=useRef(0);
 const current=TABS.find(t=>t[0]===tab);
 const groupDrugs=current?drugs.filter(d=>current[2].includes(d.group)):[];
 const q=query.trim().toLowerCase();
 const matches=q?[...groupDrugs.filter(d=>d.name.toLowerCase().startsWith(q)),...groupDrugs.filter(d=>!d.name.toLowerCase().startsWith(q)&&d.name.toLowerCase().includes(q))].slice(0,8):[];
 useEffect(()=>{if(tab)search.current?.focus();},[tab]);
 useEffect(()=>{const onDoc=(e:MouseEvent)=>{if(!box.current?.contains(e.target as Node))setOpen(false);};document.addEventListener('click',onDoc);return()=>document.removeEventListener('click',onDoc);},[]);
 useEffect(()=>{if(!modal)return;const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')setModal(false);};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[modal]);
 const add=(id:string)=>{
  const d=drugs.find(x=>x.id===id);if(!d)return;
  const exists=p.medicines.find(m=>m.drug===id);
  if(exists){notice(d.name+' уже в листе');document.getElementById('drug-'+exists.id)?.scrollIntoView({block:'center',behavior:'smooth'});return;}
  const mid='m'+Date.now().toString(36)+(++seq.current);
  update({medicines:[...p.medicines,prepareMedicine(d,mid,p.start)]});
  setQuery('');setActive(0);setOpen(false);setModal(false);notice('В листе: '+d.name);
  setTimeout(()=>{const first=document.querySelector<HTMLInputElement>('#drug-'+mid+' input');first?.focus();first?.select();},50);
 };
 const onKey=(e:React.KeyboardEvent<HTMLInputElement>)=>{
  if(e.key==='ArrowDown'){e.preventDefault();setActive(a=>Math.min(matches.length-1,a+1));setOpen(true);}
  else if(e.key==='ArrowUp'){e.preventDefault();setActive(a=>Math.max(0,a-1));}
  else if(e.key==='Enter'){e.preventDefault();if(matches[active])add(matches[active].id);else if(q)setModal(true);}
  else if(e.key==='Escape')setOpen(false);
 };
 const setMed=(id:string,patch:Partial<Medicine>)=>update({medicines:p.medicines.map(m=>m.id===id?{...m,...patch}:m)});
 const remove=(id:string)=>update({medicines:p.medicines.filter(m=>m.id!==id)});
 const filtered=groupDrugs.filter(d=>!filter.trim()||d.name.toLowerCase().includes(filter.trim().toLowerCase())).slice().sort((a,b)=>a.name.localeCompare(b.name,'ru'));
 let letter='';
 return <div className="drugs" id="drugs">
  <div className="dtabs" role="tablist">{TABS.map(([id,name,groups])=>{const n=p.medicines.filter(m=>groups.includes(m.group)).length;return <button key={id} type="button" role="tab" aria-pressed={id===tab} onClick={()=>{setTab(tab===id?'':id);setQuery('');setActive(0);}}>{name}{n>0&&<em>{n}</em>}</button>;})}</div>
  {current?<div className="dsearch" ref={box}>
   <label className="sr" htmlFor="drug-search">Поиск препарата</label>
   <div className="w"><Search size={16} aria-hidden="true"/><input id="drug-search" ref={search} value={query} placeholder={current[3]} autoComplete="off" onChange={e=>{setQuery(e.target.value);setActive(0);setOpen(true);}} onFocus={()=>setOpen(true)} onKeyDown={onKey} role="combobox" aria-expanded={open&&!!q} aria-controls="drug-listbox" aria-autocomplete="list"/><kbd>↵ добавить</kbd></div>
   <button type="button" className="all" onClick={()=>{setFilter('');setModal(true);}}>Все: {current[1].toLowerCase()} · {groupDrugs.length}</button>
   <div className={'dd'+(open&&q?' open':'')} id="drug-listbox" role="listbox">{matches.length?matches.map((d,i)=>{const added=p.medicines.some(m=>m.drug===d.id);return <button key={d.id} type="button" role="option" aria-selected={i===active} className={i===active?'active':undefined} onMouseDown={e=>e.preventDefault()} onClick={()=>add(d.id)}><b>{d.name}</b><span>{shortHint(d)}</span>{added&&<em>уже в листе</em>}</button>;})
    :q?<div className="none">Не нашёл «{query.trim()}» в этой группе.<button type="button" onClick={()=>{setFilter('');setModal(true);}}>Открыть весь список</button></div>:null}</div>
  </div>:<p className="empty">Выберите группу — откроется поиск по ней.</p>}
  <div className="cards">{p.medicines.length?p.medicines.map(m=><DrugCard key={m.id} m={m} res={r.medicines.find(x=>x.id===m.id)} start={p.start} set={patch=>setMed(m.id,patch)} remove={()=>remove(m.id)}/>):<p className="empty">В листе пока ничего нет.</p>}</div>
  {modal&&current&&<div className="modal open" role="dialog" aria-modal="true" aria-labelledby="drug-modal-title" onClick={e=>{if(e.target===e.currentTarget)setModal(false);}}>
   <div className="box glass"><div className="mh"><h2 id="drug-modal-title">{current[1]} · {groupDrugs.length}</h2><input autoFocus value={filter} placeholder="сузить список…" aria-label="Фильтр списка" onChange={e=>setFilter(e.target.value)}/><button type="button" className="x" onClick={()=>setModal(false)} aria-label="Закрыть"><X size={18}/></button></div>
    <div className="ml">{filtered.length?filtered.map(d=>{const L=d.name[0].toUpperCase();const head=L!==letter;letter=L;const added=p.medicines.some(m=>m.drug===d.id);return <FragmentRow key={d.id} head={head?L:''} d={d} added={added} onAdd={()=>add(d.id)}/>;}):<p className="empty" style={{padding:10}}>Ничего не найдено.</p>}</div>
   </div>
  </div>}
 </div>;
}
function FragmentRow({head,d,added,onAdd}:{head:string;d:Drug;added:boolean;onAdd:()=>void}){
 return <>{head&&<div className="let">{head}</div>}<button type="button" onClick={onAdd}><b>{d.name}{added&&<em> · в листе</em>}</b><span>{(d.hint||'').replace(/\s+/g,' ')||drugDirectorySource}</span></button></>;
}

type CellProps={m:Medicine;k:keyof Medicine;label:string;unit?:string;type?:string;bad?:boolean;set:(patch:Partial<Medicine>)=>void};
function Cell({m,k,label,unit,type,bad,set}:CellProps){
 const value=String(m[k]??'');const numeric=!type;
 return <label className={'cell'+(bad?' bad':'')}><span>{label}</span><input type={type||'text'} inputMode={numeric?'decimal':undefined} value={numeric?ru(value):value} autoComplete="off" aria-label={label} aria-invalid={bad||undefined} onChange={e=>set({[k]:numeric?dot(e.target.value):e.target.value} as Partial<Medicine>)}/>{unit&&<span>{unit}</span>}</label>;
}
function CellSelect({id,label,value,options,onChange}:{id:string;label:string;value:string;options:readonly string[];onChange:(v:string)=>void}){
 const list=options.includes(value)||!value?options:[value,...options];
 return <Pick id={id} label={label} value={value} onChange={onChange} options={list.map(x=>[x,x] as const)} compact/>;
}

function DrugCard({m,res,start,set,remove}:{m:Medicine;res:MedResult|undefined;start:string;set:(patch:Partial<Medicine>)=>void;remove:()=>void}){
 const [more,setMore]=useState(false);
 const d=drugs.find(x=>x.id===m.drug);const kind=d?.kind??'intermittent';const blood=kind==='blood';const continuous=m.mode==='continuous';
 const bad=(k:string)=>!!res?.issues.some(i=>i.field===k);
 const times=res?.times.map(t=>clock(t,start)+(scheduleDay(t,start)===1?' (+1)':'')).join(', ')??'';
 const setLoading=(v:string)=>set({loadingDose:v,loading:v.trim()!=='',loadingVolume:m.loadingVolume||m.volume||'2',loadingHours:m.loadingHours||'',loadingSource:m.loadingSource||'схема отделения',loadingFirst:m.loadingFirst||m.first});
 const out=!res?'':!res.valid?<span className="w">{res.errors.join(' · ')}</span>
  :blood?<><b>{f(res.volume,1)} мл</b> · {f(res.rate,1)} мл/ч · {times} · вне баланса</>
  :continuous?<><b>{f(res.amountMg,2)} мг</b> в шприце · {formatConcentration(res.concentration)} · <b>{f(res.rate,1)} мл/ч</b> · {f(res.fluidVolume,1)} мл/сут{res.stockMl!==null&&<> · препарат {f(res.stockMl,2)} мл + растворитель {f(res.solventMl,2)} мл</>}</>
  :!res.intravenous?<><b>{f(res.doseAmount,2)} {res.doseLabel}</b> на введение · {times} · {routeShort(m.route)}, {res.volume!==null&&m.volume.trim()?<>{m.diluent.trim()||'растворитель'} до {ru(m.volume)} мл</>:'без разведения'}, вне баланса{res.loadingMg?<> · нагрузка {f(res.loadingMg,2)} мг в {m.loadingFirst||'—'}</>:null}</>
  :<><b>{f(res.doseAmount,2)} {res.doseLabel}</b> на введение · {formatConcentration(res.concentration)} · {res.rate!==null&&<><b>{f(res.rate,1)} мл/ч</b> · </>}{f(res.fluidVolume,1)} мл/сут · {times}{res.loadingMg?<> · нагрузка <b>{f(res.loadingMg,2)} мг</b> в {m.loadingFirst||'—'}{res.loadingVolume?<>, до {ru(m.loadingVolume)} мл{m.loadingHours.trim()?<> за {ru(m.loadingHours)} ч</>:null}</>:null}</>:null}</>;
 return <article className={'drug'+(res&&!res.valid?' bad':'')} id={'drug-'+m.id}>
  <div className="drug-h"><b>{d?d.name:m.drug}</b><span>{d?groupNames[d.group]:''} · {routeShort(m.route)||'путь не указан'}</span>{m.group==='sedation'&&<button type="button" className="mode" onClick={()=>set({mode:continuous?'intermittent':'continuous',dose:'',unit:continuous?(m.drug==='fentanyl'?'мкг/кг':'мг/кг'):(d?.unit??m.unit),pump:continuous?'':'0.5',volume:continuous?'2':'12',interval:'',infusionHours:continuous?'0.5':''})}>{continuous?'→ периодически':'→ непрерывно'}</button>}<button type="button" className="del" onClick={remove}>отменить</button></div>
  <div className="cells">
   {blood&&<><Cell m={m} k="dose" label="доза" unit="мл/кг" bad={bad('dose')} set={set}/><Cell m={m} k="first" label="в" type="time" bad={bad('first')} set={set}/><CellSelect id={m.id+"-route"} label="путь" value={m.route} options={bloodRoutes} onChange={route=>set({route})}/></>}
   {!blood&&continuous&&<><Cell m={m} k="dose" label="доза" unit={d?.unit??m.unit} bad={bad('dose')} set={set}/><Cell m={m} k="hours" label="за" unit="ч" bad={bad('hours')} set={set}/><Cell m={m} k="pump" label="помпа" unit="мл/ч" bad={bad('pump')} set={set}/><Cell m={m} k="volume" label="шприц" unit="мл" bad={bad('volume')} set={set}/><Cell m={m} k="stock" label="исх." unit="мг/мл" bad={bad('stock')} set={set}/><CellSelect id={m.id+"-diluent"} label="в" value={m.diluent} options={diluents} onChange={diluent=>set({diluent})}/></>}
   {!blood&&!continuous&&<>
    {m.group==='other'?<><label className={'cell'+(bad('dose')?' bad':'')}><span>доза</span><input inputMode="decimal" value={ru(m.dose)} aria-label="доза" aria-invalid={bad('dose')||undefined} onChange={e=>set({dose:dot(e.target.value)})}/></label><CellSelect id={m.id+"-unit"} label="ед." value={m.unit} options={doseUnits} onChange={unit=>set({unit})}/></>
     :<Cell m={m} k="dose" label="разовая доза" unit={m.unit||'мг/кг'} bad={bad('dose')} set={set}/>}
    <Cell m={m} k="interval" label="интервал" unit="ч" bad={bad('interval')} set={set}/>
    <label className={'cell'+(bad('loadingDose')?' bad':'')}><span>нагрузка</span><input inputMode="decimal" value={ru(m.loadingDose)} aria-label="нагрузочная доза" onChange={e=>setLoading(dot(e.target.value))}/><span>{m.unit.startsWith('мкг')?'мкг/кг':'мг/кг'}</span></label>
    <Cell m={m} k="first" label="первое" type="time" bad={bad('first')} set={set}/>
    {needsDuration(m.route)&&<Cell m={m} k="infusionHours" label="за" unit="ч" bad={bad('infusionHours')||bad('minutes')} set={set}/>}
    {takesDilution(m.route)&&<><Cell m={m} k="volume" label="до" unit="мл" bad={bad('volume')} set={set}/>
    <CellSelect id={m.id+"-diluent"} label="в" value={m.diluent} options={diluents} onChange={diluent=>set({diluent})}/></>}
    <CellSelect id={m.id+"-route"} label="путь" value={m.route} options={routes} onChange={route=>set({route})}/>
   </>}
   {!blood&&<button type="button" className="cell more" aria-expanded={more} onClick={()=>setMore(!more)}>{more?'скрыть':'ещё'}</button>}
  </div>
  {more&&!blood&&<div className="cells">
   {!continuous&&<Cell m={m} k="stock" label="исходная конц." unit="мг/мл" bad={bad('stock')} set={set}/>}
   {m.loading&&<><Cell m={m} k="loadingVolume" label="нагрузка до" unit="мл" bad={bad('loadingVolume')} set={set}/><Cell m={m} k="loadingHours" label="нагрузка за" unit="ч" bad={bad('loadingHours')||bad('loadingMinutes')} set={set}/><Cell m={m} k="loadingFirst" label="нагрузка в" type="time" bad={bad('loadingFirst')} set={set}/><label className={'cell wide'+(bad('loadingSource')?' bad':'')}><span>источник схемы</span><input value={m.loadingSource} aria-label="источник схемы с нагрузкой" onChange={e=>set({loadingSource:e.target.value})}/></label></>}
   {d?.hint&&<p className="dose-hint">{d.hint} <small>{drugDirectorySource}</small></p>}
  </div>}
  <div className="out">{out}</div>
 </article>;
}
