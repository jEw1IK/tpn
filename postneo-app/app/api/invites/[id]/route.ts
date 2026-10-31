import {getDb} from '@/lib/server/db';
import {audit,deleteInvite} from '@/lib/server/auth';
import {clientIp,json,requireUser} from '@/lib/server/session';
export const dynamic='force-dynamic';
export async function DELETE(req:Request,{params}:{params:Promise<{id:string}>}){
 const u=requireUser(req,['admin']);if(u instanceof Response)return u;
 const id=Number((await params).id);const db=getDb();deleteInvite(db,id);audit(db,u,'invite-delete','invite',id,'',clientIp(req)??undefined);return json({ok:true});
}
