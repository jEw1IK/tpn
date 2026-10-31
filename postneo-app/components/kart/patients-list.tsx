'use client';

import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Plus,Search} from 'lucide-react';
import {api,ruDate} from '@/lib/base';
import {glance,type Glance,type Patient,type PatientRowWire} from '@/lib/kart-view';
import {readLastWeight,readPatient} from '@/lib/kart-client';
import {todayIso} from '@/lib/sheet-flow';
import {useVault} from './vault';

type Row={patient:Patient;glance:Glance;lastSheet:{date:string;status:string}|null};

/** Список пациентов: строки приходят шифротекстом, расшифровываются и ищутся прямо здесь. */
export function PatientsList({status,canEdit}:{status:'active'|'discharged';canEdit:boolean}){
 const v=useVault();const [q,setQ]=useState('');const [rows,setRows]=useState<Row[]|null>(null);const [error,setError]=useState('');
 useEffect(()=>{let alive=true;setRows(null);setError('');
  (async()=>{try{
   const {patients}=await api<{patients:PatientRowWire[]}>('/api/patients?status='+status);const date=todayIso();const out:Row[]=[];
   for(const r of patients){const p=await readPatient(v.key,r);const lw=await readLastWeight(v.key,r);out.push({patient:p,glance:glance(p,lw?[lw]:[],date),lastSheet:r.last_sheet_date?{date:r.last_sheet_date,status:r.last_sheet_status||'draft'}:null});}
   out.sort((a,b)=>a.patient.surname.localeCompare(b.patient.surname,'ru'));
   if(alive)setRows(out);
  }catch(e){if(alive)setError((e as Error).message);}})();
  return ()=>{alive=false;};
 },[status,v.key]);
 const list=(rows??[]).filter(r=>!q.trim()||(r.patient.surname+' '+r.patient.historyNumber).toLowerCase().includes(q.trim().toLowerCase()));
 return <div className="kwrap">
  <div className="khead"><h1>{status==='active'?'Пациенты в отделении':'Выписанные'}</h1><span className="hint">{rows?rows.length:'…'}</span><span className="sp"/>
   <label className="f" style={{minWidth:220}}><span className="w"><Search size={15} aria-hidden="true"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="фамилия или № истории" aria-label="Поиск пациента"/></span></label>
   <Link className="btn" href={status==='active'?'/patients?status=discharged':'/patients'}>{status==='active'?'Выписанные':'В отделении'}</Link>
   {canEdit&&status==='active'&&<Link className="btn" href="/patients/import">Списком</Link>}
   {canEdit&&<Link className="btn primary" href="/patients/new"><Plus size={15} aria-hidden="true"/>Новый пациент</Link>}
  </div>
  {error&&<p className="err" role="alert">{error}</p>}
  {rows&&list.length===0&&<p className="lead">{q?'Никого не нашёл.':'Пока никого нет. Заведите первого пациента.'}</p>}
  <div className="plist">{list.map(({patient:p,glance:g,lastSheet:s})=><Link key={p.id} href={'/patients/'+p.id} className="prow">
   <span><b>{p.surname}</b><small>№ {p.historyNumber} · род. {ruDate(p.birthDate)}{!p.encrypted&&' · не зашифрован'}</small></span>
   <span><span className="k">Сутки</span><br/><span className="v">{g.day??'—'}</span></span>
   <span><span className="k">ПКВ</span><br/><span className="v">{g.pcv?g.pcv.weeks+' нед '+g.pcv.days+' дн':'—'}</span></span>
   <span><span className="k">Масса</span><br/><span className="v">{g.lastWeight?g.lastWeight.grams+' г':'—'}</span></span>
   <span><span className="k">Лист</span><br/><span className="v">{s?ruDate(s.date):'нет'}</span></span>
   <span className={'st '+(s?s.status:'')}>{s?(s.status==='signed'?'подписан':'черновик'):'без листа'}</span>
  </Link>)}</div>
 </div>;
}
