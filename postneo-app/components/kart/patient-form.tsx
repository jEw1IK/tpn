'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {api} from '@/lib/base';
import {Inp,Sel} from '@/components/calc/fields';
import {todayIso} from '@/lib/sheet-flow';
import type {Patient} from '@/lib/server/patients';

type Form={surname:string;historyNumber:string;birthDate:string;birthTime:string;sex:string;gestationWeeks:string;gestationDays:string;birthWeight:string;admittedOn:string;diagnosis:string};
const fromPatient=(p?:Patient):Form=>p?{surname:p.surname,historyNumber:p.history_number,birthDate:p.birth_date,birthTime:p.birth_time??'',sex:p.sex,gestationWeeks:p.gestation_weeks===null?'':String(p.gestation_weeks),gestationDays:p.gestation_days===null?'':String(p.gestation_days),birthWeight:p.birth_weight===null?'':String(p.birth_weight),admittedOn:p.admitted_on,diagnosis:p.diagnosis}
 :{surname:'',historyNumber:'',birthDate:todayIso(),birthTime:'',sex:'',gestationWeeks:'',gestationDays:'0',birthWeight:'',admittedOn:todayIso(),diagnosis:''};
const num=(v:string)=>v.trim()===''?null:Number(v.replace(',','.'));

/** Карточка при поступлении: то, что потом само попадает в шапку каждого листа. */
export function PatientForm({patient}:{patient?:Patient}){
 const router=useRouter();const [f,setF]=useState<Form>(()=>fromPatient(patient));const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const set=(patch:Partial<Form>)=>setF(old=>({...old,...patch}));
 const submit=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError('');
  const body={surname:f.surname,historyNumber:f.historyNumber,birthDate:f.birthDate,birthTime:f.birthTime,sex:f.sex,gestationWeeks:num(f.gestationWeeks),gestationDays:num(f.gestationDays),birthWeight:num(f.birthWeight),admittedOn:f.admittedOn,diagnosis:f.diagnosis};
  try{const res=patient?await api<{patient:Patient}>('/api/patients/'+patient.id,{method:'PATCH',json:body}):await api<{patient:Patient}>('/api/patients',{method:'POST',json:body});router.push('/patients/'+res.patient.id);router.refresh();}
  catch(err){setError((err as Error).message);}finally{setBusy(false);}};
 return <form className="kwrap" onSubmit={submit}>
  <div className="khead"><h1>{patient?'Карточка: '+patient.surname:'Новый пациент'}</h1><span className="sp"/><Link className="btn" href={patient?'/patients/'+patient.id:'/patients'}>Отмена</Link><button className="btn primary" type="submit" disabled={busy}>{patient?'Сохранить':'Завести'}</button></div>
  <div className="card"><h2>Пациент</h2><div className="grid c3">
   <Inp id="surname" label="Фамилия" mode="text" value={f.surname} onChange={surname=>set({surname})}/>
   <Inp id="historyNumber" label="№ истории" mode="text" value={f.historyNumber} onChange={historyNumber=>set({historyNumber})}/>
   <Sel id="sex" label="Пол" value={f.sex} onChange={sex=>set({sex})} options={[['','—'],['male','Мужской'],['female','Женский'],['undetermined','Не определён']]}/>
   <Inp id="birthDate" label="Дата рождения" type="date" value={f.birthDate} onChange={birthDate=>set({birthDate})}/>
   <Inp id="birthTime" label="Время рождения" type="time" value={f.birthTime} onChange={birthTime=>set({birthTime})}/>
   <Inp id="admittedOn" label="Поступил в отделение" type="date" value={f.admittedOn} onChange={admittedOn=>set({admittedOn})}/>
   <Inp id="gestationWeeks" label="ГВ при рождении" unit="нед" value={f.gestationWeeks} onChange={gestationWeeks=>set({gestationWeeks})}/>
   <Inp id="gestationDays" label="и дней" unit="дн" value={f.gestationDays} onChange={gestationDays=>set({gestationDays})}/>
   <Inp id="birthWeight" label="Масса при рождении" unit="г" value={f.birthWeight} onChange={birthWeight=>set({birthWeight})}/>
  </div>
  <label className="f"><span className="l">Диагноз, заметки</span><span className="w" style={{height:'auto'}}><textarea value={f.diagnosis} onChange={e=>set({diagnosis:e.target.value})} rows={3} style={{width:'100%',border:0,background:'transparent',padding:'8px 0',resize:'vertical',font:'inherit',color:'inherit'}}/></span></label>
  {error&&<p className="err" role="alert">{error}</p>}
  <p className="hint">Сутки жизни и ПКВ считаются от даты рождения сами. Масса при рождении становится первым взвешиванием.</p></div>
 </form>;
}
