// Переход со старой фразы: хранилище создано фразой (как на сервере отделения до отмены фразы),
// пользователь входит паролем, вводит фразу один раз — дальше открывает паролем без фразы.
import {createRequire} from 'node:module';
import {createVault} from '../../lib/crypto.ts';
const require=createRequire(import.meta.url);const {chromium}=require('playwright');
const BASE=process.env.BASE||'http://127.0.0.1:18790';
const PHRASE='тёплое молоко отделения 2026';
const b=await chromium.launch();const ctx=await b.newContext({locale:'ru-RU'});const p=await ctx.newPage();
await p.goto(BASE+'/setup');await p.fill('input[autocomplete="username"]','admin');await p.fill('input[autocomplete="name"]','Админ');await p.fill('input[type="password"]','secret123');await p.click('button[type="submit"]');await p.waitForURL('**/patients');
const made=await createVault(PHRASE);
const st=await p.evaluate(async(rec)=>(await fetch('/api/vault',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(rec)})).status,made.record);
if(st!==201)throw new Error('старое хранилище не создалось: '+st);
const ctx2=await b.newContext({locale:'ru-RU'});const q=await ctx2.newPage();
await q.goto(BASE+'/login');await q.fill('input[autocomplete="username"]','admin');await q.fill('input[type="password"]','secret123');await q.click('button[type="submit"]');await q.waitForURL('**/patients');
await q.waitForSelector('text=Подтвердите пароль');await q.fill('input[type="password"]','secret123');await q.click('button:has-text("Открыть")');
await q.waitForSelector('text=Старая фраза отделения');const pw=q.locator('input[type="password"]');await pw.nth(0).fill('secret123');await pw.nth(1).fill(PHRASE);await q.click('button:has-text("Открыть")');
await q.waitForSelector('text=Пока никого нет',{timeout:60000});console.log('· старая фраза принята один раз');
const ctx3=await b.newContext({locale:'ru-RU'});const r=await ctx3.newPage();
await r.goto(BASE+'/login');await r.fill('input[autocomplete="username"]','admin');await r.fill('input[type="password"]','secret123');await r.click('button[type="submit"]');await r.waitForURL('**/patients');
await r.waitForSelector('text=Пока никого нет',{timeout:60000});
if(await r.locator('text=Подтвердите пароль').count())throw new Error('фразу спросили второй раз');
console.log('· на новом компьютере открылось одним паролем');
await b.close();console.log('MIGRATION OK');
