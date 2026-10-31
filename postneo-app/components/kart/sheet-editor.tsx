'use client';

import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {ArrowLeft,CheckCircle2,Unlock} from 'lucide-react';
import {Calculator,defaultUi,type Ui} from '@/components/calc/calculator';
import {api,ruDate} from '@/lib/base';
import type {Inputs} from '@/lib/tpn';
import {nextSheetInputs,weightFromSheet,type WeightPoint} from '@/lib/sheet-flow';
import {patientCore,previousSheet,type Patient,type PatientRowWire,type SheetWire,type WeightWire} from '@/lib/kart-view';
import {readPatient,readSheets,readWeights,sealSheet,sealWeight,type SheetView} from '@/lib/kart-client';
import {summarize} from '@/lib/sheet-summary';
import {useVault} from './vault';

type Loaded={patient:Patient;sheet:SheetView;weights:WeightPoint[]};
/** Лист пациента: расшифровывается здесь, черновик автосохраняется шифротекстом, подпись замораживает лист. */
export function SheetEditor({patientId,date,role}:{patientId:number;date:string;role:'admin'|'doctor'|'nurse'}){
 const router=useRouter();const v=useVault();const canEdit=role!=='nurse';
 const [d,setD]=useState<Loaded|null>(null);const [error,setError]=useState('');
 const [status,setStatus]=useState<'draft'|'signed'>('draft');const [save,setSave]=useState<{state:'idle'|'saving'|'saved'|'error';at?:string;text?:string}>({state:'idle'});const [busy,setBusy]=useState(false);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);const latest=useRef<{p:Inputs;ui:Ui}|null>(null);
 useEffect(()=>{let alive=true;setError('');
  (async()=>{try{
   const r=await api<{patient:PatientRowWire;weights:WeightWire[];sheets:SheetWire[]}>('/api/patients/'+patientId);
   const patient=await readPatient(v.key,r.patient);const weights=await readWeights(v.key,r.weights);const sheets=await readSheets(v.key,r.sheets);
   let sheet=sheets.find(s=>s.date===date)??null;
   if(!sheet){
    if(!canEdit||patient.status!=='active')throw new Error('Листа на эту дату нет');
    if(!v.key)throw new Error('Ключ отделения закрыт');
    // новый лист: шапка из карточки, остальное из предыдущего листа и взвешиваний; черновик сразу сохраняется
    const prev=previousSheet(sheets,date);
    const inputs=nextSheetInputs({patient:patientCore(patient),date,previous:prev?.data.inputs??null,weights});
    const data={inputs,ui:prev?.data.ui??{}};
    const res=await api<{sheet:{status:'draft'|'signed';valid:number;updated_at:string;version:number}}>('/api/patients/'+patientId+'/sheets/'+date,{method:'PUT',json:{enc:await sealSheet(v.key,data),valid:summarize(inputs).valid}});
    sheet={id:0,date,status:res.sheet.status,valid:!!res.sheet.valid,version:res.sheet.version,signedAt:null,updatedAt:res.sheet.updated_at,encrypted:true,data};
   }
   if(alive){setD({patient,sheet,weights});setStatus(sheet.status);}
  }catch(e){if(alive)setError((e as Error).message);}})();
  return()=>{alive=false;};
 },[patientId,date,v.key,canEdit]);
 const flush=async()=>{const data=latest.current;if(!data||!d)return;latest.current=null;setSave({state:'saving'});
  try{
   if(!v.key)throw new Error('Ключ отделения закрыт');
   const p=d.patient;
   // шапка листа принадлежит карточке: фамилия, номер и дата рождения из листа не правятся
   const fixed:Inputs={...data.p,surname:p.surname,historyNumber:p.historyNumber,birthDate:p.birthDate,sheetDate:date,sex:p.sex};
   const w=weightFromSheet(fixed);
   await api('/api/patients/'+patientId+'/sheets/'+date,{method:'PUT',json:{enc:await sealSheet(v.key,{inputs:fixed,ui:data.ui}),valid:summarize(fixed).valid,weight:w?{date:w.date,enc:await sealWeight(v.key,w.grams)}:undefined}});
   setSave({state:'saved',at:new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})});
  }catch(err){latest.current=data;setSave({state:'error',text:(err as Error).message});}};
 const onChange=(p:Inputs,ui:Ui)=>{if(status==='signed'||!canEdit)return;latest.current={p,ui};if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(flush,700);};
 useEffect(()=>{const before=(e:BeforeUnloadEvent)=>{if(latest.current){e.preventDefault();}};window.addEventListener('beforeunload',before);return()=>window.removeEventListener('beforeunload',before);},[]);
 const act=async(action:'sign'|'unsign')=>{setBusy(true);try{if(timer.current)clearTimeout(timer.current);await flush();await api('/api/patients/'+patientId+'/sheets/'+date,{method:'POST',json:{action}});setStatus(action==='sign'?'signed':'draft');router.refresh();}catch(err){setSave({state:'error',text:(err as Error).message});}finally{setBusy(false);}};
 if(!d)return <div className="kwrap">{error?<><p className="err" role="alert">{error}</p><Link className="btn" href={'/patients/'+patientId}>К карточке</Link></>:<p className="lead">Открываю лист…</p>}</div>;
 const locked=status==='signed'||!canEdit;
 const toolbar=<>
  <Link className="tb" href={'/patients/'+patientId}><ArrowLeft size={14} aria-hidden="true"/>{d.patient.surname}</Link>
  <span className="hint">лист на {ruDate(date)}</span>
  <span className={'savestate'+(save.state==='error'?' err':'')} role="status">{status==='signed'?'подписан':save.state==='saving'?'сохраняю…':save.state==='saved'?'сохранено '+save.at:save.state==='error'?'не сохранилось: '+save.text:'черновик'}</span>
  {status==='draft'&&canEdit&&<button type="button" className="tb" onClick={()=>act('sign')} disabled={busy}><CheckCircle2 size={14} aria-hidden="true"/>Подписать</button>}
  {status==='signed'&&role==='admin'&&<button type="button" className="tb" onClick={()=>act('unsign')} disabled={busy}><Unlock size={14} aria-hidden="true"/>Снять подпись</button>}
 </>;
 const note=status==='signed'?<><b>Лист подписан</b>{d.sheet.signedAt?' '+new Date(d.sheet.signedAt).toLocaleString('ru-RU'):''}. Поля закрыты, печать работает. Изменения только через снятие подписи администратором.</>:<><b>Только просмотр.</b> Листы ведёт врач, медсестра смотрит и печатает.</>;
 return <Calculator initial={d.sheet.data.inputs} initialUi={{...defaultUi,...(d.sheet.data.ui as Partial<Ui>)}} onChange={onChange} locked={locked} lockedNote={note} fixedHeader toolbar={toolbar} allowNew={false}/>;
}
