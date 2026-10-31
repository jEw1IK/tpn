import {notFound} from 'next/navigation';
import {canEdit,currentUser} from '@/lib/server/session';
import {PatientCard} from '@/components/kart/patient-card';

export const dynamic='force-dynamic';
export default async function PatientPage({params}:{params:Promise<{id:string}>}){
 const user=(await currentUser())!;const id=Number((await params).id);if(!Number.isInteger(id)||id<=0)notFound();
 return <PatientCard id={id} canEdit={canEdit(user)}/>;
}
