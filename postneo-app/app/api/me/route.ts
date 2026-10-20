import {json,userFromRequest} from '@/lib/server/session';
export const dynamic='force-dynamic';
export function GET(req:Request){const u=userFromRequest(req);return json({user:u},u?200:401);}
