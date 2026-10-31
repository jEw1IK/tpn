import {notFound} from 'next/navigation';
import {currentUser} from '@/lib/server/session';
import {SheetEditor} from '@/components/kart/sheet-editor';

export const dynamic='force-dynamic';
export default async function SheetPage({params}:{params:Promise<{id:string;date:string}>}){
 const user=(await currentUser())!;const {id,date}=await params;const pid=Number(id);
 if(!Number.isInteger(pid)||pid<=0||!/^\d{4}-\d{2}-\d{2}$/.test(date))notFound();
 return <SheetEditor patientId={pid} date={date} role={user.role}/>;
}
