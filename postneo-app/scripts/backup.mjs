// Резервная копия базы средствами SQLite: целостный файл даже во время работы.
// Внутри контейнера:  docker exec postneo-kart node scripts/backup.mjs /data/backups
// Файл: postneo-ГГГГММДД-ЧЧММ.sqlite; хранятся 30 последних копий.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const dir=process.argv[2]||path.join(process.env.DATA_DIR||'/data','backups');
const source=process.env.DATABASE_FILE||path.join(process.env.DATA_DIR||'/data','postneo.sqlite');
fs.mkdirSync(dir,{recursive:true});
const stamp=new Date().toISOString().replace(/[-:]/g,'').replace('T','-').slice(0,13);
const target=path.join(dir,`postneo-${stamp}.sqlite`);
const db=new Database(source,{readonly:true});
await db.backup(target);
db.close();
const keep=30;
const old=fs.readdirSync(dir).filter(f=>/^postneo-\d{8}-\d{4}\.sqlite$/.test(f)).sort().reverse().slice(keep);
for(const f of old)fs.unlinkSync(path.join(dir,f));
console.log('backup:',target,fs.statSync(target).size,'bytes');
