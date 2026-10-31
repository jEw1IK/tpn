'use client';

import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {api} from '@/lib/base';
import {cleanPatient,validatePatient,type PatientData,type PatientRowWire} from '@/lib/kart-view';
import {readPatient,sealPatient,sealWeight} from '@/lib/kart-client';
import {nameKey,parsePatientList} from '@/lib/patient-import';
import {useVault} from './vault';

type Row={id:number;sel:boolean;surname:string;historyNumber:string;sex:string;birthDate:string;admittedOn:string;gw:string;weight:string;diagnosis:string;approx:boolean;dup:boolean;done:boolean;msg:string};
const num=(v:string)=>v.trim()===''?null:Number(v.replace(',','.'));
const toData=(r:Row):PatientData=>cleanPatient({surname:r.surname,historyNumber:r.historyNumber,birthDate:r.birthDate,birthTime:'',sex:r.sex,gestationWeeks:num(r.gw),gestationDays:0,birthWeight:num(r.weight),admittedOn:r.admittedOn||r.birthDate,diagnosis:r.diagnosis});

/** Завести пациентов списком: текст из МИС разбирается и шифруется прямо в браузере, на сервер уходят только шифротексты. */
export function PatientImport(){
 const v=useVault();
 const [text,setText]=useState('');const [rows,setRows]=useState<Row[]|null>(null);const [known,setKnown]=useState<Set<string>>(new Set());
 const [busy,setBusy]=useState(false);const [note,setNote]=useState('');
 useEffect(()=>{let alive=true;(async()=>{try{const {patients}=await api<{patients:PatientRowWire[]}>('/api/patients?status=active');const s=new Set<string>();
  for(const r of patients){try{const p=await readPatient(v.key,r);s.add(nameKey(p.surname));if(p.historyNumber.trim())s.add('#'+p.historyNumber.trim());}catch{}}if(alive)setKnown(s);}catch{}})();return()=>{alive=false;};},[v.key]);
 const parse=()=>{const list=parsePatientList(text);setNote(list.length?'':'В тексте не нашлось ни одного пациента');
  setRows(list.map((p,i)=>{const dup=known.has(nameKey(p.surname))||(!!p.historyNumber&&known.has('#'+p.historyNumber));return {id:i,sel:!dup,surname:p.surname,historyNumber:p.historyNumber??'',sex:p.sex,birthDate:p.birthDate??'',admittedOn:p.admittedOn??'',gw:'',weight:p.birthWeight??'',diagnosis:p.diagnosis,approx:!!p.birthFromAge,dup,done:false,msg:dup?'уже в отделении':''};}));};
 const set=(id:number,patch:Partial<Row>)=>setRows(old=>old&&old.map(r=>r.id===id?{...r,...patch}:r));
 const problems=(r:Row)=>validatePatient(toData(r));
 const todo=useMemo(()=>(rows??[]).filter(r=>r.sel&&!r.done),[rows]);
 const ready=todo.filter(r=>!problems(r).length);
 const run=async()=>{if(!v.key){setNote('Ключ отделения закрыт');return;}setBusy(true);let ok=0;
  for(const r of ready){try{const data=toData(r);
    const res=await api<{patient:PatientRowWire}>('/api/patients',{method:'POST',json:{enc:await sealPatient(v.key,data)}});
    if(data.birthWeight)await api('/api/patients/'+res.patient.id+'/weights',{method:'POST',json:{date:data.birthDate,enc:await sealWeight(v.key,data.birthWeight)}});
    set(r.id,{done:true,sel:false,msg:'заведён'});ok++;
   }catch(e){set(r.id,{msg:(e as Error).message});}}
  setBusy(false);setNote('Заведено: '+ok+(ok<ready.length?', с ошибкой: '+(ready.length-ok):''));};

 return <div className="kwrap">
  <div className="khead"><h1>Пациенты списком</h1><span className="sp"/><Link className="btn" href="/patients">К списку</Link></div>
  {!rows&&<div className="card"><h2>1. Вставьте список</h2>
   <p className="hint">Подойдёт таблица отделения из МИС, открытая в Excel (выделить всё, Ctrl+C), печать «Список больных» или просто фамилия на строку. Вставьте сюда Ctrl+V. Текст не уходит на сервер: разбор и шифрование идут на этом компьютере.</p>
   <textarea className="imp-text" value={text} onChange={e=>setText(e.target.value)} rows={12} aria-label="Список больных"/>
   <div className="khead"><span className="sp"/><button className="btn primary" type="button" disabled={!text.trim()} onClick={parse}>Разобрать</button></div>
   {note&&<p className="err" role="alert">{note}</p>}</div>}
  {rows&&<>
   <div className="card"><h2>2. Отметьте тех, кто сейчас в отделении, и заполните пустое</h2>
    <p className="hint">Обязательны № истории, пол и дата рождения. Если в таблице нет даты рождения, берётся дата госпитализации. Пустое поступление = дата рождения. Умерших и переведённых снимите галочкой. Масса при рождении необязательна, текущие веса вносятся в листах.</p>
    <div className="khead"><button className="btn" type="button" onClick={()=>setRows(rows.map(r=>r.done?r:{...r,sel:true}))}>Отметить всех</button><button className="btn" type="button" onClick={()=>setRows(rows.map(r=>({...r,sel:false})))}>Снять все</button><button className="btn" type="button" onClick={()=>{setRows(null);setNote('');}}>Другой список</button><span className="sp"/><span className="hint">отмечено {todo.length}, готово {ready.length}</span></div>
   </div>
   <div className="imp">
    <div className="imp-row imp-h" aria-hidden="true"><span/><span>Пациент</span><span>№ истории</span><span>Пол</span><span>Дата рождения</span><span>Поступил</span><span>ГВ, нед</span><span>Масса, г</span></div>
    {rows.map(r=>{const bad=r.sel&&!r.done?problems(r):[];return <div key={r.id} className={'imp-row'+(r.sel?'':' off')+(r.done?' done':'')}>
     <input type="checkbox" checked={r.sel} disabled={r.done||busy} onChange={e=>set(r.id,{sel:e.target.checked})} aria-label={'Завести: '+r.surname}/>
     <span className="imp-name"><input value={r.surname} disabled={r.done} onChange={e=>set(r.id,{surname:e.target.value})} aria-label="Фамилия"/>{r.diagnosis&&<small title={r.diagnosis}>{r.diagnosis}</small>}{r.approx&&!r.done&&!bad.length&&!r.msg&&<small className="warn">дата рождения посчитана по возрасту, проверьте</small>}{(r.msg||bad.length>0)&&<small className={r.done?'ok':'warn'}>{r.msg||bad.join('; ')}</small>}</span>
     <input value={r.historyNumber} disabled={r.done} onChange={e=>set(r.id,{historyNumber:e.target.value})} aria-label="№ истории"/>
     <select value={r.sex} disabled={r.done} onChange={e=>set(r.id,{sex:e.target.value})} aria-label="Пол"><option value="">—</option><option value="male">М</option><option value="female">Ж</option><option value="undetermined">не опр.</option></select>
     <input type="date" value={r.birthDate} disabled={r.done} onChange={e=>set(r.id,{birthDate:e.target.value,approx:false})} aria-label="Дата рождения" className={r.approx&&!r.done?'approx':undefined} title={r.approx?'Посчитана по возрасту из МИС: проверьте':undefined}/>
     <input type="date" value={r.admittedOn} disabled={r.done} onChange={e=>set(r.id,{admittedOn:e.target.value})} aria-label="Поступил"/>
     <input inputMode="numeric" value={r.gw} disabled={r.done} onChange={e=>set(r.id,{gw:e.target.value})} aria-label="ГВ при рождении, недель"/>
     <input inputMode="numeric" value={r.weight} disabled={r.done} onChange={e=>set(r.id,{weight:e.target.value})} aria-label="Масса при рождении, г"/>
    </div>;})}
   </div>
   <div className="khead">{note&&<span className="hint" role="status">{note}</span>}<span className="sp"/><button className="btn primary" type="button" disabled={busy||!ready.length} onClick={run}>{busy?'Завожу…':'Завести готовых ('+ready.length+')'}</button></div>
  </>}
 </div>;
}
