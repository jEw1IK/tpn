import {BrandMark} from '@/components/brand-mark';
import {KartLink} from '@/components/kart-link';
import {href,asset} from '@/lib/links';

export const examplePdf=asset('/examples/nurse-sheet-p.pdf');

/** Шапка главной и «О проекте»: знак, два раздела и вход. Одна и та же на обеих страницах. */
export function SiteNav({current}:{current:'home'|'about'}){
 return <header className="hm-nav"><div className="hm-wrap hm-nav__in">
  <a className="hm-brand" href={href('/')} aria-label="POSTNEO, главная"><BrandMark/><span>POSTNEO</span></a>
  <nav className="hm-nav__act" aria-label="Разделы">
   <a className="hm-link" href={href('/about')} aria-current={current==='about'?'page':undefined}>О проекте</a>
   <a className="hm-link" href={href('/calculator')}>Калькулятор</a>
   <KartLink className="btn btn--quiet" path="/login">Войти в отделение</KartLink>
  </nav>
 </div></header>;
}

export function SiteFoot(){
 return <footer className="hm-foot"><div className="hm-wrap">
  <p className="hm-foot__line">Расчёт питания и инфузий для отделения новорождённых, собранный неонатологами.</p>
  <div className="hm-foot__row">
   <a className="hm-brand" href={href('/')} aria-label="POSTNEO, главная"><BrandMark/><span>POSTNEO</span></a>
   <nav aria-label="Ссылки"><a href={href('/about')}>О проекте</a><a href={href('/calculator')}>Калькулятор</a><KartLink path="/login">Отделение</KartLink><a href={examplePdf}>Пример листа</a></nav>
   <small>Сергей Нехорошкин, врач-неонатолог</small>
  </div>
 </div></footer>;
}
