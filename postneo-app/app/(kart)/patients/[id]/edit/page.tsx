import {notFound,redirect} from 'next/navigation';
import {getDb} from '@/lib/server/db';
import {getPatient} from '@/lib/server/patients';
import {canEdit,currentUser} from '@/lib/server/session';
import {PatientForm} from '@/components/kart/patient-form';

export const dynamic='force-dynamic';
export default async function EditPatientPage({params}:{params:Promise<{id:string}>}){
 const user=(await currentUser())!;if(!canEdit(user))redirect('/patients');
 const patient=getPatient(getDb(),Number((await params).id));if(!patient)notFound();
 return <PatientForm patient={patient}/>;
}
