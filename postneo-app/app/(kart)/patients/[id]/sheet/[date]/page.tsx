import {notFound} from 'next/navigation';
import {getDb} from '@/lib/server/db';
import {audit} from '@/lib/server/auth';
import {getPatient,getSheet,openSheet} from '@/lib/server/patients';
import {canEdit,currentUser} from '@/lib/server/session';
import {SheetEditor} from '@/components/kart/sheet-editor';

export const dynamic='force-dynamic';
export default async function SheetPage({params}:{params:Promise<{id:string;date:string}>}){
 const user=(await currentUser())!;const db=getDb();const {id,date}=await params;const pid=Number(id);
 const patient=getPatient(db,pid);if(!patient||!/^\d{4}-\d{2}-\d{2}$/.test(date))notFound();
 // врач открывает лист на дату и получает черновик из предыдущего; медсестра видит только то, что уже есть
 const sheet=canEdit(user)&&patient.status==='active'?openSheet(db,pid,date,user.id):getSheet(db,pid,date);
 if(!sheet)notFound();
 audit(db,user,'open','sheet',pid,date);
 return <SheetEditor patientId={pid} surname={patient.surname} date={date} sheet={{status:sheet.status,inputs:sheet.inputs,ui:sheet.ui,version:sheet.version,signed_at:sheet.signed_at,updated_at:sheet.updated_at}} role={user.role}/>;
}
