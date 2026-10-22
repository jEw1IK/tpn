import {formatNumber as f} from '@/lib/format';
import {formatDate,nextDate,sexNames,type PatientHeader} from '@/lib/patient-header';
import {buildNurseHours,feedingMarks,type NurseHour} from '@/lib/nurse-sheet';
import {buildWorkingRows,type WorkingRow} from '@/lib/nurse-working-sheet';
import {drugs,numeric,type Inputs,type Result} from '@/lib/tpn';
import {BrandMark} from '@/components/brand-mark';

/* Печатный лист А4 альбомный: лицевая сторона с инфузиями и препаратами, оборот с кормлениями, КОС и диурезом.
   Размеры в миллиметрах совпадают с CSS (.nurse-page), поэтому разбиение на страницы считается заранее. */
const MM={content:195,header:21,summary:8.6,section:11,blank:6.4,minRow:8.6,minMed:8,line:3.1,heading:3.6,pad:1.8,charsPerLine:84,footer:12,maxBlank:16,minBlank:5};
const lines=(text:string)=>text.split('\n').reduce((n,l)=>n+Math.max(1,Math.ceil(l.length/MM.charsPerLine)),0);
function rowMm(row:WorkingRow,compact:boolean){
 const text=compact?row.instruction.replace(/\n/g,' · '):row.instruction;
 const n=lines(text)+(row.preparation?lines(row.preparation):0);
 return Math.max(compact?MM.minMed:MM.minRow,MM.heading+n*MM.line+MM.pad);
}
/** Страницы лицевой стороны: первая несёт инфузии, препараты переходят дальше целыми строками. */
function paginate(infusion:WorkingRow[],medication:WorkingRow[]){
 const pages:{infusion:WorkingRow[];medication:WorkingRow[];blanks:number}[]=[];
 const capacity=(first:boolean)=>MM.content-MM.header-MM.footer-(first?MM.summary+MM.section*2:MM.section);
 let page={infusion,medication:[] as WorkingRow[],blanks:0};
 let used=infusion.reduce((s,r)=>s+rowMm(r,false),0)+(infusion.length?MM.blank:0);
 for(const row of medication){
  const mm=rowMm(row,true);
  if(used+mm>capacity(pages.length===0)&&(page.infusion.length||page.medication.length)){pages.push(page);page={infusion:[],medication:[],blanks:0};used=0;}
  page.medication.push(row);used+=mm;
 }
 const fit=(room:number)=>Math.max(0,Math.min(MM.maxBlank,Math.floor(room/MM.blank)));
 page.blanks=fit(capacity(pages.length===0)-used);
 pages.push(page);
 // Пустых строк для рукописных назначений должно хватать: если на последней странице их меньше minBlank, добавляем страницу продолжения.
 if(page.blanks<MM.minBlank)pages.push({infusion:[],medication:[],blanks:fit(capacity(false))});
 return pages;
}

const hourClass=(x:NurseHour,extra='')=>'h'+(x.index%6===0&&x.index?' b1':'')+(x.time.startsWith('00:')?' d0':'')+(extra?' '+extra:'');
function HourHead({hours}:{hours:NurseHour[]}){return <>{hours.map(x=><th key={x.index} className={x.nextDay?'d1':undefined}>{x.time.slice(0,2)}{x.nextDay&&<sup>+1</sup>}</th>)}</>;}
function Cols({hours,name}:{hours:NurseHour[];name:string}){return <colgroup><col className="n" style={{width:name}}/><col className="v"/><col className="r"/>{hours.map(x=><col key={x.index}/>)}</colgroup>;}

function Header({p,header,r,title,sub,compact}:{p:Inputs;header:PatientHeader;r:Result;title:string;sub:string;compact?:boolean}){
 const dyn=r.dynamics;const dynText=dyn.dayGrams===null?'—':(dyn.dayGrams>0?'+':'')+f(dyn.dayGrams,0)+' г'+(dyn.birthPercent===null?'':' · '+f(dyn.birthPercent,0)+' %');
 const fields:[string,string,string?][]=[['Фамилия',p.surname.trim()||'—','name'],['№ истории',p.historyNumber.trim()||'—'],['Дата рожд.',formatDate(p.birthDate)],['Пол',sexNames[p.sex]||'—'],['Сутки',p.day||'—'],['ПКВ',header.pcv?header.pcv.weeks+' нед '+header.pcv.days+' дн':'—'],['ГВ при рожд.',(p.gestation||'—')+' нед '+(p.gestationDays||'0')+' дн'],['Масса рожд.',f(numeric(p.birthWeight),0)+' г'],['Сегодня',f(numeric(p.weightToday)??numeric(p.weight),0)+' г'],['Для счёта',f(numeric(p.weight),0)+' г'],['Динамика',dynText]];
 return <>
  <header className="hd"><BrandMark className="mark"/><h1>{title}<small>{sub}</small></h1><div className="date"><span>Дата листа</span><b>{formatDate(p.sheetDate)}</b><i>расчётные сутки {formatDate(p.sheetDate)} {p.start} → {nextDate(p.sheetDate)} {p.start}</i></div></header>
  {compact?<p className="patline">{fields.slice(0,2).map(([,v],i)=><b key={i}>{i?' · ':''}{v}</b>)}{fields.slice(2).map(([k,v])=><span key={k}> · {k} <b>{v}</b></span>)}</p>
   :<dl className="pat">{fields.map(([k,v,c])=><div key={k} className={c}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
 </>;
}
function Foot({p,page,pages,note,venous}:{p:Inputs;page:number;pages:number;note:React.ReactNode;venous?:boolean}){
 return <div className="foot"><div className="note">{note}</div><div className="pno">{p.surname.trim()||'—'} · № {p.historyNumber.trim()||'—'} · {formatDate(p.sheetDate)} · лист {page} из {pages}</div><div className="sig">{venous&&<span>Венозный доступ</span>}<span>Врач</span><span>Медицинская сестра</span></div></div>;
}

function planMarks(row:WorkingRow,hours:NurseHour[]):string[]{
 const marks=Array<string>(24).fill('');
 for(const t of row.timing){const plus=/\+1/.test(t);const hh=Number(t.slice(0,2));const i=hours.findIndex(x=>Number(x.time.slice(0,2))===hh&&x.nextDay===plus);if(i>=0)marks[i]='○';}
 return marks;
}
function OrderRow({row,hours,compact,continuous}:{row:WorkingRow;hours:NurseHour[];compact?:boolean;continuous?:boolean}){
 const text=compact?row.instruction.replace(/\n/g,' · '):row.instruction;const marks=row.marks||planMarks(row,hours);
 return <tr className={'row'+(compact?' med':'')+(continuous?' cont':'')+(!compact&&lines(text)>=3?' tall':'')} data-row-id={row.id}><td className={'n'+(compact?' c':'')}><b>{row.label}</b><p>{text}</p>{row.preparation&&<p className="prep">{row.preparation}</p>}</td><td className="v">{row.volume}</td><td className="r">{row.rate}</td>{hours.map(x=><td key={x.index} className={hourClass(x,marks[x.index]?(row.marks?'feed':'plan'):'')}>{marks[x.index]||''}</td>)}</tr>;
}
function BlankRow({hours,label}:{hours:NurseHour[];label?:string}){return <tr className="blank"><td className="n">{label}</td><td className="v"/><td className="r"/>{hours.map(x=><td key={x.index} className={hourClass(x)}/>)}</tr>;}

export function NurseSheet({p,r,header}:{p:Inputs;r:Result;header:PatientHeader}){
 const ready=r.valid&&header.valid;const hours=buildNurseHours(p.start);const w=buildWorkingRows(p,r);
 const infusion=[...w.infusion,...w.support.filter(row=>row.kind!=='enteral')];
 const fronts=paginate(infusion,w.medication);const total=fronts.length+1;
 const kg=r.kg;const en=r.enteralNutrition;const trophic=r.valid&&(r.enteralTrophicMl??0)>0;
 const show=(x:number|null|undefined,d=1)=>f(r.valid?x:null,d);
 const summary:[string,React.ReactNode][]=[
  ['Физ. потребность',<>{show(r.total,0)} мл <small>{f(numeric(p.fluid),0)} мл/кг</small></>],
  ['Получит в/в',<>{show(r.ivTotal,0)} мл <small>{show(r.ivTotal!==null&&kg?r.ivTotal/kg:null,0)} мл/кг</small></>],
  ['Энтерально',<>{show(r.enteralMl,0)} мл <small>{show(en.volumePerKg,0)} мл/кг{trophic?' троф.':''}</small></>],
  ['Основной раствор',<>{show(r.base,1)} мл <small>{show(r.mainLinePercent,1)} %</small></>],
  ['Глюкоза',<>{f(numeric(p.gir),1)} <small>мг/кг/мин · {show(r.glucoseGrams,1)} г</small></>],
  ['Белок всего · АК в/в',<>{show(r.proteinPlan.achievedPerKg,1)} · {show(r.proteinPlan.requiredIvPerKg,1)} <small>г/кг</small></>],
  ['Жиры в/в',<>{show(kg&&r.fatGrams!==null?r.fatGrams/kg:null,1)} <small>г/кг · {show(r.fatGrams,2)} г</small></>],
  ['Энергия',<>{show(r.kr.perKg,0)} <small>ккал/кг · {show(r.kr.totalKcal,0)} ккал</small></>],
 ];
 const continuous=(row:WorkingRow)=>{const m=p.medicines.find(x=>x.id===row.medicineId);const d=m&&drugs.find(x=>x.id===m.drug);return d?.kind==='continuous';};
 const feedMarks=feedingMarks(p.feeds,p.start);
 const extraRows=(p.extraFeeds??[]).map(row=>({row,res:en.rows.find(x=>x.id===row.id),marks:feedingMarks(row.feeds,p.start)}));
 const feedStatus=!r.valid?'':r.enteralMl?(en.counted?'учтено в суточной жидкости, Б/Ж/У смеси вычтены из в/в':'трофическое, сверх расчётной жидкости, в ПП не учтено'):'кормление не назначено; строки для записи, если его начнут';
 const every3=hours.filter(x=>x.index%3===0);
 const labRows=['pH','pCO₂, мм рт. ст.','pO₂, мм рт. ст.','BE, ммоль/л','HCO₃⁻, ммоль/л','Лактат, ммоль/л','Na⁺','K⁺','Ca²⁺','Cl⁻','Hb, г/л','Ht, %','Билирубин','Глюкоза, ммоль/л'];
 const respRows=['Режим','FiO₂, %','Flow, л/мин','PIP, см H₂O','PEEP, см H₂O','MAP, см H₂O','Частота, /мин','Ti, с','Vt, мл','etCO₂'];
 const obs=(title:string,rows:string[])=><div><h2>{title}<small>время и значения по факту</small></h2><table className="obs"><colgroup><col className="l"/>{Array.from({length:8},(_,i)=><col key={i}/>)}</colgroup><tbody><tr className="t"><th scope="row">Время</th>{Array.from({length:8},(_,i)=><td key={i}/>)}</tr>{rows.map(l=><tr key={l}><th scope="row">{l}</th>{Array.from({length:8},(_,i)=><td key={i}/>)}</tr>)}</tbody></table></div>;
 return <article className="nurse-sheet" data-ready={ready}>
  {fronts.map((page,index)=><section key={index} className="nurse-page front" aria-label={'Лист '+(index+1)}>
   <Header p={p} header={header} r={r} title="Лист интенсивной терапии" sub={'парентеральное питание · назначения · отметки выполнения'+(fronts.length>1?' · часть '+(index+1)+' из '+fronts.length:'')+(ready?'':' · ЧЕРНОВИК, расчёт не завершён')}/>
   {index===0&&<dl className="sum">{summary.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
   {page.infusion.length>0&&<><h2>Инфузии и питание<small>⁺¹ — {nextDate(p.sheetDate)} · клетки часов для отметки выполнения · «мл сутки» — объём в балансе</small></h2>
    <table><Cols hours={hours} name="78mm"/><thead><tr><th className="n">Назначение · состав · режим</th><th>мл<br/>сутки</th><th>мл/ч</th><HourHead hours={hours}/></tr></thead><tbody>{page.infusion.map(row=><OrderRow key={row.id} row={row} hours={hours}/>)}<BlankRow hours={hours} label="Дополнительный раствор"/></tbody></table></>}
   <h2>Лекарственные назначения<small>○ — запланированное время введения; доза и разведение проверены врачом</small></h2>
   <table><Cols hours={hours} name="78mm"/><thead><tr><th className="n">Препарат · доза · разведение · время</th><th>мл<br/>сутки</th><th>мл/ч</th><HourHead hours={hours}/></tr></thead><tbody>{page.medication.map(row=><OrderRow key={row.id} row={row} hours={hours} compact continuous={continuous(row)}/>)}{Array.from({length:page.blanks},(_,i)=><BlankRow key={i} hours={hours} label={i===0?'Дополнительно в течение суток':undefined}/>)}</tbody></table>
   <Foot p={p} page={index+1} pages={total} venous note={<>Расчёт POSTNEO по КР РАСПМ 2015. Объёмы в балансе округлены до 0,1 мл; полные объёмы введений указаны в назначении. Энтеральное питание и мониторинг — на обороте.</>}/>
  </section>)}
  <section className="nurse-page back" aria-label="Оборот">
   <Header p={p} header={header} r={r} title="Оборот листа" sub="энтеральное питание · КОС · респираторная поддержка · диурез и положение" compact/>
   <h2>Энтеральное питание<small>{feedStatus}</small></h2>
   <table className="feed"><colgroup><col className="n" style={{width:'64mm'}}/><col className="v"/><col className="k"/>{hours.map(x=><col key={x.index}/>)}</colgroup><thead><tr><th className="n">Смесь · способ · объём на кормление</th><th>мл<br/>сутки</th><th>мл/кг</th><HourHead hours={hours}/></tr></thead><tbody>
    <tr><th scope="row">{en.formula?en.formula.name:'Смесь не выбрана'}{p.feedingRoute&&<small> · {p.feedingRoute.toLowerCase()}</small>}{p.feeds.some(x=>x.trim())&&<small> · по {p.feeds[0].replace('.',',')||'—'} мл × 8</small>}</th><td className="v">{show(extraRows.length?en.primaryMl:r.enteralMl,0)}</td><td className="k">{show(extraRows.length&&en.primaryMl!==null&&r.kg?en.primaryMl/r.kg:en.volumePerKg,0)}</td>{hours.map(x=><td key={x.index} className={hourClass(x,feedMarks[x.index]?'feed':'')}>{feedMarks[x.index]||''}</td>)}</tr>
    {extraRows.map(({row,res,marks})=><tr key={row.id}><th scope="row">{res?.formula?res.formula.name:'Смесь не выбрана'}{(row.route||p.feedingRoute)&&<small> · {(row.route||p.feedingRoute).toLowerCase()}</small>}{row.feeds.some(x=>x.trim())&&<small> · по {row.feeds[0].replace('.',',')||'—'} мл × 8</small>}</th><td className="v">{show(res?.volumeMl??null,0)}</td><td className="k">{show(res?.volumeMl!==null&&res?.volumeMl!==undefined&&r.kg?res.volumeMl/r.kg:null,0)}</td>{hours.map(x=><td key={x.index} className={hourClass(x,marks[x.index]?'feed':'')}>{marks[x.index]||''}</td>)}</tr>)}
    {extraRows.length>0&&<tr><th scope="row">Энтерально всего</th><td className="v">{show(r.enteralMl,0)}</td><td className="k">{show(en.volumePerKg,0)}</td>{hours.map(x=><td key={x.index} className={hourClass(x)}/>)}</tr>}
    <tr><th scope="row">Остаточный объём</th><td className="v"/><td className="k"/>{hours.map(x=><td key={x.index} className={hourClass(x)}/>)}</tr>
    <tr><th scope="row">Фактически получил</th><td className="v"/><td className="k"/>{hours.map(x=><td key={x.index} className={hourClass(x)}/>)}</tr>
   </tbody></table>
   <div className="two">{obs('КОС и лаборатория',labRows)}{obs('Респираторная поддержка',respRows)}</div>
   <h2>Диурез и смена положения<small>раз в 3 часа · диурез в мл, положение буквой: С спина · Л левый бок · П правый бок · Ж живот</small></h2>
   <table className="diur"><colgroup><col className="l"/>{every3.map(x=><col key={x.index}/>)}<col className="sum"/></colgroup><thead><tr><th className="n">Показатель</th>{every3.map(x=><th key={x.index} className={x.nextDay?'d1':undefined}>{x.time.slice(0,2)}{x.nextDay&&<sup>+1</sup>}–{String((Number(x.time.slice(0,2))+3)%24).padStart(2,'0')}</th>)}<th>за сутки</th></tr></thead><tbody>{['Диурез, мл','Смена положения','Остаток в желудке, мл'].map(l=><tr key={l}><th scope="row">{l}</th>{every3.map(x=><td key={x.index} className={x.time.startsWith('00:')?'d0':undefined}/>)}<td/></tr>)}</tbody></table>
   <Foot p={p} page={total} pages={total} note={<>Баланс за сутки: в/в фактически ______ мл · энтерально ______ мл · диурез ______ мл · масса утром ______ г</>}/>
  </section>
 </article>;
}
