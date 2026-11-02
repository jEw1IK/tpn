'use client';

import {useEffect,useRef,useState} from 'react';
import {formatNumber} from '@/lib/format';

/** Число досчитывается до значения, когда карточка попадает в экран. Без JS и при reduced motion сразу стоит итог. */
export function CountUp({value,digits=0,className}:{value:number;digits?:number;className?:string}){
 const ref=useRef<HTMLSpanElement>(null);const [shown,setShown]=useState(value);const done=useRef(false);
 useEffect(()=>{
  const el=ref.current;if(!el||done.current)return;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const io=new IntersectionObserver(([e])=>{
   if(!e.isIntersecting||done.current)return;done.current=true;io.disconnect();
   const t0=performance.now(),dur=720;setShown(0);
   const tick=(t:number)=>{const k=Math.min(1,(t-t0)/dur);setShown(value*(1-Math.pow(1-k,3)));if(k<1)requestAnimationFrame(tick);};
   requestAnimationFrame(tick);
  },{threshold:0.5});
  io.observe(el);return()=>io.disconnect();
 },[value]);
 return <span ref={ref} className={className}>{formatNumber(shown,digits)}</span>;
}
