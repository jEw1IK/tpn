'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {BrandMark} from '@/components/brand-mark';
import {api,withBase} from '@/lib/base';
import {adoptAfterLogin} from './vault';
import type {KeyWrap,VaultRecord} from '@/lib/crypto';

/** Вход и первый запуск на одной форме: setup=true заводит администратора, пока в базе нет людей. */
export function LoginForm({setup=false}:{setup?:boolean}){
 const router=useRouter();
 const [login,setLogin]=useState('');const [name,setName]=useState('');const [password,setPassword]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const submit=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError('');
  try{const res=await api<{keyWrap?:KeyWrap|null;vault?:VaultRecord|null}>(setup?'/api/setup':'/api/login',{method:'POST',json:setup?{login,name,password}:{login,password}});
   if(!setup)await adoptAfterLogin(password,{keyWrap:res.keyWrap??null,vault:res.vault??null});
   router.push('/patients');router.refresh();}
  catch(err){setError((err as Error).message);}finally{setBusy(false);}};
 return <div className="app login"><form className="card" onSubmit={submit}>
  <span className="brand"><BrandMark/></span>
  <h1 style={{fontSize:18,fontWeight:700,margin:0}}>{setup?'Первый запуск: администратор':'Карточки пациентов'}</h1>
  <p className="lead">{setup?'Пользователей ещё нет. Этот логин станет администратором: он заводит врачей и медсестёр.':'Вход по логину и паролю. На этом компьютере вход сохраняется, пока вы не нажмёте «Выйти».'}</p>
  <label className="f"><span className="l">Логин</span><span className="w"><input value={login} onChange={e=>setLogin(e.target.value)} autoComplete="username" autoFocus required/></span></label>
  {setup&&<label className="f"><span className="l">Имя, как показывать в журнале</span><span className="w"><input value={name} onChange={e=>setName(e.target.value)} autoComplete="name"/></span></label>}
  <label className="f"><span className="l">Пароль{setup?' (не короче 8 символов)':''}</span><span className="w"><input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={setup?'new-password':'current-password'} required/></span></label>
  {error&&<p className="err" role="alert">{error}</p>}
  <button className="btn primary" type="submit" disabled={busy}>{setup?'Создать и войти':'Войти'}</button>
  {!setup&&<p className="hint">Есть код приглашения? <a href={withBase('/join')}>Зарегистрироваться</a></p>}
  {!setup&&<p className="hint"><a href="/postneo/calculator.html">Калькулятор без входа</a> · <a href="/postneo/">Главная</a></p>}
 </form></div>;
}
