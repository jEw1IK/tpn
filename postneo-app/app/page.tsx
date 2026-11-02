import './home.css';
import {calculate,blank,drugs,enteralFormulas,type Inputs} from '@/lib/tpn';
import {formatNumber as f} from '@/lib/format';
import {BrandMark} from '@/components/brand-mark';
import {KartLink} from '@/components/kart-link';
import {CountUp} from '@/components/count-up';
import {href,asset,staticSite,telegramUrl} from '@/lib/links';
import {redirect} from 'next/navigation';

const examplePdf=asset('/examples/nurse-sheet-p.pdf');
/* Учебный пациент, на котором страница показывает расчёт: 1450 г, 2-е сутки, 110 мл/кг, глюкоза 5 мг/кг/мин, белок 2 г/кг, жиры 1,5 г/кг, грудное молоко по 5 мл восемь раз. */
const patient:Inputs={...blank(),weight:'1450',weightToday:'1450',day:'2',gestation:'32',start:'08:00',fluid:'110',aa:'2',aaPercent:'10',aaHours:'24',fat:'1.5',fatPercent:'20',fatHours:'24',gir:'5',baseHours:'24',calciumMlPerKg:'1',calciumContent:'0.225',lowGlucose:'5',highGlucose:'40',heparin:'0.5',enteralMode:'feeds8',formulaId:'grudnoe-moloko',feeds:Array(8).fill('5'),medicines:[],drugFluid:'extra',trophicRule:'kr'};
const n=(v:number|null)=>v??0;

/** Главная: чёрно-белое стекло. Все цифры на странице считает движок калькулятора. */
export default function HomePage(){
 // На сервере корень приложения ведёт сразу к пациентам (а они — ко входу); главная живёт только в статическом сайте.
 if(!staticSite)redirect(process.env.KART_DISABLED==='1'?'/calculator':'/patients');
 const r=calculate(patient);
 return <div className="home">
  <header className="hm-nav"><div className="hm-wrap hm-nav__in">
   <a className="hm-brand" href={href('/')} aria-label="POSTNEO, главная"><BrandMark/><span>POSTNEO</span></a>
   <nav className="hm-nav__act" aria-label="Разделы">
    <a className="hm-link" href={href('/calculator')}>Калькулятор</a>
    <a className="hm-link" href={examplePdf}>Пример листа</a>
    <KartLink className="hm-link hm-link--keep" path="/login">Войти в отделение</KartLink>
   </nav>
  </div></header>

  <main>
   <section className="hm-hero hm-wrap" aria-labelledby="home-title">
    <figure className="hm-hero__fig">
     <img src={asset('/images/heart-glass-alpha.webp')} width="1024" height="1024" alt="Анатомическое сердце из прозрачного стекла" fetchPriority="high"/>
     {/* свет внутри стекла: маска из той же картинки, поэтому вспыхивает только сердце, а не фон */}
     <span className="hm-hero__light" aria-hidden="true" style={{maskImage:`url(${asset('/images/heart-glass-alpha.webp')})`,WebkitMaskImage:`url(${asset('/images/heart-glass-alpha.webp')})`}}/>
    </figure>
    <h1 id="home-title">Лист назначений для ваших пациентов</h1>
    <p className="hm-hero__act"><a className="hm-cta" href={href('/calculator')}>Открыть калькулятор<span aria-hidden="true">→</span></a></p>
   </section>

   <section className="hm-sec hm-wrap reveal" aria-labelledby="tiles-title">
    <div className="hm-head"><h2 id="tiles-title">Один ребёнок: 1450{'\u00a0'}г, вторые сутки</h2></div>
    <ul className="tiles">
     <li><h3>Основной раствор</h3><p className="fig"><CountUp value={n(r.base)} digits={1}/><small>мл</small></p></li>
     <li><h3>Глюкоза в растворе</h3><p className="fig"><CountUp value={n(r.glucosePercent)} digits={2}/><small>%</small></p></li>
     <li><h3>Аминокислоты</h3><p className="fig"><CountUp value={n(r.aaMl)}/><small>мл</small></p></li>
     <li><h3>Энергия</h3><p className="fig"><CountUp value={n(r.kr.perKg)}/><small>ккал/кг</small></p></li>
    </ul>
   </section>

   <section className="hm-sec hm-wrap reveal" aria-labelledby="sheet-title">
    <div className="hm-head"><h2 id="sheet-title">Лист, который читается с одного взгляда</h2></div>
    <div className="stage g">
     <img className="stage__sheet" src={asset('/images/nurse-sheet-front-p.webp')} width="1684" height="1191" alt="Лицевая сторона листа интенсивной терапии" loading="lazy"/>
     <figure className="stage__zoom g">
      <img src={asset('/images/sheet-zoom.webp')} width="1535" height="160" alt="Строки препаратов на листе: доза, что набрать, путь, кратность и стрелки времени введения" loading="lazy"/>
     </figure>
    </div>
   </section>

   <section className="hm-sec hm-wrap reveal" aria-labelledby="what-title">
    <div className="hm-head"><h2 id="what-title">Что внутри</h2></div>
    {/* крупный список: каждая строка — переход на свою страницу, при наведении загорается красным */}
    <ul className="index">
     <li><a href={href('/calculator')}><span>{drugs.length} препаратов</span><i aria-hidden="true">→</i></a></li>
     <li><a href={href('/calculator')}><span>{enteralFormulas.length} смесей и грудное молоко</span><i aria-hidden="true">→</i></a></li>
     <li><a href={examplePdf}><span>Лист назначений</span><i aria-hidden="true">→</i></a></li>
     <li><KartLink path="/login"><span>Отделение</span><i aria-hidden="true">→</i></KartLink></li>
    </ul>
   </section>

   <section className="hm-sec hm-wrap reveal hm-close" aria-label="Калькулятор">
    <a className="hm-big" href={href('/calculator')}>Открыть калькулятор<span aria-hidden="true">→</span></a>
    {telegramUrl&&<p className="hm-tg"><a className="hm-cta" href={telegramUrl} target="_blank" rel="noopener noreferrer">Наш Telegram-канал<span aria-hidden="true">↗</span></a></p>}
   </section>
  </main>

  <footer className="hm-foot"><div className="hm-wrap hm-foot__row">
   <a className="hm-brand" href={href('/')} aria-label="POSTNEO, главная"><BrandMark/><span>POSTNEO</span></a>
   <nav aria-label="Ссылки"><a href={href('/calculator')}>Калькулятор</a><KartLink path="/login">Отделение</KartLink><a href={examplePdf}>Пример листа</a>{telegramUrl&&<a href={telegramUrl} target="_blank" rel="noopener noreferrer">Telegram-канал</a>}</nav>
   <small>Сергей Нехорошкин, врач-неонатолог</small>
  </div></footer>
 </div>;
}
