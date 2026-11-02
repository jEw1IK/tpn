import './home.css';
import {drugs,enteralFormulas} from '@/lib/tpn';
import {BrandMark} from '@/components/brand-mark';
import {KartLink} from '@/components/kart-link';
import {CountUp} from '@/components/count-up';
import {href,asset,staticSite,telegramUrl} from '@/lib/links';
import {redirect} from 'next/navigation';

const examplePdf=asset('/examples/nurse-sheet-p.pdf');

/** Главная: чёрно-белое стекло. Время на лист назначений — оценка врачей отделения, где POSTNEO уже работает. */
export default function HomePage(){
 // На сервере корень приложения ведёт сразу к пациентам (а они — ко входу); главная живёт только в статическом сайте.
 if(!staticSite)redirect(process.env.KART_DISABLED==='1'?'/calculator':'/patients');
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
    {/* сцена: огромная надпись на заднем плане, стеклянное сердце стоит поверх и перекрывает часть букв; оба в одной ячейке сетки */}
    <div className="hm-hero__stage">
    {/* три строки во всю ширину; каждая выезжает снизу из-под своей кромки */}
    <p className="hm-motto"><span className="ml ml--a"><span>Здесь живёт</span></span> <span className="ml ml--b"><span>сердце</span></span> <span className="ml ml--c"><span>отделения</span></span></p>
    <figure className="hm-hero__fig">
     {/* тёмный силуэт под стеклом: закрывает буквы за сердцем, но не наглухо, сквозь стекло они чуть угадываются */}
     <span className="hm-hero__body" aria-hidden="true" style={{maskImage:`url(${asset('/images/heart-silhouette.webp')})`,WebkitMaskImage:`url(${asset('/images/heart-silhouette.webp')})`}}/>
     <img src={asset('/images/heart-glass-alpha.webp')} width="1024" height="1024" alt="Анатомическое сердце из прозрачного стекла" fetchPriority="high"/>
     {/* свет внутри стекла: маска из той же картинки, поэтому вспыхивает только сердце, а не фон */}
     <span className="hm-hero__light" aria-hidden="true" style={{maskImage:`url(${asset('/images/heart-glass-alpha.webp')})`,WebkitMaskImage:`url(${asset('/images/heart-glass-alpha.webp')})`}}/>
    </figure>
    </div>
    <h1 id="home-title">Лист назначений для ваших пациентов</h1>
    <p className="hm-hero__act"><a className="hm-cta" href={href('/calculator')}>Открыть калькулятор<span aria-hidden="true">→</span></a></p>
   </section>

   <section className="hm-sec hm-wrap reveal" aria-labelledby="time-title">
    <div className="hm-head"><h2 id="time-title">Один лист назначений</h2></div>
    <ul className="time">
     <li className="time__was"><h3>Вручную</h3><p className="time__fig"><CountUp className="cnt" value={15}/><span>–</span><CountUp className="cnt" value={20}/><small>минут</small></p></li>
     <li className="time__now"><h3>С POSTNEO</h3><p className="time__fig"><CountUp className="cnt" value={5}/><span>–</span><CountUp className="cnt" value={10}/><small>минут</small></p></li>
    </ul>
    <p className="time__where">Уже работает в ОРИТН ГКБ № 67</p>
   </section>

   <section className="hm-sec hm-wrap reveal" aria-labelledby="calc-title">
    <div className="hm-head"><h2 id="calc-title">Весь расчёт на одном экране</h2></div>
    {/* на компьютере весь первый экран калькулятора, на телефоне только панель итога: она вытянута по высоте экрана */}
    <a className="shot" href={href('/calculator')} aria-label="Открыть калькулятор">
     <picture>
      <source media="(max-width: 40rem)" srcSet={asset('/images/calc-dark-panel.webp')} width={728} height={1668}/>
      <img src={asset('/images/calc-dark.webp')} width="2160" height="1350" alt="Калькулятор POSTNEO в тёмной теме: пациент, потребность, электролиты и итог инфузии" loading="lazy"/>
     </picture>
    </a>
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
