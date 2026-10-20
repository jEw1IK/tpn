import {getDb} from '@/lib/server/db';
import {audit,cookieName,logout} from '@/lib/server/auth';
import {sessionCookie,userFromRequest} from '@/lib/server/session';
export const dynamic='force-dynamic';
export function POST(req:Request){
 const db=getDb();const user=userFromRequest(req);
 const m=(req.headers.get('cookie')||'').match(new RegExp('(?:^|;\\s*)'+cookieName+'=([^;]+)'));
 logout(db,m?decodeURIComponent(m[1]):null);if(user)audit(db,user,'logout','user',user.id);
 return Response.json({ok:true},{headers:{'Set-Cookie':sessionCookie(null)}});
}
