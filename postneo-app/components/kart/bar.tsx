'use client';

import Link from 'next/link';
import {usePathname,useRouter} from 'next/navigation';
import {KeyRound,LogOut} from 'lucide-react';
import {BrandMark} from '@/components/brand-mark';
import {ThemeToggle} from '@/components/theme-toggle';
import {api} from '@/lib/base';
import {roleNames,type User} from '@/lib/roles';
import {useVault} from './vault';

export function KartBar({user}:{user:User}){
 const path=usePathname();const router=useRouter();const vault=useVault();
 const link=(href:string,label:string)=><Link href={href} aria-current={path.startsWith(href)?'page':undefined}>{label}</Link>;
 const out=async()=>{await api('/api/logout',{method:'POST'});router.push('/login');router.refresh();};
 return <nav className="kbar" aria-label="Разделы">
  <Link href="/patients" className="brand" aria-label="Пациенты"><BrandMark/></Link>
  {link('/patients','Пациенты')}
  {user.role==='admin'&&link('/users','Пользователи')}
  {user.role==='admin'&&link('/journal','Журнал')}
  {user.role==='admin'&&link('/vault','Ключ')}
  <span className="who"><b>{user.name}</b><span>{roleNames[user.role]}</span><ThemeToggle/>{vault.status==='ready'&&<button type="button" className="tb" onClick={vault.forget} title="Забыть ключ отделения на этом компьютере"><KeyRound size={14} aria-hidden="true"/>Закрыть ключ</button>}<button type="button" className="tb" onClick={out}><LogOut size={14} aria-hidden="true"/>Выйти</button></span>
 </nav>;
}
