import {redirect} from 'next/navigation';
import {canEdit,currentUser} from '@/lib/server/session';
import {PatientImport} from '@/components/kart/patient-import';

export const dynamic='force-dynamic';
export default async function ImportPatientsPage(){
 const user=(await currentUser())!;if(!canEdit(user))redirect('/patients');
 return <PatientImport/>;
}
