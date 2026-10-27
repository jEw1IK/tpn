import test from 'node:test';
import assert from 'node:assert/strict';
import {calculate,calculateProteinPlan,decimalInput,example} from '../lib/tpn.ts';

const near=(actual,expected,tolerance=1e-10)=>assert.ok(actual!==null&&Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
const input=patch=>({...example(),weight:'1000',fluid:'250',aa:'4',lowGlucose:'0',calciumMlPerKg:'0',medicines:[],...patch});
const ready=p=>{const r=calculate(p);assert.equal(r.valid,true,r.errors.join('; '));assert.equal(r.proteinPlan.valid,true);return r;};
// Белок и жидкость сходятся: цель = смесь + аминокислоты, а суточный объём — сумма линий.
const conserved=(p,r)=>{
 near(r.proteinPlan.enteralGrams+r.aaGrams,r.proteinPlan.achievedGrams);
 near(r.base+r.enteralMl+r.aaMl+r.fatMl+r.drugMl+r.other+r.flush,r.total);
 return {total:{proteinG:r.proteinPlan.achievedGrams,proteinPerKg:r.proteinPlan.achievedPerKg}};
};

test('Цель 4 г/кг/сут: белок смеси вычитается и остаток назначается аминокислотами',()=>{
 const p=input({formulaId:'nutrilon-pre-0',enteral:'50'}),before=structuredClone(p),r=ready(p),plan=r.proteinPlan;
 near(plan.targetGrams,4);near(plan.enteralGrams,1.3);near(plan.enteralPerKg,1.3);
 near(plan.requiredIvGrams,2.7);near(plan.requiredIvPerKg,2.7);near(r.aaGrams,2.7);near(r.aaMl,27);near(r.aaRate,27/24);
 near(plan.achievedGrams,4);near(plan.achievedPerKg,4);near(plan.excessGrams,0);conserved(p,r);assert.deepEqual(p,before);
});
test('Масса 1300 г: 104 мл Пре 0 дают 2.704 г, остаток 2.496 г = 1.92 г/кг',()=>{
 const p=input({weight:'1300',formulaId:'nutrilon-pre-0',enteral:'80'}),r=ready(p);
 // как в листе mytpn: белок смеси 2,704 → 2,7 г, остаток 5,2 − 2,7 = 2,5 г
 near(r.proteinPlan.targetGrams,5.2);near(r.proteinPlan.enteralGrams,2.7);near(r.proteinPlan.enteralPerKg,2.7/1.3);
 near(r.aaGrams,2.5);near(r.aaMl,25);near(r.proteinPlan.requiredIvPerKg,2.5/1.3);near(conserved(p,r).total.proteinPerKg,4);
});
test('Все три режима объёма дают одинаковый дефицит белка и объём аминокислот',()=>{
 const cases=[{enteral:'80'},{enteralMode:'daily',enteralVolume:'104'},{enteralMode:'feeds',feedingMl:'13',feedingCount:'8'}];
 const results=cases.map(patch=>ready(input({weight:'1300',formulaId:'nutrilon-pre-0',...patch})));
 for(const r of results){near(r.aaGrams,2.5);near(r.aaMl,25);near(r.proteinPlan.achievedPerKg,4);}
 assert.deepEqual(results[0].proteinPlan,results[1].proteinPlan);assert.deepEqual(results[1].proteinPlan,results[2].proteinPlan);
});
test('Смена смеси и объёма автоматически меняет только требуемый остаток аминокислот',()=>{
 const p=input({formulaId:'nutrilon-pre-0',enteralMode:'daily',enteralVolume:'100'}),pre=ready(p);
 const ha=ready({...p,formulaId:'nutrilon-ha-1'}),more=ready({...p,enteralVolume:'120'});
 near(pre.aaGrams,1.4);near(ha.aaGrams,2.5);near(more.aaGrams,.9);near(ha.enteralMl,pre.enteralMl);
 near(ha.base,pre.base-11);near(more.proteinPlan.achievedPerKg,4);near(ha.glucoseGrams,pre.glucoseGrams+1.1);near(ha.fatGrams,pre.fatGrams);near(pre.fatGrams,0);
});
test('Без энтерального питания вся цель идёт парентерально; исходный пример сохранён',()=>{
 const a=ready(input()),b=ready(input({weight:'1300'}));near(a.aaGrams,4);near(a.aaMl,40);near(b.aaGrams,5.2);near(b.aaMl,52);
 const original=calculate(example());assert.equal(original.valid,true);near(original.aaGrams,4.6);near(original.aaMl,46);near(original.base,92);
});
test('Точное покрытие энтерально даёт нулевое ПП без обязательных концентрации и времени',()=>{
 const p=input({formulaId:'nutrilon-pre-1',enteral:'200',gir:'3',aaPercent:'',aaHours:''}),r=ready(p),n=conserved(p,r);
 assert.equal(r.aaGrams,0);assert.equal(r.aaMl,0);assert.equal(r.aaRate,0);assert.equal(r.proteinPlan.requiredIvPerKg,0);
 assert.equal(r.proteinPlan.excessGrams,0);near(n.total.proteinPerKg,4);
});
test('Энтеральный избыток не увеличивает ПП и не меняет заданный объём кормления',()=>{
 const p=input({formulaId:'nutrilon-pre-0',enteral:'180',aaPercent:'',aaHours:''}),r=ready(p),n=conserved(p,r);
 assert.equal(r.aaMl,0);near(r.enteralMl,180);near(r.proteinPlan.excessGrams,.7);near(r.proteinPlan.excessPerKg,.7);
 near(r.proteinPlan.achievedPerKg,4.7);near(n.total.proteinPerKg,4.7);assert.equal(p.enteral,'180');
});
test('Неизвестная смесь, объём, кратность или масса не превращаются в нулевой энтеральный белок',()=>{
 for(const patch of [{enteral:'50',formulaId:'none'},{enteral:''},{enteralMode:'daily',enteralVolume:''},{formulaId:'nutrilon-pre-0',enteralMode:'feeds',feedingMl:'5',feedingCount:'0'},{weight:''}]){
  const r=calculate(input(patch));assert.equal(r.valid,false);assert.equal(r.proteinPlan.valid,false);assert.equal(r.aaGrams,null);assert.equal(r.base,null);assert.equal(r.proteinPlan.achievedPerKg,null);
 }
});
test('Общая цель допускает явный ноль, но не пустую, отрицательную или некорректную строку',()=>{
 for(const aa of ['', '-1','NaN','4 г']){const r=calculate(input({aa}));assert.equal(r.valid,false);assert.equal(r.aaGrams,null);assert.ok(r.issues.some(x=>x.field==='aa'));}
 const noProtein=ready(input({aa:'0',aaPercent:'',aaHours:''}));assert.equal(noProtein.aaGrams,0);assert.equal(noProtein.proteinPlan.achievedGrams,0);
 const en=ready(input({aa:'0',formulaId:'nutrilon-pre-1',enteral:'100',aaPercent:'',aaHours:''}));assert.equal(en.aaGrams,0);near(en.proteinPlan.excessGrams,2);
});
test('Положительный дефицит требует концентрацию и время аминокислот; нулевой дефицит их не требует',()=>{
 for(const patch of [{aaPercent:''},{aaPercent:'0'},{aaHours:''},{aaHours:'0'},{aaHours:'25'}]){
  const r=calculate(input(patch));assert.equal(r.valid,false);assert.equal(r.proteinPlan.valid,true);near(r.aaGrams,4);assert.equal(r.aaRate,null);
 }
});
test('Шаг 0,1 г: дефицит белка меньше 0,05 г не рождает аминокислоты, от 0,05 г округляется до 0,1 г',()=>{
 const goal=(.1/100*2.6),p=input({formulaId:'nutrilon-pre-0',enteral:'.1',trophicRule:'always',aa:decimalInput(goal),aaPercent:'',aaHours:''}),r=ready(p);
 assert.equal(r.aaGrams,0);assert.equal(r.proteinPlan.excessGrams,0);
 const small=ready({...p,aa:decimalInput(goal+0.04),aaPercent:'10',aaHours:'24'});assert.equal(small.aaGrams,0);
 const more=ready({...p,aa:decimalInput(goal+0.06),aaPercent:'10',aaHours:'24'});near(more.aaGrams,0.1);near(more.aaMl,1);
 const tiny=calculateProteinPlan(input({aa:decimalInput(Number.MIN_VALUE)}));assert.equal(tiny.valid,true);assert.equal(tiny.requiredIvGrams,0);
});
test('Переполнение и потеря положительного белка до нуля блокируют план вместо Infinity или подтверждённого нуля',()=>{
 const cases=[{weight:decimalInput(1e308),aa:decimalInput(1e308)},{weight:decimalInput(5e-321),aa:decimalInput(Number.MIN_VALUE)},
  {aa:'0.'+'0'.repeat(400)+'1'},
  {weight:'1',formulaId:'nutrilon-pre-0',enteral:decimalInput(Number.MIN_VALUE)}];
 for(const patch of cases){const p=input(patch),r=calculate(p);assert.equal(r.proteinPlan.valid,false,JSON.stringify(patch));assert.equal(r.aaGrams,null);assert.equal(r.base,null);assert.ok(r.proteinPlan.issues.length>0);}
});
test('Сохранение общей цели и жидкости при разных массах, смесях, объёмах и дополнительных источниках',()=>{
 for(let i=0;i<80;i++){
  const p=input({weight:String(600+i*17),formulaId:i%2?'nutrilon-ha-1':'nutrilon-pre-0',enteral:String(i%120),trophicRule:'always',other:'2'}),r=ready(p),n=conserved(p,r);
  // шаг 0,1 г: цель сходится в пределах половины шага
  near(n.total.proteinPerKg,4,0.05/r.kg+1e-9);near(r.proteinPlan.excessGrams,0,0.05+1e-9);near(r.aaGrams+r.proteinPlan.enteralGrams,r.kg*4,0.05+1e-9);
 }
});
