/** Ссылки между главной и калькулятором. В статической сборке (сайт в подпапке /postneo/ и на Pages) пути относительные,
 *  иначе после гидратации React подставит абсолютные и клик уведёт на /calculator, которого на сервере нет. */
const staticSite=process.env.NEXT_PUBLIC_STATIC==='1';
const map:Record<string,string>={'/':'index.html','/calculator':'calculator.html'};
const base=process.env.NEXT_PUBLIC_BASE_PATH||'';
/** Обычные <a> не знают basePath сервера (/kart на демо): добавляем его сами. */
export const href=(path:string)=>staticSite?(map[path]??path.replace(/^\//,'')):base+path;
/** Картинки и файлы из public: в статике относительно страницы. */
export const asset=(path:string)=>staticSite?path.replace(/^\//,''):base+path;
export {staticSite};
