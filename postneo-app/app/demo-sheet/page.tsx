import {notFound} from 'next/navigation';
import {calculate,example,newMedicine} from '@/lib/tpn';
import {patientHeader} from '@/lib/patient-header';
import {NurseSheet} from '@/components/nurse-sheet';

/** Только для проверки вёрстки: лист с большим числом препаратов. Собирается лишь при NEXT_PUBLIC_DEMO=1 и на сайт не попадает. */
export default function DemoSheetPage(){
 if(process.env.NEXT_PUBLIC_DEMO!=='1')notFound();
 const p=example();
 const add=(drug:string,patch:Record<string,unknown>)=>p.medicines.push({...newMedicine(drug,'demo-'+drug),...patch} as typeof p.medicines[number]);
 add('antibiotic-gentamicin',{dose:'4',interval:'24',first:'10:00',volume:'2',infusionHours:'0.5',route:'в/в (за 30 мин)'});
 add('antibiotic-meropenem',{dose:'20',interval:'8',first:'08:00',volume:'3',infusionHours:'0.5',route:'в/в (за 30 мин)'});
 add('antibiotic-vankomicin',{dose:'15',interval:'12',first:'10:00',volume:'5',infusionHours:'1',route:'в/в (за 1 час)'});
 add('antifungal-flukonazol',{dose:'6',interval:'24',first:'12:00',volume:'4',infusionHours:'1',route:'в/в (за 1 час)'});
 add('ph-caffeine-citrate',{dose:'5',interval:'24',first:'09:00',volume:'2',infusionHours:'0.5',route:'в/в (за 30 мин)',loading:true,loadingDose:'20',loadingVolume:'3',loadingFirst:'08:00',loadingHours:'0.5',loadingSource:'КР апноэ недоношенных'});
 add('ph-phenobarbital-paglyuferal',{dose:'5',interval:'24',first:'20:00',route:'per os'});
 add('ph-vitamin-k',{dose:'1',interval:'24',first:'08:00',route:'в/м'});
 add('dopamine',{dose:'5',pump:'0.5',volume:'24',stock:'40'});
 add('dobutamine',{dose:'5',pump:'0.5',volume:'24',stock:'10'});
 const r=calculate(p);
 return <div className="app"><div className="print-document" style={{display:'block'}}><NurseSheet p={p} r={r} header={patientHeader(p)}/></div>
  <pre style={{fontSize:12,padding:16}}>{JSON.stringify({valid:r.valid,errors:r.errors,meds:r.medicines.map(m=>[m.id,m.valid,m.errors??''])},null,1)}</pre></div>;
}
