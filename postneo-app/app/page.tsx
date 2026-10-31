import './home.css';
import {KartLink} from '@/components/kart-link';
import {SiteNav,SiteFoot} from '@/components/site-chrome';
import {href,asset,staticSite} from '@/lib/links';
import {redirect} from 'next/navigation';

/** Главная: вход для врачей отделения. Два экрана: что это и как войти. Рассказ о проекте живёт на /about. */
export default function HomePage(){
 // На сервере корень приложения ведёт сразу к пациентам (а они — ко входу); главная живёт только в статическом сайте.
 if(!staticSite)redirect(process.env.KART_DISABLED==='1'?'/calculator':'/patients');
 return <div className="home">
  <a className="skip" href="#home-main">К содержимому</a>
  <SiteNav current="home"/>
  <main id="home-main">
   <section className="hm-hero" aria-labelledby="home-title"><div className="hm-wrap hm-hero__in">
    <div className="hm-hero__text">
     <h1 id="home-title">Листы назначений отделения новорождённых.</h1>
     <p className="lead">Жидкость, глюкоза, белок и препараты по КР 2015: расчёт за минуту и печать на А4. Вход для врачей отделения.</p>
     <p className="hm-hero__act"><KartLink className="btn" path="/login">Войти в отделение</KartLink><a className="btn btn--quiet" href={href('/calculator')}>Калькулятор без входа</a></p>
    </div>
    <figure className="hm-paper hm-hero__fig">
     <div className="hm-paper__sheet"><img src={asset('/images/nurse-sheet-front-p.webp')} width="1123" height="794" alt="Лист интенсивной терапии: инфузии, лекарственные назначения и клетки 24 часов" fetchPriority="high"/></div>
     <figcaption>Лист интенсивной терапии, А4: инфузии, препараты, клетки на 24 часа. Оборот — кормления, КОС, диурез.</figcaption>
    </figure>
   </div></section>

   <section className="hm-access" aria-labelledby="access-title"><div className="hm-wrap">
    <h2 id="access-title">Как войти</h2>
    <div className="access">
     <div><h3>Есть логин и пароль</h3><p>Войдите один раз. Дальше отделение открывается сразу, пока вы не нажмёте «Выйти».</p><KartLink className="hm-link" path="/login">Вход</KartLink></div>
     <div><h3>Нужен доступ</h3><p>Напишите Сергею Нехорошкину: он пришлёт ссылку-приглашение. Логин и пароль вы придумываете сами, их никто не знает.</p></div>
     <div><h3>Без входа</h3><p>Калькулятор и печать листа работают без регистрации, с учебным ребёнком внутри.</p><a className="hm-link" href={href('/calculator')}>Открыть калькулятор</a></div>
    </div>
   </div></section>
  </main>
  <SiteFoot/>
 </div>;
}
