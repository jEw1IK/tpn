/** Ссылки между главной и калькулятором. В статической сборке (сайт в подпапке /postneo/ и на Pages) пути относительные,
 *  иначе после гидратации React подставит абсолютные и клик уведёт на /calculator, которого на сервере нет. */
const staticSite=process.env.NEXT_PUBLIC_STATIC==='1';
const map:Record<string,string>={'/':'index.html','/calculator':'calculator.html'};
export const href=(path:string)=>staticSite?(map[path]??path.replace(/^\//,'')):path;
/** Картинки и файлы из public: в статике относительно страницы. */
export const asset=(path:string)=>staticSite?path.replace(/^\//,''):path;
