'use client';

import {useState} from 'react';
import {api} from '@/lib/base';
import {generateRecoveryCode,rewrapRecovery} from '@/lib/crypto';
import {readPatient,readSheets,readWeights,sealPatient,sealSheet,sealWeight} from '@/lib/kart-client';
import type {PatientRowWire,SheetWire,WeightWire} from '@/lib/kart-view';
import {printRecovery,useVault} from './vault';

/** Страница «Ключ»: новый лист восстановления и перешифровка старых записей. */
export function VaultAdmin(){
 const v=useVault();const [busy,setBusy]=useState('');const [msg,setMsg]=useState('');const [error,setError]=useState('');const [code,setCode]=useState('');
 const run=async(what:string,fn:()=>Promise<string>)=>{setBusy(what);setError('');setMsg('');try{setMsg(await fn());await v.refresh();}catch(e){setError((e as Error).message);}finally{setBusy('');}};
 const newCode=()=>run('code',async()=>{
  if(!v.record||!v.rawKey)throw new Error('Сначала откройте ключ');
  const c=generateRecoveryCode();await api('/api/vault',{method:'PUT',json:{recovery_wrapped_key:await rewrapRecovery(v.rawKey,v.record.kdf_salt,c)}});setCode(c);
  return 'Старый код больше не действует.';
 });
 const encryptAll=()=>run('enc',async()=>{
  const key=v.key;if(!key)throw new Error('Сначала откройте ключ');
  const {patients}=await api<{patients:PatientRowWire[]}>('/api/patients?status=all');
  let total=0;
  for(const row of patients){
   const bundle=await api<{patient:PatientRowWire;weights:WeightWire[];sheets:SheetWire[]}>('/api/patients/'+row.id);
   const items:{kind:'patient'|'weight'|'sheet';id:number;date?:string;enc:string}[]=[];
   if(!bundle.patient.enc){const p=await readPatient(null,bundle.patient);items.push({kind:'patient',id:row.id,enc:await sealPatient(key,{surname:p.surname,historyNumber:p.historyNumber,birthDate:p.birthDate,birthTime:p.birthTime,sex:p.sex,gestationWeeks:p.gestationWeeks,gestationDays:p.gestationDays,birthWeight:p.birthWeight,admittedOn:p.admittedOn,diagnosis:p.diagnosis})});}
   for(const w of bundle.weights.filter(w=>!w.enc)){const [pt]=await readWeights(null,[w]);if(pt)items.push({kind:'weight',id:row.id,date:w.date,enc:await sealWeight(key,pt.grams)});}
   for(const s of bundle.sheets.filter(s=>!s.enc)){const [sv]=await readSheets(null,[s]);items.push({kind:'sheet',id:row.id,date:s.sheet_date,enc:await sealSheet(key,sv.data)});}
   if(items.length){const r=await api<{changed:number}>('/api/vault/encrypt',{method:'POST',json:{items}});total+=r.changed;}
  }
  return total?`Зашифровано записей: ${total}.`:'Открытых записей не осталось.';
 });
 const plain=v.plain;const plainTotal=plain?plain.patients+plain.weights+plain.sheets:0;
 return <div className="kwrap">
  <div className="khead"><h1>Ключ отделения</h1><span className="hint">{v.status==='ready'?'открыт на этом компьютере':''}</span></div>
  {error&&<p className="err" role="alert">{error}</p>}{msg&&<p className="lead">{msg}</p>}
  {code&&<div className="card"><h2>Новый код восстановления</h2><p style={{fontFamily:'ui-monospace,monospace',fontSize:22,letterSpacing:'.06em',userSelect:'all'}}>{code}</p><p><button type="button" className="btn" onClick={()=>printRecovery(code)}>Распечатать</button> <button type="button" className="tb" onClick={()=>setCode('')}>Скрыть</button></p></div>}
  <div className="two-col">
   <div className="card"><h2>Как устроено</h2>
    <p className="hint">Данные пациентов на сервере зашифрованы. Ключ открывается паролем каждого пользователя: при регистрации его передаёт код приглашения, при смене пароля он перешифровывается сам. Отдельной фразы нет.</p>
    <p className="hint">Код восстановления из сейфа нужен, только если пароли забыли все. Выпустите новый, если старый лист потерян или его видел посторонний.</p>
    <p><button type="button" className="btn" onClick={newCode} disabled={!!busy||v.status!=='ready'}>{busy==='code'?'Выпускаю…':'Новый код восстановления'}</button></p>
   </div>
   <div className="card"><h2>Старые открытые записи</h2>
    {plain&&plainTotal>0?<><p className="lead">Пациентов {plain.patients}, взвешиваний {plain.weights}, листов {plain.sheets}. Они заведены до включения шифрования и лежат на сервере открытым текстом.</p><button type="button" className="btn primary" onClick={encryptAll} disabled={!!busy||v.status!=='ready'}>{busy==='enc'?'Шифрую…':'Зашифровать всё'}</button></>:<p className="hint">Открытых записей нет, всё зашифровано.</p>}
   </div>
  </div>
 </div>;
}
