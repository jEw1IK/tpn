'use client';

import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {ArrowLeft,CheckCircle2,Unlock} from 'lucide-react';
import {Calculator,defaultUi,type Ui} from '@/components/calc/calculator';
import {api,ruDate} from '@/lib/base';
import type {Inputs} from '@/lib/tpn';

type Sheet={status:'draft'|'signed';inputs:Inputs;ui:Record<string,string>;version:number;signed_at:string|null;updated_at:string};
/** Лист пациента: автосохранение черновика на сервер, подпись замораживает лист. */
export function SheetEditor({patientId,surname,date,sheet,role}:{patientId:number;surname:string;date:string;sheet:Sheet;role:'admin'|'doctor'|'nurse'}){
 const router=useRouter();
 const [status,setStatus]=useState(sheet.status);const [save,setSave]=useState<{state:'idle'|'saving'|'saved'|'error';at?:string;text?:string}>({state:'idle'});const [busy,setBusy]=useState(false);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);const latest=useRef<{p:Inputs;ui:Ui}|null>(null);
 const flush=async()=>{const data=latest.current;if(!data)return;latest.current=null;setSave({state:'saving'});
  try{await api('/api/patients/'+patientId+'/sheets/'+date,{method:'PUT',json:{inputs:data.p,ui:data.ui}});setSave({state:'saved',at:new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})});}
  catch(err){latest.current=data;setSave({state:'error',text:(err as Error).message});}};
 const onChange=(p:Inputs,ui:Ui)=>{if(status==='signed')return;latest.current={p,ui};if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(flush,700);};
 useEffect(()=>{const before=(e:BeforeUnloadEvent)=>{if(latest.current){e.preventDefault();}};window.addEventListener('beforeunload',before);return()=>window.removeEventListener('beforeunload',before);},[]);
 const act=async(action:'sign'|'unsign')=>{setBusy(true);try{if(timer.current)clearTimeout(timer.current);await flush();await api('/api/patients/'+patientId+'/sheets/'+date,{method:'POST',json:{action}});setStatus(action==='sign'?'signed':'draft');router.refresh();}catch(err){setSave({state:'error',text:(err as Error).message});}finally{setBusy(false);}};
 const locked=status==='signed'||role==='nurse';
 const toolbar=<>
  <Link className="tb" href={'/patients/'+patientId}><ArrowLeft size={14} aria-hidden="true"/>{surname}</Link>
  <span className="hint">лист на {ruDate(date)}</span>
  <span className={'savestate'+(save.state==='error'?' err':'')} role="status">{status==='signed'?'подписан':save.state==='saving'?'сохраняю…':save.state==='saved'?'сохранено '+save.at:save.state==='error'?'не сохранилось: '+save.text:'черновик'}</span>
  {status==='draft'&&role!=='nurse'&&<button type="button" className="tb" onClick={()=>act('sign')} disabled={busy}><CheckCircle2 size={14} aria-hidden="true"/>Подписать</button>}
  {status==='signed'&&role==='admin'&&<button type="button" className="tb" onClick={()=>act('unsign')} disabled={busy}><Unlock size={14} aria-hidden="true"/>Снять подпись</button>}
 </>;
 const note=status==='signed'?<><b>Лист подписан</b>{sheet.signed_at?' '+new Date(sheet.signed_at).toLocaleString('ru-RU'):''}. Поля закрыты, печать работает. Изменения только через снятие подписи администратором.</>:<><b>Только просмотр.</b> Листы ведёт врач, медсестра смотрит и печатает.</>;
 return <Calculator initial={sheet.inputs} initialUi={{...defaultUi,...(sheet.ui as Partial<Ui>)}} onChange={onChange} locked={locked} lockedNote={note} fixedHeader toolbar={toolbar} allowNew={false}/>;
}
