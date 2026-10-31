import type { Metadata } from 'next';
import './globals.css';
import {themeScript} from '@/components/theme-toggle';
import {Heartbeat} from '@/components/heartbeat';
export const metadata:Metadata={title:'POSTNEO — неонатология',description:'Питание и инфузионная терапия новорождённых: суточный баланс жидкости, калории, белок и печатный лист. Тестовая версия.',icons:{icon:'/favicon-p.svg',shortcut:'/favicon-p.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ru" suppressHydrationWarning><body><script dangerouslySetInnerHTML={{__html:themeScript}}/>{process.env.NEXT_PUBLIC_HEARTBEAT==='1'&&<Heartbeat/>}{children}</body></html>;}
