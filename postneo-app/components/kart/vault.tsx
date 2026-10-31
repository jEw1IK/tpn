'use client';

import {createContext,useCallback,useContext,useEffect,useMemo,useState} from 'react';
import {usePathname} from 'next/navigation';
import {KeyRound,Printer} from 'lucide-react';
import {api} from '@/lib/base';
import {createVaultForAdmin,fromB64,importDataKey,toB64,unlockWithPassphrase,unlockWithRecovery,unwrapWithPassword,wrapForPassword,type KeyWrap,type VaultRecord} from '@/lib/crypto';
import type {User} from '@/lib/roles';

export type PlainCounts={patients:number;weights:number;sheets:number};
type Status='loading'|'none'|'locked'|'ready'|'error';
export type Vault={status:Status;key:CryptoKey|null;rawKey:Uint8Array|null;record:VaultRecord|null;plain:PlainCounts|null;user:User;error:string;recoveryCode:string;clearRecovery:()=>void;
 unlockWithLogin:(password:string)=>Promise<void>;migrate:(secret:string,password:string)=>Promise<void>;setup:(password:string)=>Promise<string>;
 forget:()=>void;refresh:()=>Promise<void>};
const Ctx=createContext<Vault|null>(null);
const STORE='postneo.kart.key.v1';

/** Ключ данных на этом компьютере: хранится, пока человек не нажмёт «Выйти». Привязан к соли хранилища, чтобы не спутать отделения. */
export const loadKey=(salt:string):Uint8Array|null=>{try{const raw=localStorage.getItem(STORE);if(!raw)return null;const v=JSON.parse(raw) as {salt:string;key:string};return v.salt===salt?fromB64(v.key):null;}catch{return null;}};
export const saveKey=(salt:string,key:Uint8Array)=>{try{localStorage.setItem(STORE,JSON.stringify({salt,key:toB64(key)}));}catch{}};
export const clearKey=()=>{try{localStorage.removeItem(STORE);}catch{}};

/** После входа по паролю: открыть свою копию ключа и запомнить на этом компьютере. Копии нет, а ключ уже здесь — сделать её. */
export async function adoptAfterLogin(password:string,res:{keyWrap:KeyWrap|null;vault:VaultRecord|null}){
 if(!res.vault)return;
 try{
  if(res.keyWrap){saveKey(res.vault.kdf_salt,await unwrapWithPassword(res.keyWrap,password));return;}
  const cached=loadKey(res.vault.kdf_salt);
  if(cached)await api('/api/me',{method:'PUT',json:{keyWrap:await wrapForPassword(cached,password)}});
 }catch{/* не открылось — спросит экран ключа */}
}

/** Ключ отделения в браузере: открывается паролем входа, фразы нет. */
export function VaultProvider({user,children}:{user:User;children:React.ReactNode}){
 const [status,setStatus]=useState<Status>('loading');const [record,setRecord]=useState<VaultRecord|null>(null);const [plain,setPlain]=useState<PlainCounts|null>(null);
 const [rawKey,setRawKey]=useState<Uint8Array|null>(null);const [key,setKey]=useState<CryptoKey|null>(null);const [error,setError]=useState('');const [recoveryCode,setRecoveryCode]=useState('');
 const adopt=useCallback(async(raw:Uint8Array,salt:string)=>{const k=await importDataKey(raw);setRawKey(raw);setKey(k);setStatus('ready');saveKey(salt,raw);},[]);
 const refresh=useCallback(async()=>{
  try{
   const r=await api<{vault:VaultRecord|null;plain?:PlainCounts}>('/api/vault');
   setRecord(r.vault);setPlain(r.plain??null);
   if(!r.vault){setStatus('none');return;}
   const cached=loadKey(r.vault.kdf_salt);
   if(cached){const k=await importDataKey(cached);setRawKey(cached);setKey(k);setStatus('ready');}
   else setStatus('locked');
  }catch(e){setError((e as Error).message);setStatus('error');}
 },[]);
 useEffect(()=>{refresh();},[refresh]);
 /** Компьютер забыл ключ (очистили браузер), а вход ещё действует: пароль ещё раз. */
 const unlockWithLogin=useCallback(async(password:string)=>{
  if(!record)throw new Error('Ключ ещё не создан');
  const me=await api<{keyWrap:KeyWrap|null}>('/api/me');
  if(!me.keyWrap)throw new Error('NO_WRAP');
  await adopt(await unwrapWithPassword(me.keyWrap,password),record.kdf_salt);
 },[record,adopt]);
 /** Переход со старой фразы: фраза (или код восстановления у администратора) один раз, затем копия под паролем. */
 const migrate=useCallback(async(secret:string,password:string)=>{
  if(!record)throw new Error('Ключ ещё не создан');
  let raw:Uint8Array;
  try{raw=record.wrapped_key?await unlockWithPassphrase(record,secret):await unlockWithRecovery(record,secret);}
  catch{if(!record.recovery_wrapped_key)throw new Error('Фраза не подошла');raw=await unlockWithRecovery(record,secret);}
  await api('/api/me',{method:'PUT',json:{keyWrap:await wrapForPassword(raw,password)}});
  await adopt(raw,record.kdf_salt);
 },[record,adopt]);
 const setup=useCallback(async(password:string)=>{
  const made=await createVaultForAdmin(password);
  await api('/api/vault',{method:'POST',json:{...made.record,adminWrap:made.adminWrap}});
  const full:VaultRecord={...made.record,created_at:new Date().toISOString()};setRecord(full);
  setRecoveryCode(made.recoveryCode);
  await adopt(made.rawKey,full.kdf_salt);
  return made.recoveryCode;
 },[adopt]);
 const forget=useCallback(()=>{clearKey();setRawKey(null);setKey(null);setStatus(record?'locked':'none');},[record]);
 const clearRecovery=useCallback(()=>setRecoveryCode(''),[]);
 const value=useMemo<Vault>(()=>({status,key,rawKey,record,plain,user,error,recoveryCode,clearRecovery,unlockWithLogin,migrate,setup,forget,refresh}),[status,key,rawKey,record,plain,user,error,recoveryCode,clearRecovery,unlockWithLogin,migrate,setup,forget,refresh]);
 return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useVault():Vault{const v=useContext(Ctx);if(!v)throw new Error('useVault вне VaultProvider');return v;}

/** Разделы без данных пациентов открываются и без ключа. */
const openPaths=['/journal'];
export function VaultGate({children}:{children:React.ReactNode}){
 const v=useVault();const path=usePathname();
 if(v.recoveryCode)return <RecoveryScreen code={v.recoveryCode} onDone={v.clearRecovery}/>;
 if(openPaths.some(p=>path.startsWith(p)))return <>{children}</>;
 if(v.status==='loading')return <div className="kwrap"><p className="lead">Открываю отделение…</p></div>;
 if(v.status==='error')return <div className="kwrap"><p className="err" role="alert">{v.error}</p><button type="button" className="btn" onClick={()=>v.refresh()}>Повторить</button></div>;
 if(v.status==='none')return v.user.role==='admin'?<SetupVault/>:<div className="kwrap"><div className="card"><h2>Отделение ещё не настроено</h2><p className="lead">Администратор ещё не создал ключ шифрования. Попробуйте позже.</p></div></div>;
 if(v.status==='locked')return <UnlockVault/>;
 return <><WrapReminder/>{children}</>;
}

/** Ключ открыт на этом компьютере, а копии под паролем на сервере ещё нет (переход со старой фразы без нового входа).
 *  Один раз подтвердить пароль — и на других компьютерах, и после «Выйти» отделение откроется паролем. */
function WrapReminder(){
 const v=useVault();const [need,setNeed]=useState(false);const [p,setP]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [done,setDone]=useState(false);
 useEffect(()=>{let alive=true;api<{keyWrap:KeyWrap|null}>('/api/me').then(r=>{if(alive)setNeed(!r.keyWrap);}).catch(()=>{});return()=>{alive=false;};},[]);
 if(done)return <div className="kwrap"><p className="hint" role="status">Готово: теперь отделение открывается вашим паролем на любом компьютере.</p></div>;
 if(!need||!v.rawKey)return null;
 const submit=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError('');
  try{await api('/api/login',{method:'POST',json:{login:v.user.login,password:p}});await api('/api/me',{method:'PUT',json:{keyWrap:await wrapForPassword(v.rawKey!,p)}});setDone(true);setNeed(false);}
  catch(err){setError((err as Error).message.includes('Неверный')?'Пароль не подошёл':(err as Error).message);}finally{setBusy(false);}};
 return <div className="kwrap"><form className="card" onSubmit={submit} style={{display:'flex',gap:12,alignItems:'end',flexWrap:'wrap'}}>
  <p className="lead" style={{flex:'1 1 320px',margin:0}}>Подтвердите пароль один раз: после этого отделение будет открываться им на любом компьютере, без старой фразы.</p>
  <label className="f" style={{minWidth:220}}><span className="l">Ваш пароль</span><span className="w"><input type="password" value={p} onChange={e=>setP(e.target.value)} autoComplete="current-password" required/></span></label>
  <button className="btn primary" type="submit" disabled={busy||!p}>{busy?'Сохраняю…':'Подтвердить'}</button>
  {error&&<p className="err" role="alert" style={{width:'100%'}}>{error}</p>}
 </form></div>;
}

/** Лист восстановления показывается один раз сразу после создания ключа. */
function RecoveryScreen({code,onDone}:{code:string;onDone:()=>void}){
 const [saved,setSaved]=useState(false);
 return <div className="kwrap"><div className="card" style={{maxWidth:640}}>
  <h2>Лист восстановления</h2>
  <p className="lead">Ключ к данным пациентов открывается паролем каждого врача. Если пароли забудут все, включая вас, вернуть данные можно только этим кодом. Распечатайте и уберите в сейф.</p>
  <p style={{fontFamily:'ui-monospace,monospace',fontSize:22,letterSpacing:'.06em',padding:'14px 16px',border:'1px solid var(--rule)',borderRadius:8,userSelect:'all'}}>{code}</p>
  <p><button type="button" className="btn" onClick={()=>printRecovery(code)}><Printer size={14} aria-hidden="true"/>Распечатать</button></p>
  <label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={saved} onChange={e=>setSaved(e.target.checked)}/>Код распечатан и убран в сейф</label>
  <p><button type="button" className="btn primary" disabled={!saved} onClick={onDone}>Продолжить</button></p>
 </div></div>;
}

/** Первый запуск: ключ создаётся под паролем администратора, фразы нет. */
function SetupVault(){
 const v=useVault();const [p,setP]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const submit=async(e:React.FormEvent)=>{e.preventDefault();setError('');setBusy(true);
  try{await api('/api/login',{method:'POST',json:{login:v.user.login,password:p}});await v.setup(p);}catch(err){setError((err as Error).message.includes('Неверный')?'Пароль не подошёл':(err as Error).message);setBusy(false);}};
 return <div className="kwrap"><form className="card" style={{maxWidth:560}} onSubmit={submit}>
  <h2>Шифрование отделения</h2>
  <p className="lead">Фамилии, истории и листы будут храниться на сервере зашифрованными. Ключ открывается паролем каждого врача, никаких отдельных фраз. Подтвердите свой пароль, чтобы создать ключ.</p>
  <label className="f"><span className="l">Ваш пароль</span><span className="w"><input type="password" value={p} onChange={e=>setP(e.target.value)} autoComplete="current-password" autoFocus required/></span></label>
  {error&&<p className="err" role="alert">{error}</p>}
  <button className="btn primary" type="submit" disabled={busy||!p}>{busy?'Создаю…':'Создать ключ'}</button>
 </form></div>;
}

/** Компьютер не помнит ключ: пароль ещё раз. Старые пользователи без копии ключа — один раз старая фраза. */
function UnlockVault(){
 const v=useVault();const [p,setP]=useState('');const [secret,setSecret]=useState('');const [legacy,setLegacy]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const submit=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError('');
  try{if(legacy)await v.migrate(secret,p);else await v.unlockWithLogin(p);}
  catch(err){const m=(err as Error).message;if(m==='NO_WRAP'){setLegacy(true);setError('');}else setError(m.includes('другой ключ')?(legacy?'Фраза или пароль не подошли':'Пароль не подошёл'):m);}
  finally{setBusy(false);}};
 return <div className="kwrap"><form className="card" style={{maxWidth:520}} onSubmit={submit}>
  <h2><KeyRound size={18} aria-hidden="true" style={{verticalAlign:'-3px'}}/> Подтвердите пароль</h2>
  <p className="lead">{legacy?'Последний раз нужна старая фраза отделения (администратору подойдёт код восстановления). Дальше данные будут открываться вашим паролем.':'Этот компьютер не помнит ключ к данным пациентов. Введите свой пароль, он откроет ключ.'}</p>
  <label className="f"><span className="l">Ваш пароль</span><span className="w"><input type="password" value={p} onChange={e=>setP(e.target.value)} autoComplete="current-password" autoFocus required/></span></label>
  {legacy&&<label className="f"><span className="l">Старая фраза отделения или код восстановления</span><span className="w"><input type="password" value={secret} onChange={e=>setSecret(e.target.value)} autoComplete="off" required/></span></label>}
  {error&&<p className="err" role="alert">{error}</p>}
  <p><button className="btn primary" type="submit" disabled={busy}>{busy?'Проверяю…':'Открыть'}</button></p>
 </form></div>;
}

export function printRecovery(code:string){
 const w=window.open('','_blank','width=720,height=560');if(!w)return;
 w.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>POSTNEO Карточки: лист восстановления</title><style>body{font-family:Arial,sans-serif;margin:32px;color:#000}h1{font-size:20px}p{font-size:14px;line-height:1.45}code{display:block;font-size:26px;letter-spacing:.08em;padding:16px;border:2px solid #000;margin:18px 0;font-family:ui-monospace,Consolas,monospace}small{color:#444}</style></head><body><h1>POSTNEO Карточки: лист восстановления ключа отделения</h1><p>Этот код открывает зашифрованные данные пациентов, если пароли всех пользователей утрачены. Храните в сейфе. Кто владеет кодом, тот читает все карточки.</p><code>${code}</code><p>Дата: ${new Date().toLocaleDateString('ru-RU')} · Подпись заведующего: ______________________</p><p><small>Как использовать: обратиться к разработчику POSTNEO; код вводится на экране подтверждения пароля.</small></p><script>window.onload=()=>{window.print();}</script></body></html>`);
 w.document.close();
}
