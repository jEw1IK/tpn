// Пациенты списком: вставка текста из МИС, дубликат, обязательные поля, шифрованное сохранение.
const {chromium}=require('playwright');
const BASE=process.env.BASE||'http://127.0.0.1:18790';
const OUT=(process.env.OUT||'.')+'/';
const LIST=`Список больных (WIDEMEMO) 01.10.2026 07:00 - 31.10.2026 07:00
Состоит 3, перевод 0, поступление 3, смертей 0

1.ПЕТРОВ ИВАН ИВАНОВИЧ , в отделении -6 дней
Диагноз: P22.0 Синдром дыхательного расстройства у новорожденного

2.КОТОВА НЕИЗВЕСТНО ВТОРАЯ -2 дн., в отделении -3 дней
Диагноз: Z38.3 Двойня, рожденная в стационаре
3.ЕЖОВ НЕИЗВЕСТНО , в отделении 3 дней
Диагноз: P07.3 Другие случаи недоношенности
Операция: Вентрикулостомия 24.10.2026

Врач-неонатолог: ИВАНОВ И. И.`;
(async()=>{
 const browser=await chromium.launch();const errors=[];
 const ctx=await browser.newContext({viewport:{width:1440,height:900},locale:'ru-RU'});const page=await ctx.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(BASE+'/setup');await page.fill('input[autocomplete="username"]','admin');await page.fill('input[autocomplete="name"]','Админ');await page.fill('input[type="password"]','secret123');await page.click('button[type="submit"]');
 await page.waitForURL('**/patients');await page.fill('input[type="password"]','secret123');await page.click('button:has-text("Создать ключ")');
 await page.waitForSelector('text=Лист восстановления',{timeout:60000});await page.check('input[type="checkbox"]');await page.click('button:has-text("Продолжить")');
 await page.waitForSelector('text=Пока никого нет');
 // Петров уже заведён вручную: в списке он должен прийти без галочки.
 await page.click('text=Новый пациент');await page.fill('#surname','Петров Иван Иванович');await page.fill('#historyNumber','1');
 await page.click('#sex');await page.click('[role="option"]:has-text("Мужской")');await page.fill('#birthDate','2026-10-20');await page.fill('#admittedOn','2026-10-20');
 await page.click('button:has-text("Завести")');await page.waitForURL(/\/patients\/\d+$/);
 await page.goto(BASE+'/patients');await page.click('a:has-text("Списком")');await page.waitForURL('**/patients/import');
 await page.fill('textarea.imp-text',LIST);await page.click('button:has-text("Разобрать")');
 const rows=page.locator('.imp-row:not(.imp-h)');if(await rows.count()!==3)throw new Error('строк '+await rows.count());
 if(await rows.nth(0).locator('input[type=checkbox]').isChecked())throw new Error('дубликат отмечен');
 if(await rows.nth(1).locator('input[aria-label="Фамилия"]').inputValue()!=='Котова, двойня 2')throw new Error('имя двойни');
 if(await rows.nth(1).locator('select').inputValue()!=='female')throw new Error('пол двойни');
 if(!(await page.locator('button:has-text("Завести готовых (0)")').isDisabled()))throw new Error('пустые завелись бы');
 const fill=async(i,h,sex,bd)=>{const r=rows.nth(i);await r.locator('input[aria-label="№ истории"]').fill(h);if(sex)await r.locator('select').selectOption(sex);await r.locator('input[aria-label="Дата рождения"]').fill(bd);};
 await fill(1,'202','', '2026-10-28');await fill(2,'203','male','2026-10-27');await rows.nth(2).locator('input[aria-label="Масса при рождении, г"]').fill('980');
 await page.screenshot({path:OUT+'import.png',fullPage:true});
 await page.click('button:has-text("Завести готовых (2)")');await page.waitForSelector('text=Заведено: 2');
 await page.goto(BASE+'/patients');await page.waitForSelector('.prow');const names=await page.locator('.prow b').allTextContents();
 console.log('в отделении:',names.join(' · '));if(names.length!==3)throw new Error('ожидалось 3 пациента');
 const raw=await page.evaluate(async()=>(await (await fetch('/api/patients?status=active')).text()));
 if(/Котова|Ежов|P07/.test(raw))throw new Error('на сервере открытый текст');
 if(errors.length)throw new Error(errors.join('\n'));
 console.log('ок: импорт, дубликат, обязательные поля, шифротекст');await browser.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
