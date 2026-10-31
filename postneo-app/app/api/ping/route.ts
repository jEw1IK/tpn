/** Сердцебиение открытого окна. На ПК обёртка desktop-server.cjs смотрит на время последнего пинга и гасит сервер, когда окно закрыто. */
export const dynamic='force-dynamic';
export function GET(){
 (globalThis as {__postneoLastPing?:number}).__postneoLastPing=Date.now();
 return Response.json({ok:true},{headers:{'cache-control':'no-store'}});
}
