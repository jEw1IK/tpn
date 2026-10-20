import {directoryDrugs,directoryMixtures} from './directory-data.ts';

export type Group='antibiotic'|'antifungal'|'hormone'|'analeptic'|'other'|'blood'|'vasoactive'|'sedation';
export type DrugKind='intermittent'|'continuous'|'blood';
export type Drug={id:string;name:string;group:Group;unit:string;kind:DrugKind;hint:string;source?:string;sourceLabel?:string;percent?:number};

export const groupNames:Record<Group,string>={
 antibiotic:'Антибиотики',antifungal:'Противогрибковые и противовирусные',hormone:'Гормоны',analeptic:'Аналептики',
 other:'Другие',blood:'Препараты крови',vasoactive:'Кардиотоники и вазоактивные',sedation:'Наркотические и психотропные',
};
export const groupOrder:readonly Group[]=['antibiotic','antifungal','hormone','analeptic','other','blood','vasoactive','sedation'];

/** Our own entries keep their verified instruction hints; everything else follows the shared directory. */
const own:Record<string,Partial<Drug>>={
 ampsul:{hint:'В инструкции: новорождённые до 1 недели и недоношенные — 75 мг/кг/сут суммы компонентов 2:1 с интервалом 12 ч, то есть 37,5 мг/кг каждые 12 ч; дети старше — 150 мг/кг/сут в 3–4 введения, то есть 50 мг/кг каждые 8 ч. Применимость схемы оценивается отдельно.',source:'https://medi.ru/instrukciya/ampitsillin-sulbaktam_17686/',sourceLabel:'Инструкция Красфарма'},
 netil:{hint:'В инструкции для первой недели: 6 мг/кг/сут в два введения, то есть 3 мг/кг каждые 12 ч. Интервал зависит от функции почек и лекарственного мониторинга. Форма Нетилмицин Протекх 100 мг/мл содержит бензиловый спирт и противопоказана до 3 лет; проверяйте конкретную лекарственную форму.',source:'https://medi.ru/instrukciya/netilmitsin-protekh_21592/',sourceLabel:'Инструкция Нетилмицин Протекх'},
 epinephrine:{name:'Адреналин 0,1% (эпинефрин)'},
 norepinephrine:{name:'Норадреналин 0,2% (норэпинефрин)',hint:'Раствор 0,2 % = 2 мг/мл. Введите концентрацию в пересчёте на норэпинефрин-основание по маркировке выбранного препарата: содержание соли и основания не взаимозаменяемо. Шприц по умолчанию 12 мл, 0,5 мл/ч.'},
};
const sedation:Drug[]=[
 {id:'midazolam',name:'Мидазолам',group:'sedation',unit:'мг/кг/ч',kind:'continuous',hint:'Выберите периодическое или непрерывное введение. Доза и необходимость нагрузки задаются по выбранной врачом схеме.'},
 {id:'fentanyl',name:'Фентанил',group:'sedation',unit:'мкг/кг/ч',kind:'continuous',hint:'Выберите периодическое или непрерывное введение. Доза и необходимость нагрузки задаются по выбранной врачом схеме.'},
];
export const drugs:readonly Drug[]=[
 ...directoryDrugs.map(d=>({...d,...(own[d.id]??{})} as Drug)),
 ...sedation,
];
export const drugDirectorySource='Подсказка не выбирает дозу: сверяйте с действующей инструкцией к препарату.';

/** Dose units selectable for the «Другие» group, as in mytpn. Units with «/кг» are multiplied by the weight. */
export const doseUnits=['мг','мг/кг','мкг','мкг/кг','мл','мл/кг','гр','гр/кг','кап','кап/кг','саше','свеча','МЕ','МЕ/кг','дозы'] as const;
export const bolusUnits=['мг/кг','мкг/кг'] as const;

export const routes=['в/в','в/в (за 30 мин)','в/в (за 1 час)','в/в (за 2 часа)','в/в (за 3 часа)','в/в (за 4 часа)','в/в (за 5 часов)','в/в (за 6 часов)','в/в (за 12 часов)','в/в (за 24 часа)','в/в микроструйно','в/м','per os','подкожно','эндотрахеально','ректально','ингаляции','в 2 глаза'] as const;
export const bloodRoutes=['в/в','в/в (за 30 мин)','в/в (за 1 час)','в/в (за 2 часа)','в/в (за 3 часа)','в/в (за 4 часа)','в/в (за 5 часов)','в/в (за 6 часов)'] as const;
export const diluents=['Вода для инъекций','NaCl 0,9%','Глюкоза 5%'] as const;

/** Routes that deliver the prepared volume into the intravenous fluid balance. */
export function isIntravenousRoute(route:string):boolean{
 const value=route.trim().toLowerCase();
 return value==='внутривенно'||value.startsWith('в/в');
}
/** Administration time encoded in the route label, e.g. «в/в (за 30 мин)» → 30. Plain «в/в» has none. */
export function routeMinutes(route:string):number|null{
 const match=/\(за\s+(\d+(?:[.,]\d+)?)\s*(мин|час)/i.exec(route);
 if(!match)return null;
 const value=Number(match[1].replace(',','.'));
 return match[2].toLowerCase()==='мин'?value:value*60;
}
export const routeShort=(route:string)=>route.trim()==='Внутривенно'?'в/в':route.trim();

/** Conversion factors of the electrolyte solutions, mmol per ml (mytpn and КР РАСПМ 2015, Таблица 3). */
export const electrolyteDefaults={kclMmolPerMl:'0.56',nacl10MmolPerMl:'1.7',nacl09MmolPerMl:'0.15',calciumContent:'0.225'} as const;
export const carriers=['Вода для инъекций','Глюкоза 5%','Глюкоза 10%','NaCl 0,9%'] as const;
export const feedingRoutes=['Соска','Зонд','Соска или зонд','Зонд микроструйно'] as const;
/** Eight feedings every three hours from 09:00, as printed by mytpn. */
export const feedingHours=['09:00','12:00','15:00','18:00','21:00','00:00','03:00','06:00'] as const;

export {directoryMixtures};
