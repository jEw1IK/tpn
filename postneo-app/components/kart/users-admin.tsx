'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {api} from '@/lib/base';
import {Inp,Sel} from '@/components/calc/fields';
import {roleNames,type Role,type User} from '@/lib/roles';

export function UsersAdmin({users,me}:{users:User[];me:number}){
 const router=useRouter();const [f,setF]=useState({login:'',name:'',role:'doctor' as Role,password:''});const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const run=async(fn:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await fn();router.refresh();}catch(err){setError((err as Error).message);}finally{setBusy(false);}};
 const create=(e:React.FormEvent)=>{e.preventDefault();run(async()=>{await api('/api/users',{method:'POST',json:f});setF({login:'',name:'',role:'doctor',password:''});});};
 const reset=(u:User)=>{const password=prompt('Новый пароль для '+u.login+' (не короче 8 символов)');if(password)run(()=>api('/api/users/'+u.id,{method:'PATCH',json:{password}}));};
 const toggle=(u:User)=>run(()=>api('/api/users/'+u.id,{method:'PATCH',json:{disabled:!u.disabled}}));
 return <div className="kwrap">
  <div className="khead"><h1>Пользователи</h1><span className="hint">{users.length}</span></div>
  <div className="card"><h2>Новый пользователь</h2><form className="grid c5" onSubmit={create} style={{alignItems:'end'}}>
   <Inp id="u-login" label="Логин (латиница)" mode="text" value={f.login} onChange={login=>setF({...f,login})}/>
   <Inp id="u-name" label="Имя" mode="text" value={f.name} onChange={name=>setF({...f,name})}/>
   <Sel id="u-role" label="Роль" value={f.role} onChange={role=>setF({...f,role:role as Role})} options={[['doctor','Врач'],['nurse','Медсестра'],['admin','Администратор']]}/>
   <Inp id="u-pass" label="Пароль" type="password" mode="text" value={f.password} onChange={password=>setF({...f,password})}/>
   <button className="btn primary" type="submit" disabled={busy}>Завести</button>
  </form><p className="hint">Врач ведёт пациентов и подписывает листы. Медсестра смотрит и печатает. Администратор заводит людей и может снять подпись.</p>{error&&<p className="err" role="alert">{error}</p>}</div>
  <div className="card"><table className="ktab"><thead><tr><th>Логин</th><th>Имя</th><th>Роль</th><th>Состояние</th><th></th></tr></thead><tbody>{users.map(u=><tr key={u.id}><td>{u.login}</td><td>{u.name}</td><td>{roleNames[u.role]}</td><td>{u.disabled?<span className="st draft">отключён</span>:<span className="st signed">активен</span>}</td><td style={{textAlign:'right',whiteSpace:'nowrap'}}><button type="button" className="tb" onClick={()=>reset(u)} disabled={busy}>Пароль</button> {u.id!==me&&<button type="button" className="tb" onClick={()=>toggle(u)} disabled={busy}>{u.disabled?'Включить':'Отключить'}</button>}</td></tr>)}</tbody></table></div>
 </div>;
}
