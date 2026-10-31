'use client';

import {createContext,useCallback,useContext,useEffect,useMemo,useState} from 'react';
import {usePathname} from 'next/navigation';
import Link from 'next/link';
import {KeyRound,Printer} from 'lucide-react';
import {api} from '@/lib/base';
import {createVault,fromB64,importDataKey,toB64,unlockWithPassphrase,unlockWithRecovery,type VaultRecord} from '@/lib/crypto';
import type {User} from '@/lib/roles';

export type PlainCounts={patients:number;weights:number;sheets:number};
type Status='loading'|'none'|'locked'|'ready'|'error';
export type Vault={status:Status;key:CryptoKey|null;rawKey:Uint8Array|null;record:VaultRecord|null;plain:PlainCounts|null;user:User;error:string;recoveryCode:string;clearRecovery:()=>void;
 unlock:(passphrase:string,remember:boolean)=>Promise<void>;unlockRecovery:(code:string,remember:boolean)=>Promise<void>;setup:(passphrase:string)=>Promise<string>;
 adopt:(raw:Uint8Array,remember:boolean)=>Promise<void>;forget:()=>void;refresh:()=>Promise<void>};
const Ctx=createContext<Vault|null>(null);
const STORE='postneo.kart.key.v1';

const load=(salt:string):Uint8Array|null=>{try{const raw=localStorage.getItem(STORE);if(!raw)return null;const v=JSON.parse(raw) as {salt:string;key:string};return v.salt===salt?fromB64(v.key):null;}catch{return null;}};
const save=(salt:string,key:Uint8Array)=>{try{localStorage.setItem(STORE,JSON.stringify({salt,key:toB64(key)}));}catch{}};
const clear=()=>{try{localStorage.removeItem(STORE);}catch{}};

/** Ключ отделения в браузере: загрузка обёрток с сервера, разблокировка фразой, кэш на этом компьютере. */
export function VaultProvider({user,children}:{user:User;children:React.ReactNode}){
 const [status,setStatus]=useState<Status>('loading');const [record,setRecord]=useState<VaultRecord|null>(null);const [plain,setPlain]=useState<PlainCounts|null>(null);
 const [rawKey,setRawKey]=useState<Uint8Array|null>(null);const [key,setKey]=useState<CryptoKey|null>(null);const [error,setError]=useState('');const [recoveryCode,setRecoveryCode]=useState('');
 const adopt=useCallback(async(raw:Uint8Array,remember:boolean,salt?:string)=>{const k=await importDataKey(raw);setRawKey(raw);setKey(k);setStatus('ready');if(remember&&(salt||record?.kdf_salt))save(salt||record!.kdf_salt,raw);},[record]);
 const refresh=useCallback(async()=>{
  try{
   const r=await api<{vault:VaultRecord|null;plain?:PlainCounts}>('/api/vault');
   setRecord(r.vault);setPlain(r.plain??null);
   if(!r.vault){setStatus('none');return;}
   const cached=load(r.vault.kdf_salt);
   if(cached){const k=await importDataKey(cached);setRawKey(cached);setKey(k);setStatus('ready');}
   else setStatus('locked');
  }catch(e){setError((e as Error).message);setStatus('error');}
 },[]);
 useEffect(()=>{refresh();},[refresh]);
 const unlock=useCallback(async(passphrase:string,remember:boolean)=>{if(!record)throw new Error('Ключ ещё не создан');const raw=await unlockWithPassphrase(record,passphrase);await adopt(raw,remember,record.kdf_salt);},[record,adopt]);
 const unlockRecovery=useCallback(async(code:string,remember:boolean)=>{if(!record)throw new Error('Ключ ещё не создан');const raw=await unlockWithRecovery(record,code);await adopt(raw,remember,record.kdf_salt);},[record,adopt]);
 const setup=useCallback(async(passphrase:string)=>{
  const made=await createVault(passphrase);
  await api('/api/vault',{method:'POST',json:made.record});
  const full:VaultRecord={...made.record,created_at:new Date().toISOString()};setRecord(full);
  setRecoveryCode(made.recoveryCode);
  await adopt(made.rawKey,true,full.kdf_salt);
  return made.recoveryCode;
 },[adopt]);
 const forget=useCallback(()=>{clear();setRawKey(null);setKey(null);setStatus(record?'locked':'none');},[record]);
 const clearRecovery=useCallback(()=>setRecoveryCode(''),[]);
 const value=useMemo<Vault>(()=>({status,key,rawKey,record,plain,user,error,recoveryCode,clearRecovery,unlock,unlockRecovery,setup,adopt:(raw,remember)=>adopt(raw,remember),forget,refresh}),[status,key,rawKey,record,plain,user,error,recoveryCode,clearRecovery,unlock,unlockRecovery,setup,adopt,forget,refresh]);
 return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useVault():Vault{const v=useContext(Ctx);if(!v)throw new Error('useVault вне VaultProvider');return v;}

/** Разделы без данных пациентов открываются и без ключа. */
const openPaths=['/users','/journal','/vault'];
export function VaultGate({children}:{children:React.ReactNode}){
 const v=useVault();const path=usePathname();
 if(v.recoveryCode)return <RecoveryScreen code={v.recoveryCode} onDone={v.clearRecovery}/>;
 if(openPaths.some(p=>path.startsWith(p)))return <>{children}</>;
 if(v.status==='loading')return <div className="kwrap"><p className="lead">Проверяю ключ отделения…</p></div>;
 if(v.status==='error')return <div className="kwrap"><p className="err" role="alert">{v.error}</p><button type="button" className="btn" onClick={()=>v.refresh()}>Повторить</button></div>;
 if(v.status==='none')return v.user.role==='admin'?<SetupVault/>:<div className="kwrap"><div className="card"><h2>Ключ отделения ещё не создан</h2><p className="lead">Карточки пациентов хранятся зашифрованными. Ключ создаёт администратор на своём рабочем месте, после этого врачи вводят фразу отделения один раз на каждом компьютере.</p></div></div>;
 if(v.status==='locked')return <UnlockVault/>;
 return <>{children}</>;
}


/** Лист восстановления показывается один раз сразу после создания ключа. */
function RecoveryScreen({code,onDone}:{code:string;onDone:()=>void}){
 const [saved,setSaved]=useState(false);
 return <div className="kwrap"><div className="card" style={{maxWidth:640}}>
  <h2>Лист восстановления</h2>
  <p className="lead">Если фразу отделения забудут, этот код вернёт доступ к данным. Другого пути нет: сервер ключ не хранит. Распечатайте и уберите в сейф отделения.</p>
  <p style={{fontFamily:'ui-monospace,monospace',fontSize:22,letterSpacing:'.06em',padding:'14px 16px',border:'1px solid var(--rule)',borderRadius:8,userSelect:'all'}}>{code}</p>
  <p><button type="button" className="btn" onClick={()=>printRecovery(code)}><Printer size={14} aria-hidden="true"/>Распечатать</button></p>
  <label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={saved} onChange={e=>setSaved(e.target.checked)}/>Код распечатан и убран в сейф</label>
  <p><button type="button" className="btn primary" disabled={!saved} onClick={onDone}>Продолжить</button></p>
 </div></div>;
}

/** Первый запуск: фраза отделения. */
function SetupVault(){
 const v=useVault();const [p1,setP1]=useState('');const [p2,setP2]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const submit=async(e:React.FormEvent)=>{e.preventDefault();setError('');if(p1!==p2){setError('Фразы не совпадают');return;}setBusy(true);
  try{await v.setup(p1);}catch(err){setError((err as Error).message);setBusy(false);}};
 return <div className="kwrap"><form className="card" style={{maxWidth:560}} onSubmit={submit}>
  <h2>Ключ отделения</h2>
  <p className="lead">Фамилии, истории и листы будут храниться на сервере зашифрованными. Ключ выводится из фразы отделения прямо в браузере и на сервер не уходит. Придумайте фразу не короче 12 знаков, её будут вводить врачи один раз на каждом компьютере.</p>
  <label className="f"><span className="l">Фраза отделения</span><span className="w"><input type="password" value={p1} onChange={e=>setP1(e.target.value)} autoComplete="new-password" autoFocus required/></span></label>
  <label className="f"><span className="l">Ещё раз</span><span className="w"><input type="password" value={p2} onChange={e=>setP2(e.target.value)} autoComplete="new-password" required/></span></label>
  {error&&<p className="err" role="alert">{error}</p>}
  <button className="btn primary" type="submit" disabled={busy||p1.length<12}>{busy?'Создаю…':'Создать ключ'}</button>
 </form></div>;
}

/** Ввод фразы на этом компьютере. Администратор может открыть кодом восстановления и задать новую фразу на странице «Ключ». */
function UnlockVault(){
 const v=useVault();const [p,setP]=useState('');const [remember,setRemember]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [byCode,setByCode]=useState(false);
 const submit=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError('');
  try{if(byCode)await v.unlockRecovery(p,remember);else await v.unlock(p,remember);}catch(err){setError((err as Error).message.includes('другой ключ')?(byCode?'Код не подошёл':'Фраза не подошла'):(err as Error).message);}finally{setBusy(false);}};
 return <div className="kwrap"><form className="card" style={{maxWidth:520}} onSubmit={submit}>
  <h2><KeyRound size={18} aria-hidden="true" style={{verticalAlign:'-3px'}}/> {byCode?'Код восстановления':'Фраза отделения'}</h2>
  <p className="lead">{byCode?'Код с листа из сейфа отделения.':'Данные пациентов зашифрованы. Введите фразу отделения, чтобы открыть их на этом компьютере.'}</p>
  <label className="f"><span className="l">{byCode?'Код':'Фраза'}</span><span className="w"><input type={byCode?'text':'password'} value={p} onChange={e=>setP(e.target.value)} autoComplete={byCode?'off':'current-password'} autoFocus required/></span></label>
  <label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/>Запомнить ключ на этом компьютере</label>
  {error&&<p className="err" role="alert">{error}</p>}
  <p style={{display:'flex',gap:12,alignItems:'center'}}><button className="btn primary" type="submit" disabled={busy}>{busy?'Проверяю…':'Открыть'}</button>
  {v.user.role==='admin'&&<button type="button" className="tb" onClick={()=>{setByCode(!byCode);setError('');setP('');}}>{byCode?'Ввести фразу':'Забыл фразу: код восстановления'}</button>}</p>
  {v.user.role==='admin'&&byCode&&<p className="hint">После входа по коду задайте новую фразу в разделе <Link href="/vault">Ключ</Link>, иначе на других компьютерах она не подойдёт.</p>}
 </form></div>;
}

export function printRecovery(code:string){
 const w=window.open('','_blank','width=720,height=560');if(!w)return;
 w.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>POSTNEO Карточки: лист восстановления</title><style>body{font-family:Arial,sans-serif;margin:32px;color:#000}h1{font-size:20px}p{font-size:14px;line-height:1.45}code{display:block;font-size:26px;letter-spacing:.08em;padding:16px;border:2px solid #000;margin:18px 0;font-family:ui-monospace,Consolas,monospace}small{color:#444}</style></head><body><h1>POSTNEO Карточки: лист восстановления ключа отделения</h1><p>Этот код открывает зашифрованные данные пациентов, если фраза отделения утрачена. Храните в сейфе. Кто владеет кодом, тот читает все карточки.</p><code>${code}</code><p>Дата: ${new Date().toLocaleDateString('ru-RU')} · Подпись заведующего: ______________________</p><p><small>Как использовать: администратор на странице входа выбирает «Забыл фразу: код восстановления», вводит код, затем в разделе «Ключ» задаёт новую фразу отделения.</small></p><script>window.onload=()=>{window.print();}</script></body></html>`);
 w.document.close();
}
