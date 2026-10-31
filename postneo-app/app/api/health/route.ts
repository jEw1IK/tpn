import {getDb} from '@/lib/server/db';
import {kartDisabled} from '@/lib/server/session';
export const dynamic='force-dynamic';
/** В режиме «только калькулятор» база не открывается вовсе: файла на диске не появляется. */
export function GET(){if(!kartDisabled())getDb();return Response.json({ok:true,app:'postneo-kart',mode:kartDisabled()?'calculator':'kart'});}
