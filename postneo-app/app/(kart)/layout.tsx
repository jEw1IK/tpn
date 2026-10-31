import {redirect} from 'next/navigation';
import {currentUser,kartDisabled} from '@/lib/server/session';
import {KartBar} from '@/components/kart/bar';
import {VaultGate,VaultProvider} from '@/components/kart/vault';

export const dynamic='force-dynamic';
/** Всё внутри доступно только после входа; данные пациентов открываются ключом отделения в браузере. */
export default async function KartLayout({children}:{children:React.ReactNode}){
 if(kartDisabled())redirect('/calculator');
 const user=await currentUser();
 if(!user)redirect('/login');
 return <VaultProvider user={user}><div className="app kart"><KartBar user={user}/><VaultGate>{children}</VaultGate></div></VaultProvider>;
}
