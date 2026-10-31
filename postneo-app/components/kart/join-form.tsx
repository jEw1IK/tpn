'use client';

import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {BrandMark} from '@/components/brand-mark';
import {api} from '@/lib/base';
import {roleNames,type Role} from '@/lib/roles';

/** Врач получает код от администратора лично и сам придумывает логин и пароль. Пароль никому не передаётся. */
export function JoinForm({code:initial}:{code:string}){
 const router=useRouter();
 const [code,setCode]=useState(initial);const [role,setRole]=useState<Role|null>(null);const [note,setNote]=useState('');
 const [login,setLogin]=useState('');const [name,setName]=useState('');const [p1,setP1]=useState('');const [p2,setP2]=useState('');
 const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const check=async(c:string)=>{setError('');setRole(null);if(c.replace(/\s/g,'').length<6)return;try{const r=await api<{role:Role;note:string}>('/api/join?code='+encodeURIComponent(c.trim()));setRole(r.role);setNote(r.note);}catch(e){setError((e as Error).message);}};
 useEffect(()=>{if(initial)check(initial);},[initial]);
 const submit=async(e:React.FormEvent)=>{e.preventDefault();setError('');if(p1!==p2){setError('Пароли не совпадают');return;}setBusy(true);
  try{await api('/api/join',{method:'POST',json:{code:code.trim(),login,name,password:p1}});router.push('/patients');router.refresh();}
  catch(err){setError((err as Error).message);}finally{setBusy(false);}};
 return <div className="app login"><form className="card" onSubmit={submit}>
  <span className="brand"><BrandMark/></span>
  <h1 style={{fontSize:18,fontWeight:700,margin:0}}>Регистрация по приглашению</h1>
  <p className="lead">Код выдаёт администратор отделения. Логин и пароль придумываете сами, их никто кроме вас не знает.</p>
  <label className="f"><span className="l">Код приглашения</span><span className="w"><input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} onBlur={()=>check(code)} autoComplete="off" autoFocus required style={{letterSpacing:'.12em',textTransform:'uppercase'}}/></span></label>
  {role&&<p className="hint">Код подходит: роль <b>{roleNames[role]}</b>{note?', '+note:''}.</p>}
  <label className="f"><span className="l">Логин (латиница, 3–32)</span><span className="w"><input value={login} onChange={e=>setLogin(e.target.value)} autoComplete="username" required pattern="[a-zA-Z0-9._-]{3,32}"/></span></label>
  <label className="f"><span className="l">Имя, как показывать в журнале</span><span className="w"><input value={name} onChange={e=>setName(e.target.value)} autoComplete="name"/></span></label>
  <label className="f"><span className="l">Пароль (не короче 8 символов)</span><span className="w"><input type="password" value={p1} onChange={e=>setP1(e.target.value)} autoComplete="new-password" required minLength={8}/></span></label>
  <label className="f"><span className="l">Ещё раз</span><span className="w"><input type="password" value={p2} onChange={e=>setP2(e.target.value)} autoComplete="new-password" required/></span></label>
  {error&&<p className="err" role="alert">{error}</p>}
  <button className="btn primary" type="submit" disabled={busy||!role}>{busy?'Создаю…':'Создать и войти'}</button>
  <p className="hint">Уже есть логин? <Link href="/login">Войти</Link></p>
 </form></div>;
}
