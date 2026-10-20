'use client';

import Link from 'next/link';
import {usePathname,useRouter} from 'next/navigation';
import {LogOut} from 'lucide-react';
import {BrandMark} from '@/components/brand-mark';
import {ThemeToggle} from '@/components/theme-toggle';
import {api} from '@/lib/base';
import {roleNames,type User} from '@/lib/roles';

export function KartBar({user}:{user:User}){
 const path=usePathname();const router=useRouter();
 const link=(href:string,label:string)=><Link href={href} aria-current={path.startsWith(href)?'page':undefined}>{label}</Link>;
 const out=async()=>{await api('/api/logout',{method:'POST'});router.push('/login');router.refresh();};
 return <nav className="kbar" aria-label="Разделы">
  <Link href="/patients" className="brand" aria-label="Пациенты"><BrandMark/></Link>
  {link('/patients','Пациенты')}
  {user.role==='admin'&&link('/users','Пользователи')}
  {user.role==='admin'&&link('/journal','Журнал')}
  <span className="who"><b>{user.name}</b><span>{roleNames[user.role]}</span><ThemeToggle/><button type="button" className="tb" onClick={out}><LogOut size={14} aria-hidden="true"/>Выйти</button></span>
 </nav>;
}
