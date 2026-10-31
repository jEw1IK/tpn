import '../home.css';
import {calculate,blank,drugs,enteralFormulas,type Inputs} from '@/lib/tpn';
import {formatNumber as f} from '@/lib/format';
import {CountUp} from '@/components/count-up';
import {SiteNav,SiteFoot,examplePdf} from '@/components/site-chrome';
import {href,asset,staticSite} from '@/lib/links';
import {redirect} from 'next/navigation';

/* Учебный пациент, на котором страница показывает расчёт: 1450 г, 2-е сутки, 110 мл/кг, глюкоза 5 мг/кг/мин, белок 2 г/кг, жиры 1,5 г/кг, грудное молоко по часам. */
const patient=(feedMl:string):Inputs=>({...blank(),weight:'1450',weightToday:'1450',day:'2',gestation:'32',start:'08:00',fluid:'110',aa:'2',aaPercent:'10',aaHours:'24',fat:'1.5',fatPercent:'20',fatHours:'24',gir:'5',baseHours:'24',calciumMlPerKg:'1',calciumContent:'0.225',lowGlucose:'5',highGlucose:'40',heparin:'0.5',enteralMode:'feeds8',formulaId:'grudnoe-moloko',feeds:Array(8).fill(feedMl),medicines:[],drugFluid:'extra',trophicRule:'kr'});

/** «О проекте»: витрина для коллег. Все цифры на странице считает сам движок, ничего не вписано руками. */
export default function AboutPage(){
 if(!staticSite)redirect(process.env.KART_DISABLED==='1'?'/calculator':'/patients');
 const r0=calculate(patient('5'));const n=(v:number|null)=>v??0;
 const lead={base:n(r0.base),baseRate:n(r0.baseRate),allFluid:n(r0.allFluid),glucosePercent:n(r0.glucosePercent),glucoseGrams:n(r0.glucoseGrams),girIv:n(r0.girIv),aaMl:n(r0.aaMl),aaRate:n(r0.aaRate),aaGrams:n(r0.aaGrams),fatLineMl:n(r0.fatLineMl),fatRate:n(r0.fatRate),fatTotal:n(r0.fatTotal),enteralMl:n(r0.enteralMl),kr:{enteralKcal:n(r0.kr.enteralKcal),parenteralKcal:n(r0.kr.parenteralKcal),perKg:n(r0.kr.perKg)}};
 const rows=['5','10','15'].map(ml=>{const r=calculate(patient(ml));return {ml,enteral:r.enteralMl,glucose:r.glucoseGrams,gir:r.girIv,aa:r.aaMl,fat:r.fatLineMl,base:r.base,kcal:r.kr.perKg};});
 const groups=new Set(drugs.map(d=>d.group)).size;
 const share=(ml:number)=>Math.round(ml/lead.allFluid*100);
 return <div className="home">
  <a className="skip" href="#about-main">К содержимому</a>
  <SiteNav current="about"/>
  <main id="about-main">
   <section className="hm-hero" aria-labelledby="about-title"><div className="hm-wrap hm-hero__in">
    <div className="hm-hero__text">
     <h1 id="about-title">Суточный расчёт питания новорождённого и лист на печать.</h1>
     <p className="lead">Жидкость, глюкоза, белок, эмульсия и препараты по КР 2015. Написано неонатологами в отделении реанимации новорождённых.</p>
     <p className="hm-hero__act"><a className="btn" href={href('/calculator')}>Открыть калькулятор</a><a className="hm-link" href={examplePdf}>Пример листа в PDF</a></p>
    </div>
    <figure className="hm-shot hm-shot--hero hm-hero__fig" data-slot="hero" data-kind="product" data-alt="Калькулятор в тёмной теме: блоки ввода слева, полученная инфузия справа">
     <picture>
      <source media="(max-width: 60rem)" srcSet={asset('/images/calculator-phone-dark.webp')} width="780" height="1688"/>
      <img src={asset('/images/calculator-desktop-dark.webp')} width="1600" height="1280" alt="Экран калькулятора: пациент, потребность, электролиты, растворы, смесь и панель «Полученная инфузия»" fetchPriority="high"/>
     </picture>
    </figure>
   </div></section>

   <section className="hm-inst" aria-labelledby="inst-title"><div className="hm-wrap">
    <div className="hm-head"><h2 id="inst-title">Один ребёнок: 1450 г, вторые сутки</h2><p className="lead">110 мл/кг, глюкоза 5 мг/кг/мин, белок 2 и жиры 1,5 г/кг, грудное молоко по 5 мл восемь раз. Так это считает движок.</p></div>
    <ul className="inst">
     <li><h3>Основной раствор</h3><p className="fig"><CountUp value={lead.base} digits={1}/><small>мл · {f(lead.baseRate,1)} мл/ч</small></p><span className="bar" aria-hidden="true"><i style={{width:share(lead.base)+'%'}}/></span><p>{share(lead.base)} % суточной жидкости, {f(lead.allFluid,1)} мл</p></li>
     <li><h3>Глюкоза в растворе</h3><p className="fig fig--lit"><CountUp value={lead.glucosePercent} digits={2}/><small>%</small></p><span className="bar" aria-hidden="true"><i className="lit" style={{width:Math.round(lead.glucosePercent/12.5*100)+'%'}}/></span><p>{f(lead.glucoseGrams,2)} г внутривенно, {f(lead.girIv,1)} из 5 мг/кг/мин</p></li>
     <li><h3>Аминокислоты</h3><p className="fig"><CountUp value={lead.aaMl} digits={0}/><small>мл · {f(lead.aaRate,2)} мл/ч</small></p><span className="bar" aria-hidden="true"><i style={{width:share(lead.aaMl)+'%'}}/></span><p>{f(lead.aaGrams,1)} г белка за сутки, раствор 10 %</p></li>
     <li><h3>Жировая эмульсия</h3><p className="fig"><CountUp value={lead.fatLineMl} digits={0}/><small>мл · {f(lead.fatRate,3)} мл/ч</small></p><span className="bar" aria-hidden="true"><i style={{width:share(lead.fatLineMl)+'%'}}/></span><p>{f(lead.fatTotal,2)} г жиров за сутки, эмульсия 20 %</p></li>
     <li><h3>Энтерально</h3><p className="fig"><CountUp value={lead.enteralMl} digits={0}/><small>мл · {f(lead.kr.enteralKcal,0)} ккал</small></p><span className="bar" aria-hidden="true"><i style={{width:share(lead.enteralMl)+'%'}}/></span><p>Грудное молоко, восемь кормлений по 5 мл</p></li>
     <li><h3>Энергия</h3><p className="fig"><CountUp value={lead.kr.perKg} digits={0}/><small>ккал/кг</small></p><span className="bar" aria-hidden="true"><i style={{width:Math.round(lead.kr.perKg/120*100)+'%'}}/></span><p>{f(lead.kr.parenteralKcal,0)} парентерально и {f(lead.kr.enteralKcal,0)} энтерально, ориентир КР 120</p></li>
    </ul>
   </div></section>

   <section className="hm-sheets" aria-labelledby="sheets-title"><div className="hm-wrap">
    <div className="hm-head"><h2 id="sheets-title">Печатается на одном листе А4, с двух сторон</h2><p className="lead">Инфузии, препараты и клетки на 24 часа на лицевой стороне, кормления, КОС и диурез на обороте.</p></div>
    <div className="sheets">
     <figure className="hm-paper"><div className="hm-paper__sheet"><img src={asset('/images/nurse-sheet-front-p.webp')} width="1123" height="794" alt="Лицевая сторона листа интенсивной терапии" loading="lazy"/></div><figcaption>Лицевая сторона: инфузии, препараты, клетки 24 часов</figcaption></figure>
     <figure className="hm-paper"><div className="hm-paper__sheet"><img src={asset('/images/nurse-sheet-back-p.webp')} width="1123" height="794" alt="Оборот листа: кормления, КОС, респираторная поддержка, диурез, заметки" loading="lazy"/></div><figcaption>Оборот: кормления, КОС, респираторная поддержка, диурез, заметки</figcaption></figure>
    </div>
   </div></section>

   <section className="hm-table" aria-labelledby="table-title"><div className="hm-wrap">
    <div className="hm-head"><h2 id="table-title">Смесь растёт, инфузия тает</h2><p className="lead">Тот же ребёнок, три объёма кормления. Цель по глюкозе и белку одна, меняется только внутривенная часть.</p></div>
    <table className="cmp">
     <thead><tr><th scope="col">Кормление</th><th scope="col" className="num">Энтерально</th><th scope="col" className="num">Глюкоза в/в</th><th scope="col" className="num">Аминокислоты</th><th scope="col" className="num">Эмульсия</th><th scope="col" className="num">Основной раствор</th><th scope="col" className="num">Энергия</th></tr></thead>
     <tbody>{rows.map(r=><tr key={r.ml}><th scope="row">{r.ml} мл восемь раз</th><td className="num" data-label="Энтерально">{f(r.enteral,0)} мл</td><td className="num" data-label="Глюкоза в/в">{f(r.glucose,2)} г, {f(r.gir,1)} мг/кг/мин</td><td className="num" data-label="Аминокислоты">{f(r.aa,0)} мл</td><td className="num" data-label="Эмульсия">{f(r.fat,0)} мл</td><td className="num" data-label="Основной раствор">{f(r.base,1)} мл</td><td className="num" data-label="Энергия">{f(r.kcal,0)} ккал/кг</td></tr>)}</tbody>
    </table>
   </div></section>

   <section className="hm-ref" aria-labelledby="ref-title"><div className="hm-wrap hm-split">
    <div className="hm-head"><h2 id="ref-title">Справочник собран по аптеке отделения</h2></div>
    <div className="refs">
     <div><p className="fig"><CountUp value={drugs.length}/><small>препаратов</small></p><p>Антибиотики, кардиотоники, седация, гормоны, кровь: {groups} групп с концентрациями форм. Растворитель и объём считаются в баланс, кардиотоники титруются по шприцу.</p></div>
     <div><p className="fig"><CountUp value={enteralFormulas.length}/><small>смесей и грудное молоко</small></p><p>Две смеси по своим кормлениям. От 25 мл/кг белок, жиры и углеводы смеси вычитаются из внутривенных доз, трофическое питание идёт сверх расчётной жидкости.</p></div>
    </div>
   </div></section>

   <section className="hm-faq" aria-labelledby="faq-title"><div className="hm-wrap hm-split">
    <div className="hm-head"><h2 id="faq-title">Три вопроса перед первым листом</h2></div>
    <dl className="faq">
     <div><dt>Где хранятся данные?</dt><dd>Калькулятор держит лист в браузере этого компьютера и никуда его не отправляет. В отделении карточки и листы лежат на сервере зашифрованными: прочитать их можно только паролем сотрудника отделения.</dd></div>
     <div><dt>Кто отвечает за дозы?</dt><dd>Врач. Подсказки у препаратов ориентировочные, калькулятор считает объёмы и показывает, где расчёт выходит за рамки КР.</dd></div>
     <div><dt>Работает на телефоне?</dt><dd>Да, блоки выстраиваются в одну колонку, итог открывается шторкой снизу. Печатать удобнее с компьютера.</dd></div>
    </dl>
   </div></section>

   <section className="hm-who" aria-labelledby="who-title"><div className="hm-wrap hm-split">
    <div className="hm-head"><h2 id="who-title">Кто делает</h2></div>
    <div className="hm-who__text">
     <p><strong>Сергей Нехорошкин</strong>, врач-неонатолог отделения реанимации и интенсивной терапии новорождённых. Калькулятор появился из обходов: лист считался на бумаге и калькуляторе телефона, а потом переписывался в назначения.</p>
     <p>Правки приходят из отделения и выкладываются в тот же день. Доступ в отделение выдаёт автор, калькулятор открыт всем.</p>
    </div>
   </div></section>

   <section className="hm-close" id="start" aria-labelledby="close-title"><div className="hm-wrap hm-close__in">
    <div className="hm-close__text">
     <h2 id="close-title">Пример уже внутри</h2>
     <p className="lead">Открывается без регистрации, с вымышленным ребёнком внутри. Проверьте цифры или очистите форму и начните свой лист.</p>
     <p className="hm-close__act"><a className="btn" href={href('/calculator')}>Открыть калькулятор</a></p>
    </div>
    <figure className="hm-shot hm-shot--phone" data-slot="phone" data-kind="product" data-alt="Калькулятор на телефоне">
     <img src={asset('/images/calculator-phone-dark.webp')} width="780" height="1688" alt="Калькулятор на экране телефона: блоки ввода в одну колонку" loading="lazy"/>
    </figure>
   </div></section>
  </main>
  <SiteFoot/>
 </div>;
}
