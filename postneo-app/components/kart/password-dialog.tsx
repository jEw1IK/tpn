'use client';

import {useState} from 'react';
import {KeyRound} from 'lucide-react';
import {api} from '@/lib/base';
import {wrapForPassword} from '@/lib/crypto';
import {useVault} from './vault';

/** Смена своего пароля из шапки. */
export function PasswordButton(){
 const v=useVault();
 const [open,setOpen]=useState(false);const [o,setO]=useState('');const [n1,setN1]=useState('');const [n2,setN2]=useState('');const [msg,setMsg]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const submit=async(e:React.FormEvent)=>{e.preventDefault();setError('');setMsg('');if(n1!==n2){setError('Новые пароли не совпадают');return;}setBusy(true);
  try{const keyWrap=v.rawKey?await wrapForPassword(v.rawKey,n1):null;await api('/api/me',{method:'PATCH',json:{oldPassword:o,newPassword:n1,keyWrap}});setMsg('Пароль изменён. На других компьютерах нужно будет войти заново.');setO('');setN1('');setN2('');}
  catch(err){setError((err as Error).message);}finally{setBusy(false);}};
 return <>
  <button type="button" className="tb" onClick={()=>setOpen(true)} title="Сменить свой пароль"><KeyRound size={14} aria-hidden="true"/>Пароль</button>
  {open&&<div role="dialog" aria-modal="true" aria-label="Смена пароля" style={{position:'fixed',inset:0,background:'rgba(0,0,0,.35)',display:'grid',placeItems:'center',zIndex:50}} onClick={()=>setOpen(false)}>
   <form className="card" style={{width:'min(420px,92vw)'}} onClick={e=>e.stopPropagation()} onSubmit={submit}>
    <h2>Сменить пароль</h2>
    <label className="f"><span className="l">Текущий пароль</span><span className="w"><input type="password" value={o} onChange={e=>setO(e.target.value)} autoComplete="current-password" autoFocus required/></span></label>
    <label className="f"><span className="l">Новый (не короче 8)</span><span className="w"><input type="password" value={n1} onChange={e=>setN1(e.target.value)} autoComplete="new-password" required minLength={8}/></span></label>
    <label className="f"><span className="l">Ещё раз</span><span className="w"><input type="password" value={n2} onChange={e=>setN2(e.target.value)} autoComplete="new-password" required/></span></label>
    {error&&<p className="err" role="alert">{error}</p>}{msg&&<p className="hint">{msg}</p>}
    <p style={{display:'flex',gap:10}}><button className="btn primary" type="submit" disabled={busy}>Сменить</button><button type="button" className="btn" onClick={()=>setOpen(false)}>Закрыть</button></p>
   </form>
  </div>}
 </>;
}
