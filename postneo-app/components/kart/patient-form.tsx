'use client';

import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {api} from '@/lib/base';
import {Inp,Sel} from '@/components/calc/fields';
import {todayIso} from '@/lib/sheet-flow';
import {cleanPatient,validatePatient,type Patient,type PatientData,type PatientRowWire} from '@/lib/kart-view';
import {readPatient,sealPatient} from '@/lib/kart-client';
import {useVault} from './vault';

type Form={surname:string;historyNumber:string;birthDate:string;birthTime:string;sex:string;gestationWeeks:string;gestationDays:string;birthWeight:string;admittedOn:string;diagnosis:string};
const fromPatient=(p?:PatientData):Form=>p?{surname:p.surname,historyNumber:p.historyNumber,birthDate:p.birthDate,birthTime:p.birthTime??'',sex:p.sex,gestationWeeks:p.gestationWeeks===null?'':String(p.gestationWeeks),gestationDays:p.gestationDays===null?'':String(p.gestationDays),birthWeight:p.birthWeight===null?'':String(p.birthWeight),admittedOn:p.admittedOn,diagnosis:p.diagnosis}
 :{surname:'',historyNumber:'',birthDate:todayIso(),birthTime:'',sex:'',gestationWeeks:'',gestationDays:'0',birthWeight:'',admittedOn:todayIso(),diagnosis:''};
const num=(v:string)=>v.trim()===''?null:Number(v.replace(',','.'));

/** Карточка при поступлении: шифруется в браузере и уходит на сервер шифротекстом. */
export function PatientForm({id}:{id?:number}){
 const router=useRouter();const v=useVault();
 const [patient,setPatient]=useState<Patient|null>(null);const [f,setF]=useState<Form>(()=>fromPatient());const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [loaded,setLoaded]=useState(!id);
 useEffect(()=>{if(!id)return;let alive=true;(async()=>{try{const r=await api<{patient:PatientRowWire}>('/api/patients/'+id);const p=await readPatient(v.key,r.patient);if(alive){setPatient(p);setF(fromPatient(p));setLoaded(true);}}catch(e){if(alive)setError((e as Error).message);}})();return()=>{alive=false;};},[id,v.key]);
 const set=(patch:Partial<Form>)=>setF(old=>({...old,...patch}));
 const submit=async(e:React.FormEvent)=>{e.preventDefault();setError('');
  const data=cleanPatient({surname:f.surname,historyNumber:f.historyNumber,birthDate:f.birthDate,birthTime:f.birthTime,sex:f.sex,gestationWeeks:num(f.gestationWeeks),gestationDays:num(f.gestationDays),birthWeight:num(f.birthWeight),admittedOn:f.admittedOn,diagnosis:f.diagnosis});
  const errors=validatePatient(data);if(errors.length){setError(errors.join('; '));return;}
  if(!v.key){setError('Ключ отделения закрыт');return;}
  setBusy(true);
  try{
   const enc=await sealPatient(v.key,data);
   const res=id?await api<{patient:PatientRowWire}>('/api/patients/'+id,{method:'PATCH',json:{enc}}):await api<{patient:PatientRowWire}>('/api/patients',{method:'POST',json:{enc}});
   if(!id&&data.birthWeight){const {sealWeight}=await import('@/lib/kart-client');await api('/api/patients/'+res.patient.id+'/weights',{method:'POST',json:{date:data.birthDate,enc:await sealWeight(v.key,data.birthWeight)}});}
   router.push('/patients/'+res.patient.id);router.refresh();
  }catch(err){setError((err as Error).message);}finally{setBusy(false);}};
 return <form className="kwrap" onSubmit={submit}>
  <div className="khead"><h1>{id?'Карточка: '+(patient?.surname??'…'):'Новый пациент'}</h1><span className="sp"/><Link className="btn" href={id?'/patients/'+id:'/patients'}>Отмена</Link><button className="btn primary" type="submit" disabled={busy||!loaded}>{id?'Сохранить':'Завести'}</button></div>
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
  <p className="hint">Сутки жизни и ПКВ считаются от даты рождения сами. Масса при рождении становится первым взвешиванием. Карточка шифруется ключом отделения до отправки на сервер.</p></div>
 </form>;
}
