'use client';

import {useState} from 'react';
import {api} from '@/lib/base';
import {generateRecoveryCode,rewrapRecovery,rewrapWithPassphrase} from '@/lib/crypto';
import {readPatient,readSheets,readWeights,sealPatient,sealSheet,sealWeight} from '@/lib/kart-client';
import type {PatientRowWire,SheetWire,WeightWire} from '@/lib/kart-view';
import {printRecovery,useVault} from './vault';

/** Страница «Ключ»: состояние на этом компьютере, смена фразы, новый лист восстановления, перешифровка старых записей. */
export function VaultAdmin(){
 const v=useVault();const [p1,setP1]=useState('');const [p2,setP2]=useState('');const [busy,setBusy]=useState('');const [msg,setMsg]=useState('');const [error,setError]=useState('');const [code,setCode]=useState('');
 const run=async(what:string,fn:()=>Promise<string>)=>{setBusy(what);setError('');setMsg('');try{setMsg(await fn());await v.refresh();}catch(e){setError((e as Error).message);}finally{setBusy('');}};
 const changePass=(e:React.FormEvent)=>{e.preventDefault();if(p1!==p2){setError('Фразы не совпадают');return;}run('pass',async()=>{
  if(!v.record||!v.rawKey)throw new Error('Сначала откройте ключ');
  const next=await rewrapWithPassphrase(v.record,v.rawKey,p1);
  const newCode=generateRecoveryCode();
  const recovery_wrapped_key=await rewrapRecovery(v.rawKey,next.kdf_salt,newCode);
  await api('/api/vault',{method:'PUT',json:{...next,recovery_wrapped_key}});
  setP1('');setP2('');setCode(newCode);
  return 'Фраза изменена. На других компьютерах её спросят заново. Код восстановления тоже новый: распечатайте и замените лист в сейфе.';
 });};
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
  <div className="khead"><h1>Ключ отделения</h1><span className="hint">{v.status==='ready'?'открыт на этом компьютере':v.status==='locked'?'закрыт':v.status==='none'?'не создан':''}</span></div>
  {error&&<p className="err" role="alert">{error}</p>}{msg&&<p className="lead">{msg}</p>}
  {code&&<div className="card"><h2>Новый код восстановления</h2><p style={{fontFamily:'ui-monospace,monospace',fontSize:22,letterSpacing:'.06em',userSelect:'all'}}>{code}</p><p><button type="button" className="btn" onClick={()=>printRecovery(code)}>Распечатать</button> <button type="button" className="tb" onClick={()=>setCode('')}>Скрыть</button></p></div>}
  <div className="two-col">
   <div className="card"><h2>На этом компьютере</h2>
    <p className="hint">Ключ хранится в браузере этого компьютера, пока его не забыть. На общем или чужом компьютере лучше забыть ключ после работы.</p>
    {v.status==='ready'?<button type="button" className="btn" onClick={v.forget}>Забыть ключ на этом компьютере</button>:<p className="lead">Ключ закрыт. Откройте его на странице пациентов.</p>}
    {plain&&plainTotal>0&&<><h2 style={{marginTop:20}}>Старые открытые записи</h2><p className="lead">Пациентов {plain.patients}, взвешиваний {plain.weights}, листов {plain.sheets}. Они заведены до включения шифрования и лежат на сервере открытым текстом.</p><button type="button" className="btn primary" onClick={encryptAll} disabled={!!busy||v.status!=='ready'}>{busy==='enc'?'Шифрую…':'Зашифровать всё'}</button></>}
   </div>
   <div className="card"><h2>Сменить фразу отделения</h2>
    <p className="hint">Ключ данных остаётся прежним, записи не перешифровываются. На других компьютерах новую фразу спросят при следующем входе.</p>
    <form onSubmit={changePass}>
     <label className="f"><span className="l">Новая фраза (от 12 знаков)</span><span className="w"><input type="password" value={p1} onChange={e=>setP1(e.target.value)} autoComplete="new-password"/></span></label>
     <label className="f"><span className="l">Ещё раз</span><span className="w"><input type="password" value={p2} onChange={e=>setP2(e.target.value)} autoComplete="new-password"/></span></label>
     <p><button className="btn primary" type="submit" disabled={!!busy||v.status!=='ready'||p1.length<12}>{busy==='pass'?'Меняю…':'Сменить фразу'}</button> <button type="button" className="tb" onClick={newCode} disabled={!!busy||v.status!=='ready'}>Только новый код восстановления</button></p>
    </form>
   </div>
  </div>
 </div>;
}
