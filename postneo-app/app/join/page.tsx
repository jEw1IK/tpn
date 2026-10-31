import {redirect} from 'next/navigation';
import {currentUser} from '@/lib/server/session';
import {JoinForm} from '@/components/kart/join-form';

export const dynamic='force-dynamic';
/** Регистрация врача по коду приглашения от администратора. */
export default async function JoinPage({searchParams}:{searchParams:Promise<{code?:string}>}){
 if(await currentUser())redirect('/patients');
 return <JoinForm code={(await searchParams).code??''}/>;
}
