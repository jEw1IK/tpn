import test from 'node:test';
import assert from 'node:assert/strict';
import {calculate,calculateMedicine,example,newMedicine,newEnteralRow,drugs,enteralFormulas,emptyFeeds} from '../lib/tpn.ts';
import {groupOrder,routeMinutes,isIntravenousRoute,feedingHours} from '../lib/directory.ts';
const near=(actual,expected,tolerance=1e-6)=>assert.ok(actual!==null&&actual!==undefined&&Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);

/** Пациент из сводной проверки mytpn (probes/verify-core): 1300 г, 5-е сутки, ФП 150, GIR 6,5, белок 3, жиры 2, PreNAN Stage0 3 мл × 8. */
function patient(patch={}){
 const amp=newMedicine('antibiotic-ampicillin','amp');Object.assign(amp,{dose:'50',interval:'12',first:'08:00',route:'в/в',minutes:'30',diluent:'Вода для инъекций',volume:'2'});
 const net=newMedicine('netil','net');Object.assign(net,{dose:'3',interval:'12',first:'09:00',route:'в/в',minutes:'30',diluent:'NaCl 0,9%',volume:'2'});
 const vitd=newMedicine('other-vit-d','vitd');Object.assign(vitd,{unit:'МЕ',dose:'500',interval:'24',first:'10:00',route:'per os'});
 return {...example(),weight:'1300',day:'5',fluid:'150',gir:'6.5',aa:'3',fat:'2',fatPercent:'20',fatHours:'20',aaPercent:'10',aaHours:'24',aaPause:'on',calciumMlPerKg:'0',lowSolution:'glucose',lowGlucose:'5',highGlucose:'40',heparin:'0.5',
  trophicRule:'kr',drugFluid:'extra',enteralMode:'feeds8',formulaId:'prenan-stage0',feeds:['3','3','3','3','3','3','3','3'],feedingRoute:'Зонд',medicines:[amp,net,vitd],...patch};
}

test('mytpn, базовый пациент без ввода «жидкости вне инфузии»: глюкоза 143 мл 8,5 %, АК 39 мл, СМОФ 13 мл, гепарин 91 Ед, в/в 203, всего 227, 174,6 мл/кг',()=>{
 const r=calculate(patient());assert.equal(r.valid,true,r.errors.join('; '));
 near(r.total,195);near(r.enteralMl,24);near(r.enteralCountedMl,0);near(r.enteralTrophicMl,24);
 near(r.glucoseGrams,12.17);near(r.aaGrams,3.9);near(r.aaMl,39);near(r.fatGrams,2.6);near(r.fatMl,13);
 near(r.drugMl,8);near(r.base,143);near(r.mixVolume,143);near(r.glucosePercent,12.17*100/143);near(r.mainLinePercent,r.glucosePercent);
 near(r.lowMl+r.highMl,143);near(r.highMl*0.4+r.lowMl*0.05,12.17);
 near(r.baseRate,143/24);near(r.aaPauses,2);near(r.aaRate,39/22);near(r.fatRate,13/20);
 assert.equal(r.heparinUnits,91);near(r.ivTotal,203);near(r.allFluid,227);near(r.receivedPerKg,227/1.3);
 near(r.kr.glucoseKcal,48.68);near(r.kr.fatKcal,23.4);near(r.kr.parenteralKcal,72.08);near(r.kr.enteralKcal,0);near(r.kr.perKg,72.08/1.3);
 const vitd=r.medicines.find(m=>m.id==='vitd');assert.equal(vitd.valid,true);near(vitd.doseAmount,500);assert.equal(vitd.doseLabel,'МЕ');assert.equal(vitd.intravenous,false);near(vitd.fluidVolume,0);assert.deepEqual(vitd.times,[120]);
});
test('mytpn, растворители учтены в объёме (жидкость вне инфузии = 8): глюкоза 135 мл 9 %, гепарин 87 Ед, в/в 195',()=>{
 const r=calculate(patient({drugFluid:'included'}));assert.equal(r.valid,true,r.errors.join('; '));
 near(r.base,135);near(r.mixVolume,135);near(r.glucosePercent,12.17*100/135);assert.equal(r.heparinUnits,87);near(r.ivTotal,195);near(r.allFluid,219);near(r.receivedPerKg,219/1.3);
});
test('mytpn, электролиты и витамины: K 2, Na 10 % 3, Na 0,9 % 1 ммоль/кг, Ca 1 мл/кг, Mg 0,2, Солувит 1, Виталипид 4, Аддамель 1, Дипептивен 1',()=>{
 const r=calculate(patient({drugFluid:'included',kcl:'2',nacl10:'3',nacl09:'1',calciumMlPerKg:'1',calciumContent:'0.225',magnesium:'0.2',soluvit:'1',vitalipid:'4',addamel:'1',dipeptiven:'1'}));
 assert.equal(r.valid,true,r.errors.join('; '));
 const e=r.electrolytes;near(e.kclMl,2.6/0.56);near(e.nacl10Ml,3.9/1.7);near(e.nacl09Ml,1.3/0.15);near(e.caMl,1.3);near(e.mgMl,0.26);near(e.soluvitMl,1.3);near(e.dipeptivenMl,1.3);near(e.addamelMl,1);near(r.vitalipidMl,5.2);
 near(r.fatLineMl,18.2);near(r.fatRate,18.2/20);near(r.base,195-39-18.2-8);near(r.mixVolume,129.8-e.sumMl);near(r.mixVolume,109.04,0.01);
 near(r.glucosePercent,12.17*100/r.mixVolume);assert.ok(Math.abs(r.glucosePercent-11.2)<0.1);near(r.baseRate,129.8/24);assert.equal(r.heparinUnits,84);
 const h=calculate(patient({drugFluid:'included',kcl:'2',nacl10:'3',nacl09:'1',calciumMlPerKg:'1',calciumContent:'0.225',magnesium:'0.2',soluvit:'1',vitalipid:'4',addamel:'1',dipeptiven:'1',heparin:'1'}));assert.equal(h.heparinUnits,169);
});
test('mytpn, проводниковый раствор и инсулин: 10 мл сверх объёма входят в скорость и гепарин; инсулин даёт Ед/сут и 12 мл',()=>{
 const base=patient({drugFluid:'included',kcl:'2',nacl10:'3',nacl09:'1',calciumMlPerKg:'1',calciumContent:'0.225',magnesium:'0.2',soluvit:'1',vitalipid:'4',addamel:'1',dipeptiven:'1',heparin:'1'});
 const c=calculate({...base,carrier:'Глюкоза 5%',carrierMl:'10'});assert.equal(c.valid,true,c.errors.join('; '));
 near(c.base,139.8);near(c.mixVolume,109.04,0.01);near(c.baseRate,139.8/24);assert.equal(c.heparinUnits,179);near(c.ivTotal,205);
 const i=calculate({...base,insulin:'0.05'});assert.equal(i.valid,true);near(i.insulinUnits,0.05*1.3*24);near(i.insulinMl,12);near(i.drugMl,20);near(i.ivTotal,195);near(i.base,129.8-12);
 const x=calculate({...base,insulin:'0.05',drugFluid:'extra'});near(x.ivTotal,215);near(x.base,129.8+8);
});
test('mytpn, кардиотоник: Дофамин 4 % 5 мкг/кг/мин в 12 мл на 0,5 мл/ч = 0,234 мл раствора, 12 мл в сутки',()=>{
 const d=newMedicine('dopamine','dop');d.dose='5';
 const r=calculateMedicine(d,1.3,'08:00');assert.equal(r.valid,true,r.errors.join('; '));
 near(r.amountMg,9.36);near(r.stockMl,0.234);near(r.solventMl,12-0.234);near(r.volume,12);near(r.fluidVolume,12);near(r.rate,0.5);
 assert.equal(newMedicine('epinephrine','e').stock,'1');assert.equal(newMedicine('dopamine-05','d').stock,'5');
});
test('mytpn, препараты крови: 15 мл/кг эритроцитарной взвеси за 3 часа = 19,5 мл, 6,5 мл/ч, вне баланса жидкости',()=>{
 const b=newMedicine('blood-eritrocitarnaya-vzves-o-i-rh','rbc');Object.assign(b,{dose:'15',first:'12:00',route:'в/в (за 3 часа)'});
 const r=calculateMedicine(b,1.3,'08:00');assert.equal(r.valid,true,r.errors.join('; '));
 near(r.volume,19.5);near(r.doseAmount,19.5);assert.equal(r.doseLabel,'мл');near(r.rate,6.5);near(r.fluidVolume,0);assert.deepEqual(r.times,[240]);
 const total=calculate(patient({medicines:[b]}));assert.equal(total.valid,true);near(total.drugMl,0);
});
test('Пути введения: длительность читается из подписи, неинъекционные пути не входят в жидкость',()=>{
 assert.equal(routeMinutes('в/в (за 30 мин)'),30);assert.equal(routeMinutes('в/в (за 2 часа)'),120);assert.equal(routeMinutes('в/в'),null);assert.equal(routeMinutes('per os'),null);
 assert.equal(isIntravenousRoute('в/в микроструйно'),true);assert.equal(isIntravenousRoute('Внутривенно'),true);assert.equal(isIntravenousRoute('в/м'),false);
 const m=newMedicine('antibiotic-ampicillin','a');Object.assign(m,{dose:'50',interval:'12',first:'08:00',route:'в/в (за 1 час)',diluent:'Вода для инъекций',volume:'2'});
 const r=calculateMedicine(m,1.3,'08:00');assert.equal(r.valid,true,r.errors.join('; '));near(r.minutes,60);near(r.doseMg,65);near(r.volume,4);near(r.rate,2);
 const im=calculateMedicine({...m,route:'в/м',volume:''},1.3,'08:00');assert.equal(im.valid,true,im.errors.join('; '));near(im.fluidVolume,0);near(im.doseMg,65);
});
test('«Другие»: единицы с «/кг» умножаются на вес сегодня, без «/кг» — как введено; доза в мг известна только для мг/мкг/гр',()=>{
 const p=newMedicine('other-paracetamol','par');Object.assign(p,{unit:'мг/кг',dose:'10',interval:'8',first:'08:00',route:'per os'});
 const r=calculateMedicine(p,1.3,'08:00');assert.equal(r.valid,true,r.errors.join('; '));near(r.doseMg,13);near(r.doseAmount,13);assert.equal(r.doseLabel,'мг');assert.deepEqual(r.times,[0,480,960]);
 const drops=calculateMedicine({...p,unit:'кап',dose:'2'},1.3,'08:00');assert.equal(drops.valid,true);near(drops.doseAmount,2);assert.equal(drops.doseMg,null);assert.equal(drops.doseLabel,'кап');
 const mcg=calculateMedicine({...p,unit:'мкг/кг',dose:'500',route:'в/в',minutes:'30',volume:'1'},1.3,'08:00');near(mcg.doseMg,0.65);near(mcg.fluidVolume,3);
 const bad=calculateMedicine({...p,unit:'дозы/кг'},1.3,'08:00');assert.equal(bad.valid,false);
});
test('Вес сегодня для доз и «получит», вес для счёта — для питания',()=>{
 const r=calculate(patient({weightToday:'1200',weightYesterday:'1250',birthWeight:'1400'}));assert.equal(r.valid,true,r.errors.join('; '));
 near(r.kg,1.3);near(r.kgToday,1.2);near(r.medicines[0].doseMg,60);near(r.aaGrams,3.9);near(r.receivedPerKg,227/1.2);
 near(r.dynamics.dayGrams,-50);near(r.dynamics.dayPercent,-4);near(r.dynamics.birthPercent,-100*200/1400);assert.ok(r.warnings.some(w=>w.includes('за сутки')));
});
test('Справочник: 81 позиция mytpn плюс седация, все группы, у каждой записи подсказка и единица',()=>{
 assert.equal(drugs.length,157);assert.equal(new Set(drugs.map(d=>d.id)).size,drugs.length);
 for(const g of groupOrder)assert.ok(drugs.some(d=>d.group===g),g);
 for(const d of drugs){assert.ok(d.unit,d.id);assert.equal(typeof d.hint,'string');const m=newMedicine(d.id,'x');assert.equal(m.group,d.group);}
 assert.equal(enteralFormulas.length,14);assert.deepEqual(feedingHours.length,8);
 assert.throws(()=>newMedicine('nope','x'),RangeError);
});
test('Восемь кормлений и дополнительные строки смесей складываются; порог 25 мл/кг считается по сумме',()=>{
 const row=newEnteralRow('milk');row.formulaId='grudnoe-moloko';row.feeds=['2','2','2','2','','','',''];
 const r=calculate(patient({extraFeeds:[row]}));assert.equal(r.valid,true,r.errors.join('; '));
 near(r.enteralMl,32);near(r.enteralNutrition.volumePerKg,32/1.3);assert.equal(r.enteralNutrition.counted,false);
 near(r.enteralNutrition.daily.proteinG,24*2.88/100+8*1.05/100);
 const big=calculate(patient({feeds:['5','5','5','5','5','5','5','5'],extraFeeds:[row]}));near(big.enteralMl,48);assert.equal(big.enteralNutrition.counted,true);near(big.enteralCountedMl,48);
 near(big.aaGrams,3.9-1.2);// белок смеси 1,236 → 1,2 г
 const broken=calculate(patient({feeds:['3','x','','','','','','']}));assert.equal(broken.valid,false);assert.ok(broken.issues.some(i=>i.field==='feeds'));
 const noFormula=newEnteralRow('nf');noFormula.feeds=['1','','','','','','',''];assert.equal(calculate(patient({extraFeeds:[noFormula]})).valid,false);
 assert.deepEqual(emptyFeeds(),['','','','','','','','']);
});
test('Меньший раствор без глюкозы: вода или NaCl 0,9 % считаются как 0 %, не как 0,9 %',()=>{
 const w=calculate(patient({lowSolution:'water',lowGlucose:'77'})),n=calculate(patient({lowSolution:'nacl'}));
 assert.equal(w.valid,true);near(w.lowPercent,0);near(w.highMl,12.17*100/40);near(w.lowMl,143-w.highMl);near(n.highMl,w.highMl);
});
test('Глюкоза выше 12,5 % предупреждает; когда не умещается даже 40 % — линия растёт сверх потребности с предупреждением',()=>{
 const warn=calculate(patient({gir:'10'}));assert.equal(warn.valid,true);assert.ok(warn.warnings.some(w=>w.includes('12,5')));
 const big=calculate(patient({gir:'32'}));assert.equal(big.valid,true);assert.ok(big.glucosePercent<=40+1e-9);assert.ok(big.overshootMl>0);assert.ok(big.warnings.some(w=>w.includes('не умещаются')));
});

test('mytpn, второй пациент 2400 г/2 сут с учтённым кормлением 80 мл: все ячейки совпадают в пределах округления, гепарин 75 Ед',()=>{
 // Наблюдение 17.10.2026 (probes/verify-2): PreNAN Stage0 10 мл × 8, KCl 1 ммоль/кг, Ca глюконат 1 мл/кг, цефотаксим 50 мг/кг каждые 8 ч в 3 мл, жидкость вне инфузии 9 мл.
 const cef=newMedicine('antibiotic-cefotaksim','cef');Object.assign(cef,{dose:'50',interval:'8',first:'08:00',route:'в/в (за 30 мин)',diluent:'Вода для инъекций',volume:'3'});
 const r=calculate({...example(),weight:'2400',weightYesterday:'2500',day:'2',fluid:'100',gir:'5',aa:'2.5',fat:'1.5',fatPercent:'20',fatHours:'20',aaPercent:'10',aaHours:'24',aaPause:'on',calciumMlPerKg:'1',calciumContent:'0.225',kcl:'1',lowSolution:'glucose',lowGlucose:'5',highGlucose:'20',heparin:'0.5',trophicRule:'kr',drugFluid:'included',enteralMode:'feeds8',formulaId:'prenan-stage0',feeds:Array(8).fill('10'),medicines:[cef]});
 assert.equal(r.valid,true,r.errors.join('; '));
 const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<=0.06,`${actual} != ${expected}`);
 close(r.enteralMl,80);assert.equal(r.enteralNutrition.counted,true);close(r.glucoseGrams,10.78);close(r.aaGrams,3.7);close(r.fatGrams,0.4);close(r.aaMl,37);close(r.fatMl,2);
 close(r.mixVolume,105.3);close(r.glucosePercent,10.2);close(r.base,112);close(r.electrolytes.kclMl,4.3);close(r.caMl,2.4);assert.equal(r.heparinUnits,75);
 close(r.baseRate,4.7);close(r.fatRate,0.1);close(r.ivTotal,160);close(r.allFluid,240);close(r.receivedPerKg,100);close(r.kr.enteralKcal,64);close(r.kr.parenteralKcal,46.7);close(r.kr.perKg,46.1);
 close(r.aaPauses,1.5);close(r.aaRate,37/22.5);close(r.medicines[0].doseMg,120);assert.deepEqual(r.medicines[0].times,[0,480,960]);close(r.drugMl,9);
});
