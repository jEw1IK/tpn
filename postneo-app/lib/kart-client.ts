/** Чтение данных с сервера в браузере: расшифровка карточек, весов и листов. Старые открытые записи читаются как есть. */
import {decryptJson,encryptJson} from './crypto.ts';
import {assemblePatient,plainPatientData,type Patient,type PatientData,type PatientRowWire,type SheetData,type SheetWire,type WeightWire} from './kart-view.ts';
import type {WeightPoint} from './sheet-flow.ts';
import type {Inputs} from './tpn.ts';

export type SheetView={id:number;date:string;status:'draft'|'signed';valid:boolean;version:number;signedAt:string|null;updatedAt:string;encrypted:boolean;data:SheetData};

export async function readPatient(key:CryptoKey|null,row:PatientRowWire):Promise<Patient>{
 if(row.enc){if(!key)throw new Error('Нужен ключ отделения');return assemblePatient(row,await decryptJson<PatientData>(key,row.enc));}
 return assemblePatient(row,plainPatientData(row));
}
export async function readWeights(key:CryptoKey|null,rows:readonly WeightWire[]):Promise<WeightPoint[]>{
 const out:WeightPoint[]=[];
 for(const w of rows){
  if(w.enc){if(!key)throw new Error('Нужен ключ отделения');const d=await decryptJson<{grams:number}>(key,w.enc);out.push({date:w.date,grams:d.grams});}
  else if(typeof w.grams==='number')out.push({date:w.date,grams:w.grams});
 }
 return out.sort((a,b)=>a.date.localeCompare(b.date));
}
export async function readSheet(key:CryptoKey|null,row:SheetWire):Promise<SheetView>{
 let data:SheetData;
 if(row.enc){if(!key)throw new Error('Нужен ключ отделения');data=await decryptJson<SheetData>(key,row.enc);}
 else data={inputs:JSON.parse(row.inputs_json||'{}') as Inputs,ui:JSON.parse(row.ui_json||'{}') as Record<string,string>};
 return {id:row.id,date:row.sheet_date,status:row.status,valid:!!row.valid,version:row.version,signedAt:row.signed_at,updatedAt:row.updated_at,encrypted:!!row.enc,data};
}
export async function readSheets(key:CryptoKey|null,rows:readonly SheetWire[]):Promise<SheetView[]>{
 const out:SheetView[]=[];for(const r of rows)out.push(await readSheet(key,r));return out;
}
/** Последняя масса из строки списка: шифротекст или открытое число. */
export async function readLastWeight(key:CryptoKey|null,row:PatientRowWire):Promise<WeightPoint|null>{
 if(!row.last_weight_date)return null;
 if(row.last_weight_enc){if(!key)throw new Error('Нужен ключ отделения');return {date:row.last_weight_date,grams:(await decryptJson<{grams:number}>(key,row.last_weight_enc)).grams};}
 return typeof row.last_weight_grams==='number'?{date:row.last_weight_date,grams:row.last_weight_grams}:null;
}
export const sealPatient=(key:CryptoKey,p:PatientData)=>encryptJson(key,p);
export const sealWeight=(key:CryptoKey,grams:number)=>encryptJson(key,{grams:Math.round(grams)});
export const sealSheet=(key:CryptoKey,data:SheetData)=>encryptJson(key,data);
