/** Префикс пути приложения: пусто в больнице, /kart на демо-сервере. Нужен для fetch из браузера; next/link добавляет его сам. */
export const basePath=process.env.NEXT_PUBLIC_BASE_PATH||'';
export const withBase=(path:string)=>basePath+path;
export async function api<T>(path:string,init?:RequestInit&{json?:unknown}):Promise<T>{
 const res=await fetch(withBase(path),{...init,headers:{...(init?.json!==undefined?{'content-type':'application/json'}:{}),...(init?.headers||{})},body:init?.json!==undefined?JSON.stringify(init.json):init?.body,credentials:'same-origin'});
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw new Error((data as {error?:string}).error||('Ошибка '+res.status));
 return data as T;
}
export const ruDate=(iso:string)=>/^\d{4}-\d{2}-\d{2}$/.test(iso)?iso.split('-').reverse().join('.'):iso||'—';
