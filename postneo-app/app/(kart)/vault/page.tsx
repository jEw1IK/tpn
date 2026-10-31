import {redirect} from 'next/navigation';
import {currentUser,isAdmin} from '@/lib/server/session';
import {VaultAdmin} from '@/components/kart/vault-admin';

export const dynamic='force-dynamic';
export default async function VaultPage(){
 const user=(await currentUser())!;if(!isAdmin(user))redirect('/patients');
 return <VaultAdmin/>;
}
