// Компьютер помнит ключ со времён фразы, а копии под паролем на сервере нет (вход до обновления, без нового логина).
// Ожидание: отделение открыто, сверху просьба один раз подтвердить пароль; после неё новый компьютер открывается паролем.
import {createRequire} from 'node:module';
import {createVault,toB64} from '../../lib/crypto.ts';
const require=createRequire(import.meta.url);const {chromium}=require('playwright');
const BASE=process.env.BASE||'http://127.0.0.1:18790';
const b=await chromium.launch();const ctx=await b.newContext({locale:'ru-RU'});const p=await ctx.newPage();
await p.goto(BASE+'/setup');await p.fill('input[autocomplete="username"]','admin');await p.fill('input[autocomplete="name"]','Админ');await p.fill('input[type="password"]','secret123');await p.click('button[type="submit"]');await p.waitForURL('**/patients');
const made=await createVault('тёплое молоко отделения 2026');
const st=await p.evaluate(async(rec)=>(await fetch('/api/vault',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(rec)})).status,made.record);
if(st!==201)throw new Error('хранилище не создалось: '+st);
await p.evaluate(([salt,key])=>localStorage.setItem('postneo.kart.key.v1',JSON.stringify({salt,key})),[made.record.kdf_salt,toB64(made.rawKey)]);
await p.reload();await p.waitForSelector('text=Пока никого нет',{timeout:60000});
await p.waitForSelector('text=Подтвердите пароль один раз');console.log('· отделение открыто, просьба подтвердить пароль на месте');
await p.fill('input[autocomplete="current-password"]','wrong-pass');await p.click('button:has-text("Подтвердить")');await p.waitForSelector('text=Пароль не подошёл');
await p.fill('input[autocomplete="current-password"]','secret123');await p.click('button:has-text("Подтвердить")');await p.waitForSelector('text=Готово: теперь отделение открывается');
await p.reload();await p.waitForSelector('text=Пока никого нет');if(await p.locator('text=Подтвердите пароль один раз').count())throw new Error('просьба осталась после подтверждения');
const c2=await b.newContext({locale:'ru-RU'});const q=await c2.newPage();
await q.goto(BASE+'/login');await q.fill('input[autocomplete="username"]','admin');await q.fill('input[type="password"]','secret123');await q.click('button[type="submit"]');await q.waitForURL('**/patients');
await q.waitForSelector('text=Пока никого нет',{timeout:60000});if(await q.locator('text=Подтвердите пароль').count())throw new Error('новый компьютер спросил фразу или пароль');
console.log('· новый компьютер открылся одним паролем');
await b.close();console.log('REMEMBERED OK');
