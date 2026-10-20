import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type Db=Database.Database;

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
`];

export function openDb(file:string):Db{
 if(file!==':memory:')fs.mkdirSync(path.dirname(file),{recursive:true});
 const db=new Database(file);
 db.pragma('journal_mode = WAL');
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
export async function backupTo(db:Db,file:string){fs.mkdirSync(path.dirname(file),{recursive:true});await db.backup(file);}
