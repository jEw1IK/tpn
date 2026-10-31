import {notFound,redirect} from 'next/navigation';
import {canEdit,currentUser} from '@/lib/server/session';
import {PatientForm} from '@/components/kart/patient-form';

export const dynamic='force-dynamic';
export default async function EditPatientPage({params}:{params:Promise<{id:string}>}){
 const user=(await currentUser())!;if(!canEdit(user))redirect('/patients');
 const id=Number((await params).id);if(!Number.isInteger(id)||id<=0)notFound();
 return <PatientForm id={id}/>;
}
