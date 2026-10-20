/** Роли и их подписи — без серверных зависимостей, чтобы клиентские компоненты могли их показывать. */
export type Role='admin'|'doctor'|'nurse';
export type User={id:number;login:string;name:string;role:Role;disabled:number;created_at:string};
export const roleNames:Record<Role,string>={admin:'Администратор',doctor:'Врач',nurse:'Медсестра'};
