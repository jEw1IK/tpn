import test from 'node:test';
import assert from 'node:assert/strict';
import {calculate,calculateEnteral,changeEnteralMode,enteralFormulas,example,blank} from '../lib/tpn.ts';
const near=(actual,expected)=>assert.ok(actual!==null&&Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);
const p=()=>({...example(),formulaId:'nutrilon-pre-0'});

test('Справочник: значения маркировки на 100 мл готовой смеси, включая 65 ккал у ГА 1',()=>{
 assert.deepEqual(enteralFormulas.slice(0,4).map(f=>[f.id,f.per100ml.energyKcal,f.per100ml.proteinG,f.per100ml.carbohydrateG,f.per100ml.fatG]),[
  ['nutrilon-pre-0',79,2.6,8.3,3.8],['nutrilon-pre-1',74,2,7.4,3.9],['nutrilon-pepti-gastro',66,1.8,7,3.4],['nutrilon-ha-1',65,1.5,7.2,3.4]
 ]);
});
test('Пре 0: 150 мл/кг/сут при 1300 г = 195 мл, 154.05 ккал и 5.07 г белка',()=>{
 const r=calculateEnteral({...p(),enteral:'150'});
 assert.equal(r.valid,true);near(r.volumeMl,195);near(r.daily.energyKcal,154.05);near(r.daily.proteinG,5.07);near(r.daily.carbohydrateG,16.185);near(r.daily.fatG,7.41);
 near(r.perKg.energyKcal,118.5);near(r.perKg.proteinG,3.9);near(r.perKg.carbohydrateG,12.45);near(r.perKg.fatG,5.7);
});
test('Три способа ввода дают одинаковое поступление: 80 мл/кг, 104 мл, 13 мл × 8',()=>{
 const byKg=calculateEnteral({...p(),enteral:'80'}),byDay=calculateEnteral({...p(),enteralMode:'daily',enteralVolume:'104'}),byFeeds=calculateEnteral({...p(),enteralMode:'feeds',feedingMl:'13',feedingCount:'8'});
 assert.deepEqual(byKg.daily,byDay.daily);assert.deepEqual(byDay.daily,byFeeds.daily);near(byFeeds.volumePerKg,80);
});
test('Смена смеси при 100 мл сохраняет жидкость, но меняет поступление нутриентов',()=>{
 const a=calculateEnteral({...p(),enteralMode:'daily',enteralVolume:'100'}),b=calculateEnteral({...p(),formulaId:'nutrilon-ha-1',enteralMode:'daily',enteralVolume:'100'});
 near(a.volumeMl,b.volumeMl);near(a.daily.energyKcal,79);near(b.daily.energyKcal,65);near(b.daily.proteinG,1.5);near(b.daily.carbohydrateG,7.2);
});
test('Без выбранной смеси известный объём сохраняется, нутриенты не выдумываются',()=>{
 const r=calculateEnteral({...p(),formulaId:'none',enteral:'100'});
 assert.equal(r.valid,false);near(r.volumeMl,130);assert.equal(r.daily,null);assert.equal(r.perKg,null);
});
test('Нулевое питание даёт нули без обязательного выбора смеси',()=>{
 const r=calculateEnteral(example());assert.equal(r.valid,true);near(r.daily.proteinG,0);near(r.perKg.energyKcal,0);
});
test('Пустая масса не подставляет 1 кг: известен только суточный объём',()=>{
 const r=calculateEnteral({...p(),weight:'',enteralMode:'daily',enteralVolume:'100'});
 assert.equal(r.valid,false);near(r.daily.energyKcal,79);assert.equal(r.perKg,null);assert.equal(r.volumePerKg,null);
 assert.equal(calculateEnteral(blank()).daily,null);
});
test('Пустой/отрицательный объём и дробная кратность блокируют расчёт',()=>{
 for(const enteral of ['', '-5','abc']){const r=calculateEnteral({...p(),enteral});assert.equal(r.valid,false);assert.equal(r.daily,null);}
 for(const feedingCount of ['0','2.5','49','']){const r=calculateEnteral({...p(),enteralMode:'feeds',feedingMl:'10',feedingCount});assert.equal(r.valid,false);assert.equal(r.daily,null);}
});
test('Запятые и очень малая масса рассчитываются без преждевременного округления',()=>{
 const r=calculateEnteral({...p(),weight:'468',enteralMode:'feeds',feedingMl:'1,5',feedingCount:'8'});
 assert.equal(r.valid,true);near(r.volumeMl,12);near(r.daily.proteinG,.312);near(r.perKg.proteinG,2/3);
});
test('Изменение массы сохраняет суточные нутриенты в режиме мл/сут и меняет значения на кг',()=>{
 const a=calculateEnteral({...p(),weight:'1000',enteralMode:'daily',enteralVolume:'100'}),b=calculateEnteral({...p(),weight:'2000',enteralMode:'daily',enteralVolume:'100'});
 assert.deepEqual(a.daily,b.daily);near(b.perKg.proteinG,1.3);
});
test('Трофическое питание (8 мл = 6,2 мл/кг) идёт сверх объёма и не меняет парентеральные дозы',()=>{
 const a=calculate(example()),b=calculate({...p(),enteralMode:'feeds',feedingMl:'1',feedingCount:'8'});
 assert.equal(b.valid,true);near(b.enteralMl,8);assert.equal(b.enteralNutrition.counted,false);near(b.enteralCountedMl,0);near(b.enteralTrophicMl,8);
 near(b.base,a.base);near(b.aaGrams,a.aaGrams);near(b.glucoseGrams,a.glucoseGrams);near(b.fatGrams,a.fatGrams);
 near(b.ivTotal,a.ivTotal);near(b.allFluid,b.total+8);near(b.receivedPerKg,(156+8)/1.3);
 const c=calculate({...p(),enteralMode:'feeds',feedingMl:'1',feedingCount:'8',trophicRule:'always'});
 near(c.base,a.base-8+2.08+0.304*5);near(c.aaGrams,a.aaGrams-.208);near(c.fatGrams,a.fatGrams-.304);near(c.glucoseGrams,a.glucoseGrams-.664);
});
test('Энтеральное питание от 25 мл/кг вычитается один раз; белок, жиры и углеводы смеси снижают в/в дозы',()=>{
 const a=calculate(example()),b=calculate({...p(),enteralMode:'feeds',feedingMl:'5',feedingCount:'8',lowGlucose:'0'});
 assert.equal(b.valid,true);near(b.enteralMl,40);assert.equal(b.enteralNutrition.counted,true);near(b.enteralCountedMl,40);near(b.enteralTrophicMl,0);
 near(b.aaGrams,a.aaGrams-1.04);near(b.fatGrams,a.fatGrams-1.52);near(b.glucoseGrams,a.glucoseGrams-3.32);
 near(b.base,a.base-40+10.4+7.6);near(b.base+b.enteralCountedMl+b.aaMl+b.fatMl+b.drugMl,b.total);near(b.allFluid,b.total);
 const edge=calculate({...p(),enteralMode:'daily',enteralVolume:'32.5',lowGlucose:'0'}),below=calculate({...p(),enteralMode:'daily',enteralVolume:'32.49',lowGlucose:'0'});
 assert.equal(edge.enteralNutrition.counted,true);assert.equal(below.enteralNutrition.counted,false);
});
test('Энтеральный анализ работает независимо от незаполненного парентерального расчёта',()=>{
 const r=calculate({...blank(),weight:'1000',formulaId:'nutrilon-pepti-gastro',enteral:'150'});
 assert.equal(r.valid,false);assert.equal(r.enteralNutrition.valid,true);near(r.enteralNutrition.perKg.proteinG,2.7);near(r.enteralNutrition.perKg.energyKcal,99);
});
test('Переполнение и неизвестный режим не дают правдоподобный результат',()=>{
 const huge='9'.repeat(308);
 for(const input of [{...p(),weight:huge,enteral:huge},{...p(),enteralMode:'feeds',feedingMl:huge,feedingCount:'8'},{...p(),enteralMode:'invalid'}]){const r=calculateEnteral(input);assert.equal(r.valid,false);assert.equal(r.daily,null);}
});

test('Смена режима сохраняет объём, включая отсутствие выбранной смеси',()=>{
 let input={...example(),enteral:'10'};
 for(const mode of ['daily','feeds','perKg']){
  const next=changeEnteralMode(input,mode);assert.equal(next.error,'');assert.ok(next.patch);
  input={...input,...next.patch};near(calculateEnteral(input).volumeMl,13);
 }
});
test('Пустой или ошибочный активный объём не возвращает старое значение другого режима',()=>{
 for(const mode of ['perKg','daily','feeds'])for(const raw of ['', '-5','abc']){
  const field=mode==='perKg'?'enteral':mode==='daily'?'enteralVolume':'feedingMl';
  const input={...p(),enteralMode:mode,enteral:'10',enteralVolume:'8',feedingMl:'1',[field]:raw};
  const snapshot=structuredClone(input);const next=changeEnteralMode(input,mode==='daily'?'perKg':'daily');
  assert.equal(next.patch,null);assert.ok(next.error);assert.deepEqual(input,snapshot);
 }
});
test('Ошибочная кратность кормлений не заменяется молча восемью',()=>{
 for(const feedingCount of ['','3.5','-1','49'])for(const feedingMl of ['0','10']){
  const next=changeEnteralMode({...p(),enteralMode:'feeds',feedingMl,feedingCount,enteralVolume:'8'},'daily');
  assert.equal(next.patch,null);assert.match(next.error,/кормлений/);
 }
});
test('Ненулевое питание без массы переносится между мл/сут и кормлениями, но не на килограмм',()=>{
 const input={...p(),weight:'',enteralMode:'daily',enteralVolume:'16'};
 assert.equal(changeEnteralMode(input,'perKg').patch,null);
 const byFeeds=changeEnteralMode(input,'feeds');assert.equal(byFeeds.error,'');assert.equal(byFeeds.patch.feedingMl,'2');
 const byDay=changeEnteralMode({...input,...byFeeds.patch},'daily');assert.equal(byDay.patch.enteralVolume,'16');
 assert.equal(changeEnteralMode({...input,enteralMode:'perKg',enteral:'10'},'daily').patch,null);
});
test('Явный ноль без массы переносится во все поля, не оживляя старый объём',()=>{
 let input={...p(),weight:'',enteral:'0',enteralVolume:'10',feedingMl:'2'};
 for(const mode of ['daily','feeds','perKg']){
  const next=changeEnteralMode(input,mode);assert.equal(next.error,'');input={...input,...next.patch};
  for(const field of ['enteral','enteralVolume','feedingMl'])assert.equal(input[field],'0');
 }
});
test('Малый производный объём остаётся десятичной строкой, которую принимает калькулятор',()=>{
 let input={...p(),enteral:'0.0000001'};
 for(const mode of ['daily','feeds','perKg']){
  const next=changeEnteralMode(input,mode);assert.equal(next.error,'');input={...input,...next.patch};
  for(const field of ['enteral','enteralVolume','feedingMl'])assert.doesNotMatch(input[field],/[eE]/);
  const result=calculateEnteral(input);assert.equal(result.valid,true);
  assert.ok(Math.abs(result.volumeMl-1.3e-7)<1e-20);
 }
});
test('Переполнение и потеря ненулевого объёма при пересчёте сохраняют текущий режим',()=>{
 assert.equal(changeEnteralMode({...p(),weight:'9'.repeat(308),enteral:'9'.repeat(308)},'daily').patch,null);
 const tiny='0.'+'0'.repeat(323)+'5';
 assert.equal(changeEnteralMode({...p(),weight:'1',enteral:tiny},'daily').patch,null);
});
