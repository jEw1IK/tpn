import {redirect} from 'next/navigation';
import {getDb} from '@/lib/server/db';
import {countUsers} from '@/lib/server/auth';
import {kartDisabled} from '@/lib/server/session';
import {LoginForm} from '@/components/kart/login-form';

export const dynamic='force-dynamic';
export default function SetupPage(){
 if(kartDisabled())redirect('/calculator');
 if(countUsers(getDb())>0)redirect('/login');
 return <LoginForm setup/>;
}
