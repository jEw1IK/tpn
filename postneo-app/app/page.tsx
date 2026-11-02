import './home.css';
import {calculate,blank,drugs,enteralFormulas,type Inputs} from '@/lib/tpn';
import {formatNumber as f} from '@/lib/format';
import {BrandMark} from '@/components/brand-mark';
import {KartLink} from '@/components/kart-link';
import {CountUp} from '@/components/count-up';
import {href,asset,staticSite} from '@/lib/links';
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
 const groups=new Set(drugs.map(d=>d.group)).size;
 return <div className="home">
  <header className="hm-nav"><div className="hm-wrap hm-nav__in">
   <a className="hm-brand" href={href('/')} aria-label="POSTNEO, главная"><BrandMark/><span>POSTNEO</span></a>
   <nav className="hm-nav__act" aria-label="Разделы">
    <a className="hm-link" href={href('/calculator')}>Калькулятор</a>
    <a className="hm-link" href={examplePdf}>Пример листа</a>
    <KartLink className="btn" path="/login">Войти в отделение</KartLink>
   </nav>
  </div></header>

  <main>
   <section className="hm-hero hm-wrap" aria-labelledby="home-title">
    <figure className="hm-hero__fig"><img src={asset('/images/heart-glass.webp')} width="1024" height="1024" alt="Анатомическое сердце из прозрачного стекла" fetchPriority="high"/></figure>
    <h1 id="home-title">Лист назначений для ваших пациентов</h1>
    <p className="lead">Жидкость, глюкоза, белок, жиры и препараты по клиническим рекомендациям. Готовый лист на А4 за минуту.</p>
    <p className="hm-hero__act"><a className="hm-cta" href={href('/calculator')}>Открыть калькулятор<span aria-hidden="true">→</span></a></p>
   </section>

   <section className="hm-sec hm-wrap reveal" aria-labelledby="tiles-title">
    <div className="hm-head"><h2 id="tiles-title">Один ребёнок: 1450{'\u00a0'}г, вторые сутки</h2><p>110 мл/кг, глюкоза 5 мг/кг/мин, белок 2 и жиры 1,5 г/кг, грудное молоко по 5 мл восемь раз. Так это считает движок.</p></div>
    <ul className="tiles">
     <li className="g"><h3>Основной раствор</h3><p className="fig"><CountUp value={n(r.base)} digits={1}/><small>мл · {f(r.baseRate,1)} мл/ч</small></p><p>{Math.round(n(r.base)/n(r.allFluid)*100)} % суточной жидкости</p></li>
     <li className="g"><h3>Глюкоза в растворе</h3><p className="fig"><CountUp value={n(r.glucosePercent)} digits={2}/><small>%</small></p><p>{f(r.glucoseGrams,2)} г внутривенно, {f(r.girIv,1)} из 5 мг/кг/мин</p></li>
     <li className="g"><h3>Аминокислоты</h3><p className="fig"><CountUp value={n(r.aaMl)}/><small>мл · {f(r.aaRate,2)} мл/ч</small></p><p>{f(r.aaGrams,1)} г белка за сутки</p></li>
     <li className="g"><h3>Энергия</h3><p className="fig"><CountUp value={n(r.kr.perKg)}/><small>ккал/кг</small></p><p>{f(r.kr.parenteralKcal,0)} парентерально, {f(r.kr.enteralKcal,0)} энтерально</p></li>
    </ul>
   </section>

   <section className="hm-sec hm-wrap reveal" aria-labelledby="sheet-title">
    <div className="hm-head"><h2 id="sheet-title">Лист А4 с двух сторон</h2><p>Лицевая сторона — для медсестры: что набрать, в мл и крупно, время введения стрелками. Оборот — кормления, КОС, респираторная поддержка, диурез.</p></div>
    <div className="sheets">
     <figure className="sheet g"><div><img src={asset('/images/nurse-sheet-front-p.webp')} width="1123" height="794" alt="Лицевая сторона листа интенсивной терапии" loading="lazy"/></div><figcaption>Инфузии, препараты, клетки 24 часов</figcaption></figure>
     <figure className="sheet g"><div><img src={asset('/images/nurse-sheet-back-p.webp')} width="1123" height="794" alt="Оборот листа" loading="lazy"/></div><figcaption>Кормления, КОС, респираторная поддержка, диурез, заметки</figcaption></figure>
    </div>
   </section>

   <section className="hm-sec hm-wrap reveal" aria-labelledby="what-title">
    <div className="hm-head"><h2 id="what-title">Что внутри</h2></div>
    <div className="cols g">
     <div><h3>{drugs.length} препаратов</h3><p>{groups} групп с концентрациями форм: доза, разведение и объём считаются сами и входят в баланс. Нагрузочные дозы, титрование кардиотоников, интервалы больше суток.</p></div>
     <div><h3>{enteralFormulas.length} смесей и грудное молоко</h3><p>Две смеси по своим кормлениям. С определённого объёма белки, жиры и углеводы смеси вычитаются из внутривенной части.</p></div>
     <div><h3>Отделение</h3><p>Пациенты, листы по дням и подписи, общие для врачей отделения. Карточки и листы хранятся на сервере в зашифрованном виде.</p></div>
    </div>
   </section>

   <section className="hm-sec hm-wrap reveal" aria-labelledby="close-title">
    <div className="hm-close g">
     <h2 id="close-title">Пример уже внутри</h2>
     <p>Открывается без регистрации, с учебным ребёнком. Проверьте цифры или очистите форму и посчитайте своего пациента.</p>
     <p className="hm-hero__act"><a className="btn btn--solid" href={href('/calculator')}>Открыть калькулятор</a><a className="btn" href={examplePdf}>Пример листа в PDF</a></p>
    </div>
   </section>
  </main>

  <footer className="hm-foot"><div className="hm-wrap hm-foot__row">
   <a className="hm-brand" href={href('/')} aria-label="POSTNEO, главная"><BrandMark/><span>POSTNEO</span></a>
   <nav aria-label="Ссылки"><a href={href('/calculator')}>Калькулятор</a><KartLink path="/login">Отделение</KartLink><a href={examplePdf}>Пример листа</a></nav>
   <small>Сергей Нехорошкин, врач-неонатолог</small>
  </div></footer>
 </div>;
}
