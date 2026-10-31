'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {api,basePath} from '@/lib/base';
import {Inp,Sel} from '@/components/calc/fields';
import {roleNames,type Role,type User} from '@/lib/roles';
import {generateInviteCode,inviteCodeId,wrapForInvite,wrapForPassword} from '@/lib/crypto';
import {useVault} from './vault';

export type InviteRow={id:number;role:Role;note:string;created_at:string;expires_at:string;used_by:number|null;used_at:string|null;used_login:string|null};

export function UsersAdmin({users,invites,me}:{users:User[];invites:InviteRow[];me:number}){
 const router=useRouter();const vault=useVault();
 const [inv,setInv]=useState({role:'doctor' as Role,note:''});const [fresh,setFresh]=useState<{code:string;role:Role;expires_at:string}|null>(null);
 const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const run=async(fn:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await fn();router.refresh();}catch(err){setError((err as Error).message);}finally{setBusy(false);}};
 // код создаётся здесь, в браузере: сервер получает только его SHA-256 и копию ключа под кодом
 const invite=(e:React.FormEvent)=>{e.preventDefault();run(async()=>{if(!vault.rawKey)throw new Error('Ключ отделения не открыт на этом компьютере');const code=generateInviteCode();const r=await api<{invite:{expires_at:string}}>('/api/invites',{method:'POST',json:{...inv,codeId:await inviteCodeId(code),keyWrap:await wrapForInvite(vault.rawKey,code)}});setFresh({code,role:inv.role,expires_at:r.invite.expires_at});setInv({...inv,note:''});});};
 const revoke=(id:number)=>run(()=>api('/api/invites/'+id,{method:'DELETE'}));
 const reset=(u:User)=>{const password=prompt('Временный пароль для '+u.login+' (не короче 8 символов). Все его сессии будут закрыты, пусть сменит пароль после входа.');if(password)run(async()=>api('/api/users/'+u.id,{method:'PATCH',json:{password,keyWrap:vault.rawKey?await wrapForPassword(vault.rawKey,password):null}}));};
 const toggle=(u:User)=>run(()=>api('/api/users/'+u.id,{method:'PATCH',json:{disabled:!u.disabled}}));
 const joinUrl=(code:string)=>(typeof window!=='undefined'?window.location.origin:'')+basePath+'/join?code='+code;
 const open=invites.filter(i=>!i.used_by&&i.expires_at>new Date().toISOString());
 return <div className="kwrap">
  <div className="khead"><h1>Пользователи</h1><span className="hint">{users.length}</span></div>
  {error&&<p className="err" role="alert">{error}</p>}
  <div className="two-col">
   <div className="card"><h2>Пригласить сотрудника</h2>
    <p className="hint">Код действует 7 дней и гасится после регистрации. Он же передаёт врачу ключ к данным. Логин и пароль врач придумывает сам, вы их не знаете.</p>
    <form className="grid c3" onSubmit={invite} style={{alignItems:'end'}}>
     <Sel id="i-role" label="Роль" value={inv.role} onChange={role=>setInv({...inv,role:role as Role})} options={[['doctor','Врач'],['nurse','Медсестра'],['admin','Администратор']]}/>
     <Inp id="i-note" label="Для кого (заметка)" mode="text" value={inv.note} onChange={note=>setInv({...inv,note})}/>
     <button className="btn primary" type="submit" disabled={busy}>Создать код</button>
    </form>
    {fresh&&<div style={{marginTop:14,padding:'12px 14px',border:'1px solid var(--line)',borderRadius:10}}>
     <p className="hint" style={{margin:0}}>Код для роли «{roleNames[fresh.role]}», показывается один раз. Передайте лично или отправьте ссылку:</p>
     <p style={{fontFamily:'ui-monospace,monospace',fontSize:24,letterSpacing:'.1em',margin:'8px 0',userSelect:'all'}}>{fresh.code}</p>
     <p style={{margin:0,wordBreak:'break-all',userSelect:'all',fontSize:13}}>{joinUrl(fresh.code)}</p>
     <p><button type="button" className="tb" onClick={()=>{navigator.clipboard?.writeText(joinUrl(fresh.code));}}>Скопировать ссылку</button> <button type="button" className="tb" onClick={()=>setFresh(null)}>Скрыть</button></p>
    </div>}
    {open.length>0&&<><h2 style={{marginTop:18}}>Ожидают регистрации</h2><table className="ktab"><thead><tr><th>Роль</th><th>Заметка</th><th>До</th><th></th></tr></thead><tbody>{open.map(i=><tr key={i.id}><td>{roleNames[i.role]}</td><td>{i.note||'—'}</td><td>{new Date(i.expires_at).toLocaleDateString('ru-RU')}</td><td style={{textAlign:'right'}}><button type="button" className="tb" onClick={()=>revoke(i.id)} disabled={busy}>Отозвать</button></td></tr>)}</tbody></table></>}
   </div>
   <div className="card"><h2>Роли</h2><p className="hint">Врач ведёт пациентов и подписывает листы. Медсестра смотрит и печатает. Администратор приглашает людей, хранит код восстановления и может снять подпись.</p>
    <p className="hint">Свой пароль каждый меняет сам: кнопка в шапке рядом с именем. Сброс администратором нужен только если пароль забыт.</p></div>
  </div>
  <div className="card"><table className="ktab"><thead><tr><th>Логин</th><th>Имя</th><th>Роль</th><th>Состояние</th><th></th></tr></thead><tbody>{users.map(u=><tr key={u.id}><td>{u.login}</td><td>{u.name}</td><td>{roleNames[u.role]}</td><td>{u.disabled?<span className="st draft">отключён</span>:<span className="st signed">активен</span>}</td><td style={{textAlign:'right',whiteSpace:'nowrap'}}><button type="button" className="tb" onClick={()=>reset(u)} disabled={busy}>Сбросить пароль</button> {u.id!==me&&<button type="button" className="tb" onClick={()=>toggle(u)} disabled={busy}>{u.disabled?'Включить':'Отключить'}</button>}</td></tr>)}</tbody></table></div>
 </div>;
}
