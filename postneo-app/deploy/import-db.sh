#!/usr/bin/env bash
# POSTNEO · перенос базы отделения на этот сервер из файла резервной копии (postneo-ГГГГММДД-ЧЧММ.sqlite).
# Копию на старом сервере делает scripts/backup.mjs (VACUUM INTO: в ней нет удалённых старых страниц).
#
#   sudo bash import-db.sh /root/postneo-20261103-2100.sqlite
#
# Что делает: проверяет файл (целостность, что это база POSTNEO, сколько записей ещё не зашифровано), останавливает
# отделение, сохраняет текущую базу этого сервера в backups/, ставит новую с правильным владельцем, запускает и проверяет.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "нужен root: sudo bash import-db.sh ФАЙЛ"; exit 1; }
SRC="${1:-}"; DATA=/var/lib/postneo-kart; DB=$DATA/postneo.sqlite; SVC=postneo-kart; PORT=3001
[ -n "$SRC" ] && [ -s "$SRC" ] || { echo "укажите файл копии: sudo bash import-db.sh /root/postneo-….sqlite"; exit 1; }
id -u postneo >/dev/null 2>&1 && [ -d "$DATA" ] || { echo "отделение на этом сервере ещё не установлено: сначала setup-ru-server.sh"; exit 1; }

echo "1/4 проверка файла"
node --disable-warning=ExperimentalWarning -e '
const {DatabaseSync}=require("node:sqlite");
const db=new DatabaseSync(process.argv[1],{readOnly:true});
const one=(sql,...a)=>Object.values(db.prepare(sql).get(...a))[0];
const integrity=one("pragma integrity_check");
const has=(t)=>one("select count(*) from sqlite_master where type=? and name=?","table",t)>0;
if(!has("users")||!has("patients")){console.error("это не база POSTNEO: нет таблиц users/patients");process.exit(2);}
const r={integrity,schema:one("select max(version) from schema"),users:one("select count(*) from users"),admins:one("select count(*) from users where role=? and disabled=0","admin"),
 patients:one("select count(*) from patients"),sheets:one("select count(*) from sheets"),
 vault:one("select count(*) from settings where key=?","vault"),
 plain:one("select count(*) from patients where enc is null")+one("select count(*) from weights where enc is null")+one("select count(*) from sheets where enc is null")};
console.log("  целостность: "+r.integrity+" · версия схемы: "+r.schema);
console.log("  пользователей: "+r.users+" (активных администраторов: "+r.admins+") · пациентов: "+r.patients+" · листов: "+r.sheets);
console.log("  ключ отделения: "+(r.vault?"есть":"НЕТ")+" · незашифрованных записей: "+r.plain);
if(r.integrity!=="ok"){console.error("файл повреждён, перенос остановлен");process.exit(3);}
if(r.plain>0)console.log("  ВНИМАНИЕ: после переноса войдите администратором и нажмите «Зашифровать всё», чтобы открытых записей не осталось");
' "$SRC"

echo "2/4 остановка отделения и копия текущей базы"
systemctl stop "$SVC"
mkdir -p "$DATA/backups"
if [ -s "$DB" ]; then
  KEEP="$DATA/backups/before-import-$(date +%Y%m%d-%H%M%S).sqlite"
  cp -a "$DB" "$KEEP"; echo "  прежняя база этого сервера: $KEEP"
fi

echo "3/4 установка новой базы"
rm -f "$DB-wal" "$DB-shm"
install -o postneo -g postneo -m 640 "$SRC" "$DB"
chown -R postneo:postneo "$DATA"

echo "4/4 запуск и проверка"
systemctl start "$SVC"
for i in $(seq 1 20); do curl -fsS --noproxy '*' "http://127.0.0.1:$PORT/kart/api/health" >/dev/null 2>&1 && break; sleep 1; done
if curl -fsS --noproxy '*' "http://127.0.0.1:$PORT/kart/api/health"; then
  echo; echo "Готово: база перенесена, отделение работает."
  echo "Проверьте вход в браузере. Потом удалите файл копии: shred -u '$SRC'"
else
  echo "отделение не отвечает: journalctl -u $SVC -n 50"; exit 1
fi
