'use client';

import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {BookOpen,Eraser,Printer,X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {blank,calculate,enteralFormulas,example,newEnteralRow,numeric,trophicThresholdMlPerKg,type EnteralRow,type Inputs,type Result} from '@/lib/tpn';
import {carriers,feedingHours,feedingRoutes} from '@/lib/directory';
import {formatNumber as f} from '@/lib/format';
import {patientHeader,sexNames} from '@/lib/patient-header';
import {BrandMark} from '@/components/brand-mark';
import {href} from '@/lib/links';
import {ThemeToggle} from '@/components/theme-toggle';
import {ReferenceDrawer,type RefTab} from '@/components/reference-drawer';
import {NurseSheet} from '@/components/nurse-sheet';
import {Blk,Inp,Ro,Sel,Stp,dot,ru} from '@/components/calc/fields';
import {FluidPop} from '@/components/calc/fluid-pop';
import {DrugsBlock} from '@/components/calc/drugs';
import {SidePanel} from '@/components/calc/side-panel';

const AA:readonly (readonly [string,string])[]=[['Аминовен Инфант 10%','10'],['Аминовен Инфант 6%','6'],['Аминоплазмаль 10%','10']];
const FAT:readonly (readonly [string,string])[]=[['Липоплюс 20%','20'],['СМОФлипид 20%','20'],['Интралипид 20%','20'],['Интралипид 10%','10']];
export type Ui={aaName:string;fatName:string};
export const defaultUi:Ui={aaName:'Аминовен Инфант 10%',fatName:'Липоплюс 20%'};
/** Стартовый лист: пример из движка, кормления по часам, растворители препаратов сверх объёма. */
export const fresh=():Inputs=>({...example(),enteralMode:'feeds8',drugFluid:'extra',fatHours:'20',lowGlucose:'5',highGlucose:'40'});

/** Enter ведёт к следующему полю, Shift + Enter назад: лист заполняется с клавиатуры, не отрывая рук. */
function moveBetweenFields(event:React.KeyboardEvent<HTMLElement>){
 if(event.key!=='Enter'||event.nativeEvent.isComposing||event.altKey||event.ctrlKey||event.metaKey||!(event.target instanceof HTMLInputElement)||event.target.id==='drug-search')return;
 const fields=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('input:not(:disabled):not([readonly]),select:not(:disabled)')).filter(field=>field.getClientRects().length>0);
 const current=fields.indexOf(event.target);if(current<0)return;
 const next=fields[current+(event.shiftKey?-1:1)];if(!next)return;
 event.preventDefault();next.focus();if(next instanceof HTMLInputElement&&next.type==='text')next.select();
}

export type CalculatorProps={initial:Inputs;initialUi?:Ui;onChange?:(p:Inputs,ui:Ui)=>void;locked?:boolean;lockedNote?:ReactNode;fixedHeader?:boolean;toolbar?:ReactNode;allowNew?:boolean};
/** Лист расчёта. Состояние живёт здесь; кто хранит лист, решает родитель через onChange. */
export function Calculator({initial,initialUi,onChange,locked=false,lockedNote,fixedHeader=false,toolbar,allowNew=true}:CalculatorProps){
 const [p,setP]=useState<Inputs>(initial);const [ui,setUi]=useState<Ui>(initialUi??defaultUi);
 const [notice,setNotice]=useState('');const first=useRef(true);
 const [refOpen,setRefOpen]=useState(false);const [refTab,setRefTab]=useState<RefTab>('fluid');
 const [printOpen,setPrintOpen]=useState(false);const [pop,setPop]=useState(false);const [fill,setFill]=useState('');
 const popTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>{if(first.current){first.current=false;return;}onChange?.(p,ui);},[p,ui]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),1800);return()=>clearTimeout(t);},[notice]);
 const update=(patch:Partial<Inputs>)=>setP(old=>({...old,...patch}));
 const r=useMemo(()=>calculate(p),[p]);
 /** Пока у препарата нет дозы, лист считается без него: «чек» не гаснет, а препарат помечен отдельно. */
 const rs=useMemo<Result>(()=>{if(r.valid)return r;if(!r.issues.every(i=>i.medicineId))return r;return calculate({...p,medicines:p.medicines.filter(m=>r.medicines.find(x=>x.id===m.id)?.valid)});},[p,r]);
 const pending=rs===r?[]:p.medicines.filter(m=>!r.medicines.find(x=>x.id===m.id)?.valid).map(m=>r.medicines.find(x=>x.id===m.id)?.name??m.drug);
 const header=useMemo(()=>patientHeader(p),[p]);
 const showPop=(sticky:boolean)=>{setPop(true);if(popTimer.current)clearTimeout(popTimer.current);if(!sticky)popTimer.current=setTimeout(()=>setPop(false),4500);};
 const hidePop=(delay=0)=>{if(popTimer.current)clearTimeout(popTimer.current);popTimer.current=setTimeout(()=>setPop(false),delay);};
 const openRef=(tab?:RefTab)=>{if(tab)setRefTab(tab);setRefOpen(true);};
 const kg=rs.kg;const en=rs.enteralNutrition;const trophic=rs.valid&&(rs.enteralMl??0)>0&&!en.counted;
 const extraFeeds=p.extraFeeds??[];
 const dyn=r.dynamics;
 const fluidStatus=(()=>{const v=numeric(p.fluid);if(v===null)return '';return v<120?'ниже ориентира КР 120–130':v>130?'выше ориентира КР 120–130':'в пределах ориентира КР 120–130';})();
 const high=rs.valid&&rs.mainLinePercent!==null&&rs.mainLinePercent>12.5;
 const v=(x:number|null|undefined,d=1)=>f(rs.valid?x:null,d);
 const printReady=r.valid&&header.valid;
 const softBad=(value:string)=>value.trim()!==''&&!((numeric(value)??0)>0);
 return <div className="app">
  <header className="top">
   <a className="brand" href={href('/')} aria-label="POSTNEO — главная"><BrandMark/></a>
   {toolbar}
   <span className="sp"/>
   {allowNew&&<button type="button" className="tb" onClick={()=>update({...blank(),enteralMode:'feeds8',drugFluid:p.drugFluid,lowGlucose:'5',highGlucose:'40',fatHours:'20'})} title="Очистить лист"><Eraser size={15} aria-hidden="true"/>Новый</button>}
   <button type="button" className="tb" onClick={()=>setPrintOpen(true)}><Printer size={15} aria-hidden="true"/>Печать</button>
   <button type="button" className="tb" onClick={()=>openRef()} aria-haspopup="dialog"><BookOpen size={15} aria-hidden="true"/>Методичка</button>
   <ThemeToggle/>
  </header>
  {locked&&lockedNote&&<div className="locknote">{lockedNote}</div>}
  <div className="view">
   <fieldset className="form" disabled={locked} onKeyDown={moveBetweenFields}>
    <Blk id="patient" title="Пациент" hint="ПКВ и динамика считаются сами" wide>
     <div className="grid c5">
      {fixedHeader?<><Ro label="Фамилия">{p.surname||'—'}</Ro><Ro label="№ истории">{p.historyNumber||'—'}</Ro><Ro label="Дата рождения">{p.birthDate?p.birthDate.split('-').reverse().join('.'):'—'}</Ro><Ro label="Пол">{sexNames[p.sex]||'—'}</Ro></>:<>
      <Inp id="surname" label="Фамилия" mode="text" value={p.surname} onChange={surname=>update({surname})} bad={!header.valid&&!p.surname.trim()}/>
      <Inp id="historyNumber" label="№ истории" mode="text" value={p.historyNumber} onChange={historyNumber=>update({historyNumber})} bad={!p.historyNumber.trim()}/>
      <Inp id="birthDate" label="Дата рождения" type="date" value={p.birthDate} onChange={birthDate=>update({birthDate})} bad={header.issues.some(i=>i.field==='birthDate')}/>
      <Sel id="sex" label="Пол" value={p.sex} onChange={sex=>update({sex})} options={[['','—'],...Object.entries(sexNames)]} bad={header.issues.some(i=>i.field==='sex')}/></>}
      <Inp id="sheetDate" label="Дата листа" type="date" value={p.sheetDate} onChange={sheetDate=>update({sheetDate})} bad={header.issues.some(i=>i.field==='sheetDate')}/>
      <Inp id="day" label="Сутки жизни" unit="сут" value={p.day} onChange={day=>update({day})} bad={r.issues.some(i=>i.field==='day')||header.issues.some(i=>i.field==='day')}/>
      <Inp id="gestation" label="ГВ при рождении" unit="нед" value={p.gestation} onChange={gestation=>update({gestation})} bad={header.issues.some(i=>i.field==='gestation')}/>
      <Inp id="gestationDays" label="и дней" unit="дн" value={p.gestationDays} onChange={gestationDays=>update({gestationDays})} bad={header.issues.some(i=>i.field==='gestationDays')}/>
      <Ro label="ПКВ">{header.pcv?header.pcv.weeks+' нед '+header.pcv.days+' дн':'—'}</Ro>
      <Inp id="hospitalDay" label="Койко-день" value={p.hospitalDay} onChange={hospitalDay=>update({hospitalDay})} bad={header.issues.some(i=>i.field==='hospitalDay')}/>
      <Inp id="birthWeight" label="Масса при рождении" unit="г" value={p.birthWeight} onChange={birthWeight=>update({birthWeight})} bad={softBad(p.birthWeight)}/>
      <Inp id="weightYesterday" label="Вчера" unit="г" value={p.weightYesterday} onChange={weightYesterday=>update({weightYesterday})} bad={softBad(p.weightYesterday)}/>
      <Inp id="weightToday" label="Сегодня" unit="г" value={p.weightToday} onChange={weightToday=>update({weightToday})} bad={r.issues.some(i=>i.field==='weightToday')}/>
      <Inp id="weight" label="Масса для счёта" unit="г" value={p.weight} onChange={weight=>update({weight})} bad={r.issues.some(i=>i.field==='weight')}/>
      <Ro label="Динамика">{dyn.dayGrams===null?'—':(dyn.dayGrams>0?'+':'')+f(dyn.dayGrams,0)+' г ('+f(dyn.dayPercent,1)+' %)'}{dyn.birthPercent!==null&&<> · от рождения {f(dyn.birthPercent,1)} %</>}</Ro>
     </div>
    </Blk>
    <Blk id="need" title="Потребность" hint="шаг кнопок 5 · 0,5 · 0,25">
     <div className="grid c2">
      <div className="popwrap" onMouseEnter={()=>{if(pop&&popTimer.current)clearTimeout(popTimer.current);}} onMouseLeave={()=>{if(pop)hidePop(1500);}} onFocusCapture={()=>showPop(true)} onBlurCapture={()=>hidePop(350)}>
       <Stp id="fluid" label="Физ. потребность" unit="мл/кг" step={5} value={p.fluid} onChange={fluid=>{update({fluid});showPop(false);}} bad={r.issues.some(i=>i.field==='fluid')}>
        <FluidPop show={pop} weightGrams={numeric(p.weight)} day={numeric(p.day)} fluid={numeric(p.fluid)} onPick={value=>{update({fluid:String(value)});showPop(false);}} onTable={()=>{setPop(false);openRef('fluid');}}/>
       </Stp>
      </div>
      <Stp id="gir" label="Глюкоза общая" unit="мг/кг/мин" step={0.5} value={p.gir} onChange={gir=>update({gir})} bad={r.issues.some(i=>i.field==='gir')}/>
      <Stp id="aa" label="Белки" unit="г/кг/сут" step={0.25} value={p.aa} onChange={aa=>update({aa})} bad={r.issues.some(i=>i.field==='aa')}/>
      <Stp id="fat" label="Жиры" unit="г/кг/сут" step={0.25} value={p.fat} onChange={fat=>update({fat})} bad={r.issues.some(i=>i.field==='fat')}/>
     </div>
     <p className="out">углеводы <b>{v(rs.girTotal,1)}</b> общ. = в/в <b>{v(rs.girIv,1)}</b> + смесь {v(rs.girEnteral,1)} мг/кг/мин · в/в {v(rs.ivTotal,0)} мл · глюкоза <b>{v(rs.glucoseGrams,2)} г</b> → {v(rs.mixVolume,1)} мл <b>{v(rs.glucosePercent,2)} %</b> · <span className={high?'w':undefined}>{v(rs.mainLinePercent,2)} % в линии</span> · АК <b>{v(rs.aaMl,1)} мл</b> · жиры <b>{v(rs.fatLineMl,1)} мл</b>{fluidStatus&&<> · {fluidStatus}</>}</p>
    </Blk>
    <Blk id="ions" title="Электролиты" hint="в основной раствор">
     <div className="grid c3">
      <Inp id="calciumMlPerKg" label="Ca глюконат 10 %" unit="мл/кг" value={p.calciumMlPerKg} onChange={calciumMlPerKg=>update({calciumMlPerKg})} bad={r.issues.some(i=>i.field==='calciumMlPerKg')}/>
      <Inp id="kcl" label="KCl 4 %" unit="ммоль/кг" value={p.kcl} onChange={kcl=>update({kcl})}/>
      <Inp id="nacl10" label="NaCl 10 %" unit="ммоль/кг" value={p.nacl10} onChange={nacl10=>update({nacl10})}/>
      <Inp id="nacl09" label="NaCl 0,9 %" unit="ммоль/кг" value={p.nacl09} onChange={nacl09=>update({nacl09})}/>
      <Inp id="magnesium" label="MgSO₄ 25 %" unit="мл/кг" value={p.magnesium} onChange={magnesium=>update({magnesium})}/>
      <Inp id="soluvit" label="Солувит Н" unit="мл/кг" value={p.soluvit} onChange={soluvit=>update({soluvit})}/>
      <Inp id="vitalipid" label="Виталипид" unit="мл/кг" value={p.vitalipid} onChange={vitalipid=>update({vitalipid})}/>
      <Inp id="addamel" label="Аддамель Н" unit="мл" value={p.addamel} onChange={addamel=>update({addamel})}/>
      <Inp id="dipeptiven" label="Дипептивен" unit="мл/кг" value={p.dipeptiven} onChange={dipeptiven=>update({dipeptiven})}/>
     </div>
     <p className="out">в раствор: Ca <b>{v(rs.caMl,1)} мл</b> ({f(rs.calciumMmolPerKg,2)} ммоль/кг) · KCl {v(rs.electrolytes.kclMl,1)} · NaCl 10 % {v(rs.electrolytes.nacl10Ml,1)} · всего <b>{v(rs.electrolytes.sumMl,1)} мл</b> · гепарин <b>{rs.valid&&rs.heparinUnits!==null?rs.heparinUnits:'—'} Ед</b></p>
    </Blk>
    <Blk id="solutions" title="Растворы">
     <div className="grid c2">
      <Sel id="aaName" label="Аминокислоты" value={ui.aaName} onChange={aaName=>{setUi({...ui,aaName});update({aaPercent:AA.find(x=>x[0]===aaName)?.[1]??p.aaPercent});}} options={AA.map(x=>[x[0],x[0]] as const)}/>
      <Sel id="fatName" label="Жировая эмульсия" value={ui.fatName} onChange={fatName=>{setUi({...ui,fatName});update({fatPercent:FAT.find(x=>x[0]===fatName)?.[1]??p.fatPercent});}} options={FAT.map(x=>[x[0],x[0]] as const)}/>
      <Inp id="aaHours" label="АК за" unit="ч" value={p.aaHours} onChange={aaHours=>update({aaHours})} bad={r.issues.some(i=>i.field==='aaHours')}/>
      <Inp id="fatHours" label="Жиры за" unit="ч" value={p.fatHours} onChange={fatHours=>update({fatHours})} bad={r.issues.some(i=>i.field==='fatHours')}/>
      <Inp id="heparin" label="Гепарин" unit="Ед/мл" value={p.heparin} onChange={heparin=>update({heparin})}/>
      <Inp id="insulin" label="Инсулин" unit="Ед/кг/ч" value={p.insulin} onChange={insulin=>update({insulin})}/>
      <Sel id="carrier" label="Проводниковый р-р" value={p.carrier||'none'} onChange={carrier=>update({carrier})} options={[['none','Нет'],...carriers.map(x=>[x,x] as const)]}/>
      <Inp id="carrierMl" label="Проводник" unit="мл" value={p.carrierMl} onChange={carrierMl=>update({carrierMl})}/>
      <Sel id="highGlucose" label="Больший %" value={p.highGlucose} onChange={highGlucose=>update({highGlucose})} options={[['40','Глюкоза 40 %'],['20','Глюкоза 20 %'],['10','Глюкоза 10 %']]} bad={r.issues.some(i=>i.field==='highGlucose')}/>
      <Sel id="lowGlucose" label="Меньший %" value={p.lowSolution==='glucose'?p.lowGlucose:p.lowSolution==='nacl'?'nacl':'0'} onChange={x=>update(x==='nacl'?{lowSolution:'nacl',lowGlucose:'0'}:x==='0'?{lowSolution:'water',lowGlucose:'0'}:{lowSolution:'glucose',lowGlucose:x})} options={[['10','Глюкоза 10 %'],['5','Глюкоза 5 %'],['0','Вода для инъекций'],['nacl','NaCl 0,9 %']]}/>
      <Sel id="drugFluid" label="Растворители препаратов" value={p.drugFluid} onChange={x=>update({drugFluid:x as Inputs['drugFluid']})} options={[['extra','сверх суточного объёма'],['included','внутри объёма (КР 2015)']]}/>
      <Ro label="Жидкость вне инфузии">{f(rs.drugMl,1)} мл · {p.drugFluid==='included'?'вычтена из основного раствора, глюкоза концентрированнее':'сверх расчёта: в/в = потребность + растворители'}</Ro>
     </div>
    </Blk>
    <Blk id="enteral" title="Смесь" hint={<>от {trophicThresholdMlPerKg} мл/кг вычитается из в/в</>}>
     <div className="grid c2">
      <Sel id="formulaId" label="Смесь" value={p.formulaId} onChange={formulaId=>update({formulaId})} options={[['none','Не выбрана'],...enteralFormulas.map(x=>[x.id,x.name] as const)]} bad={r.issues.some(i=>i.field==='formulaId')}/>
      <Sel id="feedingRoute" label="Способ" value={p.feedingRoute} onChange={feedingRoute=>update({feedingRoute})} options={[['','Не указан'],...feedingRoutes.map(x=>[x,x] as const)]}/>
      <label className="f" htmlFor="fill-feeds"><span className="l">Во все кормления</span><span className="w"><input id="fill-feeds" inputMode="decimal" autoComplete="off" value={ru(fill)} placeholder="—" onChange={e=>{const x=dot(e.target.value);setFill(x);update({feeds:Array(8).fill(x)});}}/><em>мл × 8</em></span></label>
      <Ro label={extraFeeds.length?'Энтерально всего':'Энтерально'}>{f(rs.enteralMl,0)} мл · {f(en.volumePerKg,1)} мл/кг · {rs.enteralMl?(trophic?'трофическое, сверх объёма':'учтено, Б/Ж/У вычтены'):'нет'}</Ro>
     </div>
     <div className="feeds" role="group" aria-label="Объёмы по кормлениям">{feedingHours.map((hour,i)=><label key={hour} className={'cell'+(r.issues.some(x=>x.field==='feeds')?' bad':'')}><span>{hour.slice(0,2)}ʰ</span><input inputMode="decimal" autoComplete="off" value={ru(p.feeds[i]??'')} aria-label={'Кормление '+hour} onChange={e=>{const feeds=[...p.feeds];while(feeds.length<8)feeds.push('');feeds[i]=dot(e.target.value);update({feeds});}}/></label>)}</div>
     {extraFeeds.map((row,index)=>{
      const field='extraFeeds:'+row.id;const bad=r.issues.some(x=>x.field===field);const res=en.rows.find(x=>x.id===row.id);
      const patch=(change:Partial<EnteralRow>)=>update({extraFeeds:extraFeeds.map(x=>x.id===row.id?{...x,...change}:x)});
      const same=row.feeds.every(x=>(x??'')===(row.feeds[0]??''))?row.feeds[0]??'':'';
      return <div key={row.id} className="feed-extra" role="group" aria-label={'Смесь '+(index+2)}>
       <div className="grid c2">
        <Sel id={'formula-'+row.id} label={'Смесь '+(index+2)} value={row.formulaId} onChange={formulaId=>patch({formulaId})} options={[['none','Не выбрана'],...enteralFormulas.map(x=>[x.id,x.name] as const)]} bad={bad}/>
        <Sel id={'route-'+row.id} label="Способ" value={row.route} onChange={route=>patch({route})} options={[['','Как у первой'],...feedingRoutes.map(x=>[x,x] as const)]}/>
        <label className="f" htmlFor={'fill-'+row.id}><span className="l">Во все кормления</span><span className="w"><input id={'fill-'+row.id} inputMode="decimal" autoComplete="off" value={ru(same)} placeholder="—" onChange={e=>patch({feeds:Array(8).fill(dot(e.target.value))})}/><em>мл × 8</em></span></label>
        <Ro label={'Смесь '+(index+2)+' за сутки'}>{f(res?.volumeMl??null,0)} мл · <button type="button" className="tb" onClick={()=>update({extraFeeds:extraFeeds.filter(x=>x.id!==row.id)})}>убрать</button></Ro>
       </div>
       <div className="feeds">{feedingHours.map((hour,i)=><label key={hour} className={'cell'+(bad?' bad':'')}><span>{hour.slice(0,2)}ʰ</span><input inputMode="decimal" autoComplete="off" value={ru(row.feeds[i]??'')} aria-label={'Смесь '+(index+2)+', кормление '+hour} onChange={e=>{const feeds=[...row.feeds];while(feeds.length<8)feeds.push('');feeds[i]=dot(e.target.value);patch({feeds});}}/></label>)}</div>
      </div>;})}
     {extraFeeds.length<2&&<p className="hint feed-add"><button type="button" className="tb" onClick={()=>update({extraFeeds:[...extraFeeds,newEnteralRow('f'+Date.now().toString(36))]})}>+ ещё одна смесь</button> — вторая смесь или грудное молоко по своим кормлениям; объём и Б/Ж/У суммируются</p>}
    </Blk>
    <Blk id="medications" title="Препараты" hint="группа → поиск → в лист" wide>
     <DrugsBlock p={p} r={r} update={update} notice={setNotice}/>
    </Blk>
   </fieldset>
   <SidePanel p={p} r={r} rs={rs} pending={pending} aaName={ui.aaName} fatName={ui.fatName} headerIssues={header.issues.map(i=>i.message)}/>
  </div>
  <a className="mbar" href="#side"><b>{f(rs.total,0)} мл</b> · <span className={high?'w':undefined}>{v(rs.mainLinePercent,1)} %</span> · {p.medicines.length} преп.<span>к итогу ↓</span></a>
  <ReferenceDrawer open={refOpen} tab={refTab} onTab={setRefTab} onClose={()=>setRefOpen(false)} p={p}/>
  <Dialog open={printOpen} onOpenChange={setPrintOpen}><DialogContent className="print-preview" showCloseButton={false}>
   <div className="print-preview-head"><div><DialogTitle>Печатный лист</DialogTitle><DialogDescription>{printReady?'Лист и оборот, А4 альбомный. Проверьте шапку и препараты перед печатью.':!header.valid?'Заполните шапку: '+header.issues.map(i=>i.message).join('; '):'Расчёт неполный: '+r.errors.join('; ')}</DialogDescription></div><Button variant="ghost" size="icon" onClick={()=>setPrintOpen(false)} aria-label="Закрыть"><X size={18}/></Button></div>
   <div className="print-preview-body"><NurseSheet p={p} r={r} header={header}/></div>
   <div className="print-preview-actions"><Button variant="outline" onClick={()=>setPrintOpen(false)}>Вернуться к листу</Button><Button disabled={!printReady} onClick={()=>window.print()}><Printer size={16}/>Печать / PDF</Button></div>
  </DialogContent></Dialog>
  <div className="print-document" aria-hidden="true"><NurseSheet p={p} r={r} header={header}/></div>
  <div className={'toast'+(notice?' show':'')} role="status">{notice}</div>
 </div>;
}
