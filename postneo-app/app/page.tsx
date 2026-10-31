import './home.css';
import {calculate,blank,drugs,enteralFormulas,type Inputs} from '@/lib/tpn';
import {formatNumber as f} from '@/lib/format';
import {BrandMark} from '@/components/brand-mark';
import {href,asset} from '@/lib/links';

const examplePdf=asset('/examples/nurse-sheet-p.pdf');
/* Учебный пациент, на котором страница показывает расчёт: 1450 г, 2-е сутки, 110 мл/кг, глюкоза 5 мг/кг/мин, белок 2 г/кг, жиры 1,5 г/кг, грудное молоко по часам. */
const patient=(feedMl:string):Inputs=>({...blank(),weight:'1450',weightToday:'1450',day:'2',gestation:'32',start:'08:00',fluid:'110',aa:'2',aaPercent:'10',aaHours:'24',fat:'1.5',fatPercent:'20',fatHours:'24',gir:'5',baseHours:'24',calciumMlPerKg:'1',calciumContent:'0.225',lowGlucose:'5',highGlucose:'40',heparin:'0.5',enteralMode:'feeds8',formulaId:'grudnoe-moloko',feeds:Array(8).fill(feedMl),medicines:[],drugFluid:'extra',trophicRule:'kr'});
const changelog:[string,string,string][]=[
 ['2026-10-27','27 октября','Шаги округления как в бумажном листе: граммы белка и жиров до 0,1, проценты до сотых.'],
 ['2026-10-27','27 октября','Болюс вводится сразу; длительность осталась только у микроструйного пути.'],
 ['2026-10-23','23 октября','Справочник собран по аптеке отделения: 74 новых препарата с концентрациями форм.'],
 ['2026-10-22','22 октября','Вторая смесь по своим кормлениям, углеводная нагрузка общая и в/в.'],
];

export default function HomePage(){
 const lead=calculate(patient('5'));
 const rows=['5','10','15'].map(ml=>{const r=calculate(patient(ml));return {ml,enteral:r.enteralMl,glucose:r.glucoseGrams,gir:r.girIv,aa:r.aaMl,fat:r.fatLineMl,base:r.base,kcal:r.kr.perKg};});
 const groups=new Set(drugs.map(d=>d.group)).size;
 return <div className="home">
  <a className="skip" href="#home-main">К содержимому</a>
  <header className="hm-nav"><div className="hm-wrap hm-nav__in">
   <a className="hm-brand" href={href('/')} aria-label="POSTNEO, главная"><BrandMark/><span>POSTNEO</span></a>
   <a className="btn btn--quiet" href={href('/calculator')}>Открыть калькулятор</a>
  </div></header>
  <main id="home-main">
   <section className="hm-hero" aria-labelledby="home-title"><div className="hm-wrap hm-hero__in">
    <div className="hm-hero__text">
     <h1 id="home-title">Суточный расчёт питания и лист назначений.</h1>
     <p className="lead">Жидкость, глюкоза, белок и препараты новорождённого по КР 2015, с печатью на А4.</p>
     <p className="hm-hero__act"><a className="btn" href={href('/calculator')}>Открыть калькулятор</a><a className="hm-link" href={examplePdf}>Пример листа в PDF</a></p>
    </div>
    <figure className="hm-shot hm-shot--hero" data-slot="hero" data-kind="product" data-alt="Калькулятор с заполненным учебным листом: блоки ввода слева, полученная инфузия справа">
     <picture>
      <source media="(max-width: 60rem)" srcSet={asset('/images/calculator-phone-result.webp')} width="780" height="1688"/>
      <img src={asset('/images/calculator-desktop.webp')} width="1600" height="1280" alt="Экран калькулятора: потребность, растворы, электролиты, смесь и панель «Полученная инфузия»" fetchPriority="high"/>
     </picture>
    </figure>
   </div></section>

   <section className="hm-bento" id="possibilities" aria-labelledby="bento-title"><div className="hm-wrap">
    <h2 id="bento-title">Жидкость, белок и препараты в одном листе</h2>
    <div className="bento">
     <article className="tile tile--lead">
      <h3>Учебный пример: 1450 г, вторые сутки</h3>
      <p className="tile__big num">{f(lead.base,1)} <small>мл основного раствора</small></p>
      <dl className="tile__facts num">
       <div><dt>Глюкоза в/в</dt><dd>{f(lead.glucoseGrams,2)} г, {f(lead.glucosePercent,2)} %</dd></div>
       <div><dt>Аминокислоты</dt><dd>{f(lead.aaMl,0)} мл</dd></div>
       <div><dt>Жировая эмульсия</dt><dd>{f(lead.fatLineMl,0)} мл</dd></div>
       <div><dt>Гепарин</dt><dd>{lead.heparinUnits} Ед</dd></div>
      </dl>
      <p className="tile__note">110 мл/кг, глюкоза 5 мг/кг/мин, белок 2 и жиры 1,5 г/кг, грудное молоко по 5 мл восемь раз.</p>
     </article>
     <figure className="tile tile--shot" data-slot="sheet-front" data-kind="product" data-alt="Лицевая сторона печатного листа">
      <img src={asset('/images/nurse-sheet-front-p.webp')} width="1123" height="794" alt="Лист интенсивной терапии: инфузии, лекарственные назначения и клетки 24 часов" loading="lazy"/>
      <figcaption data-keep>Лист А4: инфузии, препараты, клетки на 24 часа</figcaption>
     </figure>
     <figure className="tile tile--shot" data-slot="sheet-back" data-kind="product" data-alt="Оборот печатного листа">
      <img src={asset('/images/nurse-sheet-back-p.webp')} width="1123" height="794" alt="Оборот листа: кормления, КОС, респираторная поддержка, диурез" loading="lazy"/>
      <figcaption data-keep>Оборот: кормления, КОС, диурез</figcaption>
     </figure>
     <article className="tile">
      <h3>{drugs.length} препаратов аптеки отделения</h3>
      <p>Антибиотики, кардиотоники, седация, гормоны, кровь: {groups} групп с концентрациями форм. Растворитель и объём считаются в баланс.</p>
      <p>Нагрузочная доза, титрование кардиотоников по шприцу, per os без разведения.</p>
     </article>
     <article className="tile">
      <h3>{enteralFormulas.length} смесей и грудное молоко</h3>
      <p>Две смеси по своим кормлениям. От 25 мл/кг белок, жиры и углеводы смеси вычитаются из внутривенных доз.</p>
      <p>Трофическое питание до 25 мл/кг идёт сверх расчётной жидкости.</p>
     </article>
    </div>
   </div></section>

   <section className="hm-table" aria-labelledby="table-title"><div className="hm-wrap">
    <div className="hm-head"><h2 id="table-title">Смесь растёт, инфузия тает</h2><p className="lead">Тот же ребёнок, три объёма кормления. Цель по глюкозе и белку одна, меняется только внутривенная часть.</p></div>
    <table className="cmp">
     <thead><tr><th scope="col">Кормление</th><th scope="col" className="num">Энтерально</th><th scope="col" className="num">Глюкоза в/в</th><th scope="col" className="num">Аминокислоты</th><th scope="col" className="num">Эмульсия</th><th scope="col" className="num">Основной раствор</th><th scope="col" className="num">Энергия</th></tr></thead>
     <tbody>{rows.map(r=><tr key={r.ml}><th scope="row">{r.ml} мл восемь раз</th><td className="num" data-label="Энтерально">{f(r.enteral,0)} мл</td><td className="num" data-label="Глюкоза в/в">{f(r.glucose,2)} г, {f(r.gir,1)} мг/кг/мин</td><td className="num" data-label="Аминокислоты">{f(r.aa,0)} мл</td><td className="num" data-label="Эмульсия">{f(r.fat,0)} мл</td><td className="num" data-label="Основной раствор">{f(r.base,1)} мл</td><td className="num" data-label="Энергия">{f(r.kcal,0)} ккал/кг</td></tr>)}</tbody>
    </table>
   </div></section>

   <section className="hm-log" aria-labelledby="log-title"><div className="hm-wrap hm-split">
    <div className="hm-head"><h2 id="log-title">Что изменилось за октябрь</h2><p className="lead">Правки приходят из отделения и выкладываются в тот же день.</p></div>
    <ol className="log">{changelog.map(([iso,date,text],i)=><li key={i}><time dateTime={iso}>{date}</time><p>{text}</p></li>)}</ol>
   </div></section>

   <section className="hm-faq" aria-labelledby="faq-title"><div className="hm-wrap hm-split">
    <div className="hm-head"><h2 id="faq-title">Три вопроса перед первым листом</h2></div>
    <dl className="faq">
     <div><dt>Где хранятся данные?</dt><dd>В браузере на вашем компьютере. На сервер ничего не отправляется, после очистки браузера лист исчезает.</dd></div>
     <div><dt>Кто отвечает за дозы?</dt><dd>Врач. Подсказки у препаратов ориентировочные, калькулятор считает объёмы и показывает, где расчёт выходит за рамки КР.</dd></div>
     <div><dt>Работает на телефоне?</dt><dd>Да, блоки выстраиваются в одну колонку, итог открывается шторкой снизу. Печатать удобнее с компьютера.</dd></div>
    </dl>
   </div></section>

   <section className="hm-close" id="start" aria-labelledby="close-title"><div className="hm-wrap hm-close__in">
    <div className="hm-close__text">
     <h2 id="close-title">Пример уже внутри</h2>
     <p className="lead">Открывается без регистрации, с вымышленным ребёнком внутри. Проверьте цифры или очистите форму и начните свой лист.</p>
     <p className="hm-close__act"><a className="btn" href={href('/calculator')}>Открыть калькулятор</a></p>
    </div>
    <figure className="hm-shot hm-shot--phone" data-slot="phone" data-kind="product" data-alt="Калькулятор на телефоне">
     <img src={asset('/images/calculator-phone.webp')} width="780" height="1688" alt="Калькулятор на экране телефона: блоки ввода в одну колонку" loading="lazy"/>
    </figure>
   </div></section>
  </main>
  <footer className="hm-foot"><div className="hm-wrap">
   <p className="hm-foot__line">Расчёт питания и инфузий для отделения новорождённых, собранный неонатологами.</p>
   <div className="hm-foot__row"><a className="hm-brand" href={href('/')} aria-label="POSTNEO, главная"><BrandMark/><span>POSTNEO</span></a><nav aria-label="Ссылки"><a href={href('/calculator')}>Калькулятор</a><a href="#possibilities">Возможности</a><a href="#start">Первый лист</a><a href={examplePdf}>Пример листа</a></nav><small>Тестовая версия 0.2</small></div>
  </div></footer>
  <script dangerouslySetInnerHTML={{__html:"window.hallmarkSlots=(m)=>{for(const [k,v] of Object.entries(m)){const s=document.querySelector(`[data-slot=\"${k}\"]`);if(!s)continue;const im=new Image();im.src=typeof v==='string'?v:v.src;im.alt=(typeof v==='object'&&v.alt)||s.dataset.alt||'';s.querySelectorAll(':scope > img').forEach((o)=>o.remove());s.prepend(im);}};document.querySelectorAll('[data-slot] img').forEach((i)=>{i.addEventListener('error',()=>i.remove(),{once:true});});"}}/>
 </div>;
}
