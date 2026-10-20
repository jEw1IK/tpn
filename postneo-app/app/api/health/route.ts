import {getDb} from '@/lib/server/db';
export const dynamic='force-dynamic';
export function GET(){getDb();return Response.json({ok:true,app:'postneo-kart'});}
