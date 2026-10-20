import {notFound} from 'next/navigation';
import {getDb} from '@/lib/server/db';
import {audit} from '@/lib/server/auth';
import {courses,getPatient,listSheets,listWeights,patientGlance} from '@/lib/server/patients';
import {canEdit,currentUser} from '@/lib/server/session';
import {todayIso} from '@/lib/sheet-flow';
import {PatientCard} from '@/components/kart/patient-card';

export const dynamic='force-dynamic';
export default async function PatientPage({params}:{params:Promise<{id:string}>}){
 const user=(await currentUser())!;const db=getDb();const id=Number((await params).id);
 const patient=getPatient(db,id);if(!patient)notFound();
 const today=todayIso();audit(db,user,'view','patient',id);
 const sheets=listSheets(db,id).map(s=>({date:s.sheet_date,status:s.status,summary:s.summary,updated_at:s.updated_at}));
 return <PatientCard patient={patient} weights={listWeights(db,id)} sheets={sheets} courses={courses(db,id,today)} glance={patientGlance(db,patient,today)} canEdit={canEdit(user)}/>;
}
