'use client';

import {useEffect,useState} from 'react';

export type Theme='light'|'dark';
const key='postneo-theme';
/** Тема хранится в браузере; до гидрации её выставляет скрипт в layout, чтобы страница не мигала. */
export function readTheme():Theme{
 try{const t=localStorage.getItem(key);if(t==='light'||t==='dark')return t;}catch{}
 return typeof window!=='undefined'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
}
export function ThemeToggle(){
 const [theme,setTheme]=useState<Theme>('light');
 useEffect(()=>{setTheme(readTheme());},[]);
 const choose=(t:Theme)=>{setTheme(t);document.documentElement.setAttribute('data-theme',t);try{localStorage.setItem(key,t);}catch{}};
 return <div className="seg" role="group" aria-label="Тема"><button type="button" aria-pressed={theme==='light'} onClick={()=>choose('light')}>Светлая</button><button type="button" aria-pressed={theme==='dark'} onClick={()=>choose('dark')}>Тёмная</button></div>;
}
export const themeScript=`(function(){try{var t=localStorage.getItem('${key}');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;
