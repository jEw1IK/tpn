'use client';

import {useEffect,useRef,useState,type ReactNode} from 'react';
import {ChevronDown} from 'lucide-react';

export const ru=(v:unknown)=>String(v??'').replace('.',',');
/** Числовые поля хранятся строкой с точкой; показываем запятую, как привыкли в отделении. */
export const dot=(v:string)=>v.replace(',','.');

export function Blk({title,hint,wide,children,id}:{title:string;hint?:ReactNode;wide?:boolean;children:ReactNode;id?:string}){
 return <section className={'blk'+(wide?' wide':'')} id={id} aria-labelledby={id?id+'-h':undefined}><div className="blk-h"><h2 className="h" id={id?id+'-h':undefined}>{title}</h2>{hint&&<span className="hint">{hint}</span>}</div>{children}</section>;
}

export function Inp({id,label,unit,value,onChange,type='text',mode='decimal',bad,placeholder}:{id:string;label:string;unit?:string;value:string;onChange:(v:string)=>void;type?:string;mode?:'decimal'|'text';bad?:boolean;placeholder?:string}){
 const numeric=type==='text'&&mode==='decimal';
 return <label className={'f'+(bad?' bad':'')} htmlFor={id}><span className="l">{label}</span><span className="w"><input id={id} type={type} inputMode={numeric?'decimal':undefined} autoComplete="off" value={numeric?ru(value):value} placeholder={placeholder} aria-invalid={bad||undefined} onChange={e=>onChange(numeric?dot(e.target.value):e.target.value)}/>{unit&&<em>{unit}</em>}</span></label>;
}

export function Ro({label,children}:{label:string;children:ReactNode}){
 return <div className="f ro"><span className="l">{label}</span><span className="w">{children}</span></div>;
}

type Options=readonly (readonly [string,string])[];
/** Свой выпадающий список вместо системного: скруглённый, в цветах листа, с клавиатурой. compact — вариант для ячеек препаратов. */
export function Pick({id,label,value,onChange,options,bad,compact}:{id:string;label:string;value:string;onChange:(v:string)=>void;options:Options;bad?:boolean;compact?:boolean}){
 const [open,setOpen]=useState(false);const [active,setActive]=useState(0);const root=useRef<HTMLDivElement>(null);const list=useRef<HTMLUListElement>(null);
 const index=Math.max(0,options.findIndex(o=>o[0]===value));const current=options[index]??options[0];
 useEffect(()=>{if(!open)return;const onDoc=(e:MouseEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false);};document.addEventListener('mousedown',onDoc);return()=>document.removeEventListener('mousedown',onDoc);},[open]);
 useEffect(()=>{if(open)list.current?.querySelector<HTMLElement>('li.active')?.scrollIntoView({block:'nearest'});},[open,active]);
 const show=()=>{setActive(index);setOpen(true);};
 const choose=(v:string)=>{onChange(v);setOpen(false);};
 const onKey=(e:React.KeyboardEvent<HTMLButtonElement>)=>{
  if(e.key==='ArrowDown'){e.preventDefault();if(!open)show();else setActive(a=>Math.min(options.length-1,a+1));}
  else if(e.key==='ArrowUp'){e.preventDefault();if(!open)show();else setActive(a=>Math.max(0,a-1));}
  else if(e.key==='Home'&&open){e.preventDefault();setActive(0);}
  else if(e.key==='End'&&open){e.preventDefault();setActive(options.length-1);}
  else if(e.key==='Enter'||e.key===' '){e.preventDefault();if(open&&options[active])choose(options[active][0]);else show();}
  else if(e.key==='Escape'&&open){e.preventDefault();setOpen(false);}
  else if(e.key.length===1&&/\S/.test(e.key)){const q=e.key.toLowerCase();const i=options.findIndex((o,k)=>k>(open?active:index)&&o[1].toLowerCase().startsWith(q));const j=i>=0?i:options.findIndex(o=>o[1].toLowerCase().startsWith(q));if(j>=0){if(open)setActive(j);else onChange(options[j][0]);}}
 };
 const listbox=open&&<ul className="pl glass" role="listbox" id={id+'-list'} ref={list} aria-labelledby={id+'-l'}>{options.map((o,i)=><li key={o[0]} role="option" aria-selected={o[0]===value} className={i===active?'active':undefined} onMouseEnter={()=>setActive(i)} onMouseDown={e=>{e.preventDefault();choose(o[0]);}}>{o[1]}</li>)}</ul>;
 if(compact)return <span className={'cell pickcell'+(bad?' bad':'')} ref={root as React.RefObject<HTMLSpanElement>}><span id={id+'-l'}>{label}</span><button type="button" id={id} className={'pick'+(open?' open':'')} aria-haspopup="listbox" aria-expanded={open} aria-controls={open?id+'-list':undefined} aria-labelledby={id+'-l '+id} onClick={()=>open?setOpen(false):show()} onKeyDown={onKey}><span className="pv">{current?.[1]}</span><ChevronDown size={13} aria-hidden="true"/></button>{listbox}</span>;
 return <div className={'f'+(bad?' bad':'')} ref={root}><span className="l" id={id+'-l'}>{label}</span><button type="button" id={id} className={'w pick'+(open?' open':'')} aria-haspopup="listbox" aria-expanded={open} aria-controls={open?id+'-list':undefined} aria-labelledby={id+'-l '+id} aria-invalid={bad||undefined} onClick={()=>open?setOpen(false):show()} onKeyDown={onKey}><span className="pv">{current?.[1]}</span><ChevronDown size={16} aria-hidden="true"/></button>{listbox}</div>;
}
export const Sel=Pick;

/** Поле со стрелками: шаг задаётся снаружи, значение не уходит ниже нуля. */
export function Stp({id,label,unit,value,step,onChange,bad,children}:{id:string;label:string;unit:string;value:string;step:number;onChange:(v:string)=>void;bad?:boolean;children?:ReactNode}){
 const bump=(d:number)=>{const cur=Number(value.replace(',','.'))||0;const next=Math.round(Math.max(0,cur+d)*100)/100;onChange(String(next));};
 return <div className={'f'+(bad?' bad':'')+(children?' has-pop':'')}><span className="l"><label htmlFor={id}>{label}</label> <em>{unit}</em></span><div className="stp"><button type="button" aria-label={label+' меньше'} onClick={()=>bump(-step)}>−</button><input id={id} inputMode="decimal" autoComplete="off" value={ru(value)} aria-invalid={bad||undefined} onChange={e=>onChange(dot(e.target.value))}/><button type="button" aria-label={label+' больше'} onClick={()=>bump(step)}>+</button></div>{children}</div>;
}
