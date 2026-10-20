import {redirect} from 'next/navigation';
import {getDb} from '@/lib/server/db';
import {listUsers} from '@/lib/server/auth';
import {currentUser,isAdmin} from '@/lib/server/session';
import {UsersAdmin} from '@/components/kart/users-admin';

export const dynamic='force-dynamic';
export default async function UsersPage(){
 const user=(await currentUser())!;if(!isAdmin(user))redirect('/patients');
 return <UsersAdmin users={listUsers(getDb())} me={user.id}/>;
}
