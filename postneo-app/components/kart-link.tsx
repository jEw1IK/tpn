'use client';

import {useEffect,useState} from 'react';
import {kartHref,kartPublicUrl} from '@/lib/links';

/** Единая ссылка в отделение. Копия сайта вне нашего сервера (GitHub Pages, файл) ведёт на публичный адрес в новой вкладке. */
export function KartLink({path,className,children,title}:{path:string;className?:string;children:React.ReactNode;title?:string}){
 const [url,setUrl]=useState(kartHref(path));
 const external=url.startsWith('http');
 useEffect(()=>{
  const h=window.location.hostname;
  if(window.location.protocol==='file:'||h.endsWith('github.io'))setUrl(kartPublicUrl+path);
 },[path]);
 return <a className={className} href={url} title={title} {...(external?{target:'_blank',rel:'noopener'}:{})}>{children}</a>;
}
