import {canEdit,currentUser} from '@/lib/server/session';
import {PatientsList} from '@/components/kart/patients-list';

export const dynamic='force-dynamic';
export default async function PatientsPage({searchParams}:{searchParams:Promise<{status?:string}>}){
 const user=(await currentUser())!;const status=(await searchParams).status==='discharged'?'discharged':'active';
 return <PatientsList status={status} canEdit={canEdit(user)}/>;
}
