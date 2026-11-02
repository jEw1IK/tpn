// Сброс пароля прямо на сервере, когда войти через сайт не получается (забыт пароль, вход закрыт после ошибок).
// Запуск по SSH, от имени службы, чтобы не испортить права на файлы базы (база по умолчанию /var/lib/postneo-kart):
//   sudo -u postneo node --disable-warning=ExperimentalWarning /opt/postneo/kart/current/scripts/reset-password.mjs          — список логинов
//   sudo -u postneo node --disable-warning=ExperimentalWarning /opt/postneo/kart/current/scripts/reset-password.mjs ЛОГИН    — новый пароль
// Пароль спрашивается дважды и не отображается. Что делает: ставит новый пароль, снимает блокировку входа и отключение,
// закрывает все сессии этого пользователя. Копия ключа шифрования под старым паролем убирается: после входа ключ
// откроется кодом восстановления (лист, который сохранили при создании ключа) и снова сохранится под новым паролем.
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,scryptSync} from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';

const file=process.env.DATABASE_FILE||path.join(process.env.DATA_DIR||'/var/lib/postneo-kart','postneo.sqlite');
if(!fs.existsSync(file)){console.error('База не найдена: '+file+'. Задайте DATA_DIR или DATABASE_FILE.');process.exit(1);}
const db=new DatabaseSync(file);
const login=(process.argv[2]||'').trim().toLowerCase();

if(!login){
 console.log('Пользователи:');
 for(const u of db.prepare('select login,name,role,disabled from users order by role,login').all())console.log(`  ${u.login}  ·  ${u.name}  ·  ${u.role}${u.disabled?'  · отключён':''}`);
 console.log('\nСбросить пароль: … reset-password.mjs ЛОГИН');process.exit(0);
}
const user=db.prepare('select id,login,name,role from users where login=?').get(login);
if(!user){console.error('Нет пользователя с логином '+login);process.exit(1);}

/** Пароль из терминала без эха; из канала (тесты, автоматизация) — построчно. */
async function ask(prompt){
 const stdin=process.stdin;
 if(!stdin.isTTY){
  ask.lines??=fs.readFileSync(0,'utf8').split(/\r?\n/);
  process.stdout.write(prompt+'\n');return ask.lines.shift()??'';
 }
 process.stdout.write(prompt);stdin.setRawMode(true);stdin.resume();stdin.setEncoding('utf8');
 return new Promise(resolve=>{let value='';
  const on=ch=>{
   if(ch==='\r'||ch==='\n'){stdin.setRawMode(false);stdin.pause();stdin.off('data',on);process.stdout.write('\n');resolve(value);}
   else if(ch==='\u0003'){process.stdout.write('\n');process.exit(130);}
   else if(ch==='\u007f'||ch==='\b')value=value.slice(0,-1);
   else value+=ch;
  };
  stdin.on('data',on);
 });
}

const first=await ask(`Новый пароль для ${user.login} (${user.name}, ${user.role}): `);
if(first.length<8){console.error('Пароль не короче 8 символов');process.exit(1);}
const second=await ask('Ещё раз: ');
if(first!==second){console.error('Пароли не совпали, ничего не изменено');process.exit(1);}

const salt=randomBytes(16).toString('hex');
const hash=salt+':'+scryptSync(first,salt,64).toString('hex');
db.exec('begin');
db.prepare('update users set password_hash=?,key_wrap=null,disabled=0 where id=?').run(hash,user.id);
db.prepare('delete from sessions where user_id=?').run(user.id);
db.prepare('delete from login_attempts').run();
try{db.prepare("insert into audit(user_id,action,entity,entity_id,details) values (?,'password-reset-cli','user',?,?)").run(user.id,user.id,'сброс пароля на сервере');}catch{}
db.exec('commit');
db.close();
console.log(`Готово: пароль ${user.login} изменён, вход открыт, все сессии закрыты.`);
console.log('После входа сайт попросит код восстановления ключа (лист восстановления), если копии ключа под новым паролем ещё нет.');
