import {getDb} from '@/lib/server/db';
import {listPatients,patientGlance} from '@/lib/server/patients';
import {canEdit,currentUser} from '@/lib/server/session';
import {todayIso} from '@/lib/sheet-flow';
import {PatientsList} from '@/components/kart/patients-list';

export const dynamic='force-dynamic';
export default async function PatientsPage({searchParams}:{searchParams:Promise<{status?:string}>}){
 const user=(await currentUser())!;const status=(await searchParams).status==='discharged'?'discharged':'active';
 const db=getDb();const date=todayIso();
 const patients=listPatients(db,status).map(p=>({...p,glance:patientGlance(db,p,date)}));
 return <PatientsList patients={patients} status={status} canEdit={canEdit(user)}/>;
}
