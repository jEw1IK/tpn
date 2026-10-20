'use client';

import {useState} from 'react';
import Link from 'next/link';
import {Plus,Search} from 'lucide-react';
import {ruDate} from '@/lib/base';
import type {Patient,SheetSummary} from '@/lib/server/patients';

export type PatientRow=Patient&{glance:{day:number|null;pcv:{weeks:number;days:number}|null;lastWeight:{date:string;grams:number}|null;lastSheet:{date:string;status:string;summary:SheetSummary}|null}};

export function PatientsList({patients,status,canEdit}:{patients:PatientRow[];status:'active'|'discharged';canEdit:boolean}){
 const [q,setQ]=useState('');
 const list=patients.filter(p=>!q.trim()||(p.surname+' '+p.history_number).toLowerCase().includes(q.trim().toLowerCase()));
 return <div className="kwrap">
  <div className="khead"><h1>{status==='active'?'Пациенты в отделении':'Выписанные'}</h1><span className="hint">{patients.length}</span><span className="sp"/>
   <label className="f" style={{minWidth:220}}><span className="w"><Search size={15} aria-hidden="true"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="фамилия или № истории" aria-label="Поиск пациента"/></span></label>
   <Link className="btn" href={status==='active'?'/patients?status=discharged':'/patients'}>{status==='active'?'Выписанные':'В отделении'}</Link>
   {canEdit&&<Link className="btn primary" href="/patients/new"><Plus size={15} aria-hidden="true"/>Новый пациент</Link>}
  </div>
  {list.length===0&&<p className="lead">{q?'Никого не нашёл.':'Пока никого нет. Заведите первого пациента.'}</p>}
  <div className="plist">{list.map(p=>{const g=p.glance;const s=g.lastSheet;return <Link key={p.id} href={'/patients/'+p.id} className="prow">
   <span><b>{p.surname}</b><small>№ {p.history_number} · род. {ruDate(p.birth_date)}</small></span>
   <span><span className="k">Сутки</span><br/><span className="v">{g.day??'—'}</span></span>
   <span><span className="k">ПКВ</span><br/><span className="v">{g.pcv?g.pcv.weeks+' нед '+g.pcv.days+' дн':'—'}</span></span>
   <span><span className="k">Масса</span><br/><span className="v">{g.lastWeight?g.lastWeight.grams+' г':'—'}</span></span>
   <span><span className="k">Лист</span><br/><span className="v">{s?ruDate(s.date):'нет'}</span></span>
   <span className={'st '+(s?s.status:'')}>{s?(s.status==='signed'?'подписан':'черновик'):'без листа'}</span>
  </Link>;})}</div>
 </div>;
}
