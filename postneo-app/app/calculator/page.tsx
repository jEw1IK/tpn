'use client';

import {useEffect,useState} from 'react';
import {Calculator,defaultUi,fresh,type Ui} from '@/components/calc/calculator';
import type {Inputs} from '@/lib/tpn';

const KEY='postneo-sheet-v3';
/** Открытый калькулятор сайта: лист живёт в браузере этого устройства. */
export default function CalculatorPage(){
 const [state,setState]=useState<{p:Inputs;ui:Ui}|null>(null);
 useEffect(()=>{let p=fresh(),ui=defaultUi;try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(saved&&saved.p&&typeof saved.p==='object'){p={...fresh(),...saved.p};if(saved.ui)ui={...defaultUi,...saved.ui};}}catch{}setState({p,ui});},[]);
 if(!state)return <div className="app"/>;
 return <Calculator initial={state.p} initialUi={state.ui} onChange={(p,ui)=>{try{localStorage.setItem(KEY,JSON.stringify({p,ui}));}catch{}}}/>;
}
