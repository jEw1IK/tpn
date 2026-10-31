/** Шифрование ключом отделения. Работает и в браузере, и в Node (WebCrypto), поэтому проверяется тестами.
 *
 *  Схема: случайный ключ данных (AES-GCM-256) шифрует карточки, веса и листы. Сам ключ данных хранится на
 *  сервере в двух обёртках: под ключом из парольной фразы отделения (PBKDF2-SHA256) и под кодом восстановления
 *  с листа в сейфе. Сервер видит только обёртки и шифротекст; без фразы или кода прочитать данные нельзя. */
const subtle=()=>{const c=globalThis.crypto;if(!c?.subtle)throw new Error('Шифрование недоступно: откройте сайт по HTTPS');return c.subtle;};
const enc=new TextEncoder(),dec=new TextDecoder();
export const KDF_ITERATIONS=600000;
export const RECOVERY_ITERATIONS=200000;

export const toB64=(bytes:ArrayBuffer|Uint8Array)=>{const u=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);let s='';for(const b of u)s+=String.fromCharCode(b);return btoa(s);};
export const fromB64=(s:string)=>{const bin=atob(s);const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return u;};
const random=(n:number)=>globalThis.crypto.getRandomValues(new Uint8Array(n));
const buf=(u:Uint8Array)=>u.buffer.slice(u.byteOffset,u.byteOffset+u.byteLength) as ArrayBuffer;

/** Случайный ключ данных, 32 байта. */
export const generateDataKey=():Uint8Array=>random(32);
export const generateSalt=():string=>toB64(random(16));

/** Ключ-обёртка из парольной фразы. Фраза нормализуется по Unicode и обрезается по краям, чтобы «та же» фраза совпадала. */
export async function deriveWrapKey(passphrase:string,saltB64:string,iterations=KDF_ITERATIONS):Promise<CryptoKey>{
 const material=await subtle().importKey('raw',enc.encode(passphrase.normalize('NFKC').trim()),'PBKDF2',false,['deriveKey']);
 return subtle().deriveKey({name:'PBKDF2',hash:'SHA-256',salt:buf(fromB64(saltB64)),iterations},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function importDataKey(raw:Uint8Array):Promise<CryptoKey>{
 return subtle().importKey('raw',buf(raw),{name:'AES-GCM'},false,['encrypt','decrypt']);
}
async function seal(key:CryptoKey,plain:Uint8Array):Promise<string>{
 const iv=random(12);const ct=await subtle().encrypt({name:'AES-GCM',iv:buf(iv)},key,buf(plain));
 return 'v1.'+toB64(iv)+'.'+toB64(ct);
}
async function open(key:CryptoKey,sealed:string):Promise<Uint8Array>{
 const [v,iv,ct]=sealed.split('.');if(v!=='v1'||!iv||!ct)throw new Error('Неизвестный формат шифртекста');
 try{return new Uint8Array(await subtle().decrypt({name:'AES-GCM',iv:buf(fromB64(iv))},key,buf(fromB64(ct))));}
 catch{throw new Error('Не удалось расшифровать: другой ключ или повреждённая запись');}
}
/** Ключ данных под обёрткой (фразой или кодом восстановления). */
export const wrapDataKey=(raw:Uint8Array,wrapKey:CryptoKey)=>seal(wrapKey,raw);
export const unwrapDataKey=(wrapped:string,wrapKey:CryptoKey)=>open(wrapKey,wrapped);

/** Запись в шифротекст и обратно. Любой JSON-объект. */
export async function encryptJson(key:CryptoKey,value:unknown):Promise<string>{return seal(key,enc.encode(JSON.stringify(value)));}
export async function decryptJson<T>(key:CryptoKey,sealed:string):Promise<T>{return JSON.parse(dec.decode(await open(key,sealed))) as T;}

/** Код восстановления: 26 знаков Crockford-base32 (130 бит), группами по 5. Печатается на лист в сейф. */
const ALPHABET='0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function generateRecoveryCode():string{
 const bytes=random(26);let out='';
 for(const b of bytes)out+=ALPHABET[b%32];
 return out.match(/.{1,5}/g)!.join('-');
}
/** Нормализация кода, набранного с листа: регистр, похожие символы, разделители. */
export function normalizeRecoveryCode(code:string):string{
 return code.toUpperCase().replace(/[^0-9A-Z]/g,'').replace(/O/g,'0').replace(/[IL]/g,'1');
}
export const recoveryWrapKey=(code:string,saltB64:string)=>deriveWrapKey(normalizeRecoveryCode(code),saltB64,RECOVERY_ITERATIONS);

/** Что лежит на сервере в настройках хранилища. */
export type VaultRecord={kdf_salt:string;kdf_iterations:number;wrapped_key:string;recovery_wrapped_key:string;key_version:number;created_at?:string};

/** Создать хранилище: ключ данных, его обёртки под фразой и кодом. Возвращает код показать один раз. */
export async function createVault(passphrase:string):Promise<{record:Omit<VaultRecord,'created_at'>;recoveryCode:string;rawKey:Uint8Array}>{
 if(passphrase.normalize('NFKC').trim().length<12)throw new Error('Фраза отделения не короче 12 знаков');
 const rawKey=generateDataKey();const salt=generateSalt();const recoveryCode=generateRecoveryCode();
 const [wk,rk]=await Promise.all([deriveWrapKey(passphrase,salt),recoveryWrapKey(recoveryCode,salt)]);
 const [wrapped_key,recovery_wrapped_key]=await Promise.all([wrapDataKey(rawKey,wk),wrapDataKey(rawKey,rk)]);
 return {record:{kdf_salt:salt,kdf_iterations:KDF_ITERATIONS,wrapped_key,recovery_wrapped_key,key_version:1},recoveryCode,rawKey};
}
/** Открыть ключ данных фразой. */
export async function unlockWithPassphrase(record:VaultRecord,passphrase:string):Promise<Uint8Array>{
 return unwrapDataKey(record.wrapped_key,await deriveWrapKey(passphrase,record.kdf_salt,record.kdf_iterations));
}
/** Открыть ключ данных кодом восстановления. */
export async function unlockWithRecovery(record:VaultRecord,code:string):Promise<Uint8Array>{
 return unwrapDataKey(record.recovery_wrapped_key,await recoveryWrapKey(code,record.kdf_salt));
}
/** Сменить фразу: ключ данных тот же, меняется только его обёртка. Записи перешифровывать не нужно. */
export async function rewrapWithPassphrase(record:VaultRecord,rawKey:Uint8Array,passphrase:string):Promise<Pick<VaultRecord,'wrapped_key'|'kdf_salt'|'kdf_iterations'>>{
 if(passphrase.normalize('NFKC').trim().length<12)throw new Error('Фраза отделения не короче 12 знаков');
 const salt=generateSalt();
 return {kdf_salt:salt,kdf_iterations:KDF_ITERATIONS,wrapped_key:await wrapDataKey(rawKey,await deriveWrapKey(passphrase,salt))};
}
/** Если фраза и соль меняются, код восстановления обёртывается заново той же солью. */
export async function rewrapRecovery(rawKey:Uint8Array,saltB64:string,code:string):Promise<string>{
 return wrapDataKey(rawKey,await recoveryWrapKey(code,saltB64));
}
