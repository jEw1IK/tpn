'use client';
import {useEffect} from 'react';
/** Раз в 10 секунд сообщает серверу, что окно открыто. В Docker это безобидный запрос, на ПК по нему сервер понимает, что его ещё не закрыли. */
export function Heartbeat(){
 useEffect(()=>{
  const base=process.env.NEXT_PUBLIC_BASE_PATH||'';
  const ping=()=>{fetch(base+'/api/ping',{cache:'no-store',keepalive:true}).catch(()=>{});};
  ping();const id=setInterval(ping,10000);
  const onVisible=()=>{if(document.visibilityState==='visible')ping();};
  document.addEventListener('visibilitychange',onVisible);
  return ()=>{clearInterval(id);document.removeEventListener('visibilitychange',onVisible);};
 },[]);
 return null;
}
