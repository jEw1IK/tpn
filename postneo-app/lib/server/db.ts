import {DatabaseSync,type StatementSync,type SQLInputValue} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

/** Тонкая обёртка над встроенным node:sqlite с привычным синхронным API: prepare().run/get/all, exec, transaction, pragma, backup.
 *  Нативных модулей нет, поэтому одна и та же сборка работает в Docker и на обычном ПК под Windows. */
type Row=Record<string,unknown>;
const plain=(r:unknown)=>r==null?undefined:Object.assign({},r as Row);
/** Подготовленный запрос: строки возвращаются обычными объектами (node:sqlite отдаёт их без прототипа). */
export class Stmt{
 private readonly s:StatementSync;
 constructor(s:StatementSync){this.s=s;}
 run(...args:SQLInputValue[]){return this.s.run(...args);}
 get(...args:SQLInputValue[]):Row|undefined{return plain(this.s.get(...args));}
 all(...args:SQLInputValue[]):Row[]{return this.s.all(...args).map(r=>plain(r) as Row);}
}
export class Db{
 readonly raw:DatabaseSync;
 constructor(file:string,options:{readonly?:boolean}={}){this.raw=new DatabaseSync(file,{readOnly:options.readonly===true});}
 prepare(sql:string):Stmt{return new Stmt(this.raw.prepare(sql));}
 exec(sql:string){this.raw.exec(sql);}
 pragma(expr:string):unknown{const rows=this.raw.prepare('pragma '+expr).all();return rows.length===1?Object.values(rows[0] as object)[0]:rows;}
 /** Функция внутри одной транзакции; при исключении изменения откатываются. Вложенные вызовы идут в той же транзакции. */
 transaction<A extends unknown[],R>(fn:(...args:A)=>R):(...args:A)=>R{
  return (...args:A)=>{
   if(this.depth>0){return fn(...args);}
   this.raw.exec('begin immediate');this.depth++;
   try{const r=fn(...args);this.raw.exec('commit');return r;}
   catch(e){try{this.raw.exec('rollback');}catch{}throw e;}
   finally{this.depth--;}
  };
 }
 private depth=0;
 /** Целостная копия базы средствами SQLite, работает и во время записи. */
 backup(file:string){if(fs.existsSync(file))fs.unlinkSync(file);this.raw.exec(`vacuum into '${file.replaceAll("'","''")}'`);}
 close(){this.raw.close();}
}

/** Схема базы отделения. Каждая запись в массиве — одна миграция; версии хранятся в таблице schema и накатываются по порядку при старте. */
const migrations:string[]=[`
create table users(
 id integer primary key autoincrement,
 login text not null unique,
 name text not null,
 role text not null check(role in ('admin','doctor','nurse')),
 password_hash text not null,
 disabled integer not null default 0,
 created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create table sessions(
 id integer primary key autoincrement,
 user_id integer not null references users(id) on delete cascade,
 token_hash text not null unique,
 created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 expires_at text not null,
 ip text, ua text
);
create index sessions_expires on sessions(expires_at);
create table patients(
 id integer primary key autoincrement,
 surname text not null,
 history_number text not null,
 birth_date text not null,
 birth_time text,
 sex text not null,
 gestation_weeks integer,
 gestation_days integer,
 birth_weight integer,
 admitted_on text not null,
 diagnosis text not null default '',
 status text not null default 'active' check(status in ('active','discharged')),
 discharged_on text,
 created_by integer references users(id),
 created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index patients_status on patients(status,surname);
create table weights(
 id integer primary key autoincrement,
 patient_id integer not null references patients(id) on delete cascade,
 date text not null,
 grams integer not null,
 created_by integer references users(id),
 created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 unique(patient_id,date)
);
create table sheets(
 id integer primary key autoincrement,
 patient_id integer not null references patients(id) on delete cascade,
 sheet_date text not null,
 status text not null default 'draft' check(status in ('draft','signed')),
 inputs_json text not null,
 ui_json text not null default '{}',
 summary_json text not null default '{}',
 version integer not null default 1,
 author_id integer references users(id),
 signed_by integer references users(id),
 signed_at text,
 created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 unique(patient_id,sheet_date)
);
create table audit(
 id integer primary key autoincrement,
 at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 user_id integer references users(id),
 action text not null,
 entity text not null,
 entity_id integer,
 details text not null default '',
 ip text
);
create index audit_at on audit(at);
`,`
-- Шифрование ключом отделения: карточки, веса и листы лежат шифротекстом в enc, открытые поля старых записей
-- остаются до перешифровки администратором. Открытыми остаются только служебные поля: статус, даты листов, подписи.
create table settings(key text primary key, value text not null, updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
alter table patients add column enc text;
alter table weights add column enc text;
alter table sheets add column enc text;
alter table sheets add column valid integer not null default 0;
`,`
-- Вход специалистов: приглашения вместо выдачи паролей администратором, защита от перебора.
create table invites(
 id integer primary key autoincrement,
 code_hash text not null unique,
 role text not null check(role in ('admin','doctor','nurse')),
 note text not null default '',
 created_by integer references users(id),
 created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 expires_at text not null,
 used_by integer references users(id),
 used_at text
);
create table login_attempts(
 id integer primary key autoincrement,
 key text not null,
 at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index login_attempts_key on login_attempts(key,at);
`];

export function openDb(file:string):Db{
 if(file!==':memory:')fs.mkdirSync(path.dirname(file),{recursive:true});
 const db=new Db(file);
 if(file!==':memory:')db.pragma('journal_mode = WAL');
 db.pragma('foreign_keys = ON');
 db.pragma('busy_timeout = 5000');
 migrate(db);
 return db;
}
function migrate(db:Db){
 db.exec('create table if not exists schema(version integer not null)');
 const row=db.prepare('select max(version) as v from schema').get() as {v:number|null};
 const current=row.v??0;
 const apply=db.transaction(()=>{for(let i=current;i<migrations.length;i++){db.exec(migrations[i]);db.prepare('insert into schema(version) values (?)').run(i+1);}});
 apply();
}

let shared:Db|null=null;
/** Общая база приложения: путь из DATABASE_FILE или DATA_DIR/postneo.sqlite, по умолчанию ./data рядом с приложением. */
export function getDb():Db{
 if(shared)return shared;
 const dir=process.env.DATA_DIR||path.join(process.cwd(),'data');
 const file=process.env.DATABASE_FILE||path.join(dir,'postneo.sqlite');
 shared=openDb(file);
 return shared;
}
/** Копия базы для бэкапа средствами SQLite: целостный файл даже под нагрузкой. */
export function backupTo(db:Db,file:string){fs.mkdirSync(path.dirname(file),{recursive:true});db.backup(file);}

/** Настройки приложения, в том числе обёртки ключа отделения. */
export function getSetting(db:Db,key:string):string|null{const r=db.prepare('select value from settings where key=?').get(key) as {value:string}|undefined;return r?r.value:null;}
export function setSetting(db:Db,key:string,value:string){db.prepare("insert into settings(key,value) values (?,?) on conflict(key) do update set value=excluded.value,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')").run(key,value);}
