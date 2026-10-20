import test from 'node:test';
import assert from 'node:assert/strict';
import {biliBands,biliBandIndex,biliHourIndex,biliVerdict,anemiaVerdict,transfusionPerKg,biliRise} from '../lib/reference.ts';

test('таблица порогов: лестница ФТ < интенсивная < ОЗПК и рост с возрастом', () => {
 for(const band of biliBands){
  for(let i=0;i<6;i++)assert.ok(band.ft[i]<band.ift[i]&&band.ift[i]<band.ozpk[i],band.label+' колонка '+i);
  for(const key of ['ft','ift','ozpk'])for(let i=0;i<5;i++)assert.ok(band[key][i]<=band[key][i+1],band.label+' '+key);
 }
});

test('строка ≥ 35 нед совпадает с КР «Неонатальная желтуха» 2025, приложение А3.3', () => {
 const b=biliBands[biliBandIndex(38)];
 assert.equal(b.label,'≥ 35 нед');
 assert.deepEqual([...b.ft],[171,205,239,274,291,308]);
 assert.deepEqual([...b.ift],[188,274,308,342,376,376]);
 assert.deepEqual([...b.ozpk],[205,308,342,376,428,428]);
});

test('сутки жизни переводятся в колонку часов как в таблице жидкости', () => {
 assert.deepEqual([1,2,3,4,5,6,9].map(biliHourIndex),[0,1,2,3,4,5,5]);
 assert.equal(biliHourIndex(0),-1);assert.equal(biliHourIndex(null),-1);
 assert.equal(biliBandIndex(30),3);assert.equal(biliBandIndex(35),5);assert.equal(biliBandIndex(25.9),0);
});

test('вердикт: 30 нед, 3-и сутки — пороги 171 / 239 / 274', () => {
 const low=biliVerdict(30,3,100);
 assert.equal(low.level,'none');assert.equal(low.ft,171);assert.equal(low.ozpk,274);
 assert.equal(biliVerdict(30,3,200).level,'ft');
 assert.equal(biliVerdict(30,3,240).level,'ift');
 assert.equal(biliVerdict(30,3,280).level,'ozpk');
 assert.equal(biliVerdict(30,3,280).tone,'danger');
});

test('до ОЗПК меньше 50 — интенсивная ФТ даже ниже своей строки', () => {
 const v=biliVerdict(30,3,230);
 assert.equal(v.level,'ift');assert.match(v.title,/меньше 50/);
 assert.equal(biliVerdict(30,3,224).level,'ft');
});

test('почасовой прирост попадает в градации шпаргалки', () => {
 assert.equal(biliVerdict(38,2,200,150,6).rise.title,biliRise[2].title);assert.equal(biliVerdict(38,2,200,140,6).rise.title,biliRise[3].title);
 assert.equal(Math.round(biliVerdict(38,2,200,180,5).rise.rate*10)/10,4);
 assert.equal(biliVerdict(38,2,200,180,0).rise,null);
 assert.equal(biliVerdict(null,2,200),null);
});

test('анемия: таблица 3 КР по суткам, пробе и поддержке', () => {
 const a=anemiaVerdict(3,98,29,'cap',true);
 assert.equal(a.hb,115);assert.equal(a.ht,35);assert.equal(a.hit,true);
 const b=anemiaVerdict(3,98,29,'cap',false);
 assert.equal(b.hb,100);assert.equal(b.hit,true);
 const c=anemiaVerdict(10,95,null,'ven',false);
 assert.equal(c.hb,77);assert.equal(c.ht,null);assert.equal(c.hit,false);
 assert.equal(anemiaVerdict(20,70,null,'ven',true).hb,77);
 assert.equal(anemiaVerdict(1,90,null,'cap',true),null);
 assert.equal(anemiaVerdict(3,null,null,'cap',true).hit,null);
});

test('объём трансфузии по формуле КР', () => {
 assert.equal(transfusionPerKg(29,35,60,100),10);
 assert.equal(transfusionPerKg(40,35,60,100),0);
 assert.equal(transfusionPerKg(29,35,0,100),null);
});
