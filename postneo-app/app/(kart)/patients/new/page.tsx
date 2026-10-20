import {redirect} from 'next/navigation';
import {canEdit,currentUser} from '@/lib/server/session';
import {PatientForm} from '@/components/kart/patient-form';

export const dynamic='force-dynamic';
export default async function NewPatientPage(){
 const user=(await currentUser())!;if(!canEdit(user))redirect('/patients');
 return <PatientForm/>;
}
