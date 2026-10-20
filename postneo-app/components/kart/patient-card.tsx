'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {FilePlus,Pencil} from 'lucide-react';
import {api,ruDate} from '@/lib/base';
import {formatNumber as f} from '@/lib/format';
import {todayIso} from '@/lib/sheet-flow';
import type {CourseInfo,WeightPoint} from '@/lib/sheet-flow';
import type {Patient,SheetSummary} from '@/lib/server/patients';

type Glance={day:number|null;pcv:{weeks:number;days:number}|null;lastWeight:WeightPoint|null;lastSheet:{date:string;status:string;summary:SheetSummary}|null};
type SheetBrief={date:string;status:'draft'|'signed';summary:SheetSummary;updated_at:string};
const sexNames:Record<string,string>={male:'мальчик',female:'девочка',undetermined:'пол не определён'};

export function PatientCard({patient,weights,sheets,courses,glance,canEdit}:{patient:Patient;weights:WeightPoint[];sheets:SheetBrief[];courses:CourseInfo[];glance:Glance;canEdit:boolean}){
 const router=useRouter();const [wDate,setWDate]=useState(todayIso());const [wGrams,setWGrams]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const today=todayIso();const todaySheet=sheets.find(s=>s.date===today);
 const birth=patient.birth_weight;const last=glance.lastWeight;const fromBirth=birth&&last?100*(last.grams-birth)/birth:null;
 const addWeight=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError('');try{await api('/api/patients/'+patient.id+'/weights',{method:'POST',json:{date:wDate,grams:Number(wGrams.replace(',','.'))}});setWGrams('');router.refresh();}catch(err){setError((err as Error).message);}finally{setBusy(false);}};
 const setStatus=async(status:'active'|'discharged')=>{if(status==='discharged'&&!confirm('Выписать '+patient.surname+'? Карточка и листы останутся в архиве.'))return;setBusy(true);try{await api('/api/patients/'+patient.id,{method:'PATCH',json:{status,dischargedOn:today}});router.refresh();}catch(err){setError((err as Error).message);}finally{setBusy(false);}};
 return <div className="kwrap">
  <div className="khead"><h1>{patient.surname}</h1><span className="hint">№ {patient.history_number} · {sexNames[patient.sex]??'—'} · род. {ruDate(patient.birth_date)}{patient.birth_time?' '+patient.birth_time:''} · поступил {ruDate(patient.admitted_on)}</span><span className="sp"/>
   {canEdit&&<Link className="btn" href={'/patients/'+patient.id+'/edit'}><Pencil size={14} aria-hidden="true"/>Карточка</Link>}
   {canEdit&&patient.status==='active'&&<Link className="btn primary" href={'/patients/'+patient.id+'/sheet/'+today}><FilePlus size={15} aria-hidden="true"/>{todaySheet?'Лист на сегодня':'Новый лист на сегодня'}</Link>}
  </div>
  {patient.status==='discharged'&&<p className="lead">Выписан {ruDate(patient.discharged_on||'')}. {canEdit&&<button type="button" className="tb" onClick={()=>setStatus('active')} disabled={busy}>Вернуть в отделение</button>}</p>}
  <div className="two-col">
   <div className="card"><h2>Сегодня, {ruDate(today)}</h2><dl className="facts">
    <div><dt>Сутки жизни</dt><dd>{glance.day??'—'}</dd></div>
    <div><dt>ПКВ</dt><dd>{glance.pcv?glance.pcv.weeks+' нед '+glance.pcv.days+' дн':'—'}</dd></div>
    <div><dt>ГВ при рождении</dt><dd>{patient.gestation_weeks?patient.gestation_weeks+' нед '+(patient.gestation_days??0)+' дн':'—'}</dd></div>
    <div><dt>Масса при рождении</dt><dd>{birth?birth+' г':'—'}</dd></div>
    <div><dt>Последняя масса</dt><dd>{last?last.grams+' г':'—'}{last&&<small style={{display:'block',fontWeight:400,color:'var(--mute)',fontSize:11}}>{ruDate(last.date)}{fromBirth!==null?' · '+(fromBirth>0?'+':'')+f(fromBirth,1)+' % от рождения':''}</small>}</dd></div>
    <div><dt>Койко-день</dt><dd>{patient.admitted_on?Math.max(1,Math.round((Date.parse(today)-Date.parse(patient.admitted_on))/86400000)+1):'—'}</dd></div>
   </dl>{patient.diagnosis&&<p className="hint" style={{whiteSpace:'pre-wrap'}}>{patient.diagnosis}</p>}</div>
   <div className="card"><h2>Курсы препаратов по листам</h2>{courses.length?<ul className="courses">{courses.map(c=><li key={c.drug}><span>{c.name}</span><b>день {c.day}{c.day>1&&<span className="hint"> · с {ruDate(c.since)}</span>}</b></li>)}</ul>:<p className="hint">В последнем листе препаратов нет.</p>}<p className="hint">День курса считается по листам подряд: пропуск дня обрывает отсчёт.</p></div>
  </div>
  <div className="two-col">
   <div className="card"><h2>Листы</h2>{sheets.length?<table className="ktab"><thead><tr><th>Дата</th><th>Статус</th><th className="num">мл/кг</th><th className="num">в линии</th><th className="num">белок</th><th>Препараты</th></tr></thead><tbody>{sheets.map(s=><tr key={s.date}><td><Link href={'/patients/'+patient.id+'/sheet/'+s.date}>{ruDate(s.date)}</Link></td><td><span className={'st '+s.status}>{s.status==='signed'?'подписан':'черновик'}</span></td><td className="num">{s.summary.perKg??'—'}</td><td className="num">{s.summary.linePercent!==null&&s.summary.linePercent!==undefined?f(s.summary.linePercent,1)+' %':'—'}</td><td className="num">{s.summary.protein!==null&&s.summary.protein!==undefined?f(s.summary.protein,1):'—'}</td><td>{s.summary.drugs?.join(', ')||'—'}</td></tr>)}</tbody></table>:<p className="hint">Листов пока нет. Первый лист возьмёт шапку из карточки.</p>}
    {canEdit&&patient.status==='active'&&<p className="hint">Лист на другую дату: <Link href={'/patients/'+patient.id+'/sheet/'+today}>{ruDate(today)}</Link> или откройте любую дату вида /sheet/ГГГГ-ММ-ДД.</p>}</div>
   <div className="card"><h2>Взвешивания</h2><table className="ktab"><thead><tr><th>Дата</th><th className="num">Масса, г</th><th className="num">За сутки</th></tr></thead><tbody>{[...weights].reverse().map((w,i,arr)=>{const prev=arr[i+1];return <tr key={w.date}><td>{ruDate(w.date)}</td><td className="num">{w.grams}</td><td className="num">{prev?(w.grams-prev.grams>0?'+':'')+(w.grams-prev.grams)+' г':''}</td></tr>;})}</tbody></table>
    {canEdit&&<form className="inline" onSubmit={addWeight}><label className="f"><span className="l">Дата</span><span className="w"><input type="date" value={wDate} onChange={e=>setWDate(e.target.value)}/></span></label><label className="f"><span className="l">Масса</span><span className="w"><input inputMode="decimal" value={wGrams} onChange={e=>setWGrams(e.target.value)} placeholder="г"/></span></label><button className="btn" type="submit" disabled={busy||!wGrams}>Записать</button></form>}
    {error&&<p className="err" role="alert">{error}</p>}</div>
  </div>
  {canEdit&&patient.status==='active'&&<p className="hint"><button type="button" className="tb" onClick={()=>setStatus('discharged')} disabled={busy}>Выписать</button></p>}
 </div>;
}
