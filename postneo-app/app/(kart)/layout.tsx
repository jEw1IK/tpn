import {redirect} from 'next/navigation';
import {currentUser} from '@/lib/server/session';
import {KartBar} from '@/components/kart/bar';

export const dynamic='force-dynamic';
/** Всё внутри доступно только после входа. */
export default async function KartLayout({children}:{children:React.ReactNode}){
 const user=await currentUser();
 if(!user)redirect('/login');
 return <div className="app kart"><KartBar user={user}/>{children}</div>;
}
