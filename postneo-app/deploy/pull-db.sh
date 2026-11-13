#!/usr/bin/env bash
# POSTNEO · перенос базы одной командой. Запускается на НОВОМ сервере, пароль root старого сервера спрашивается один раз.
#
#   EXPECTED_NEW_IP=194.58.100.67 bash pull-db.sh [СТАРЫЙ_IP]
# Перед запуском согласуйте паузу записи и проверьте SSH со нового сервера на старый.
#
# Что делает за одно подключение к старому серверу: останавливает там отделение (чтобы после копии ничего не дописали),
# снимает свежую копию базы через службу копирования и передаёт её сюда. Затем проверяет файл и подключает его (import-db.sh).
# Если что-то пошло не так, печатает команду, которая возвращает старое отделение в работу.
set -euo pipefail
umask 077
[ "$(id -u)" = 0 ] || { echo "нужен root: sudo bash"; exit 1; }
OLD="${1:-89.169.32.9}"
[[ "$OLD" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Invalid source IPv4" >&2; exit 1; }
[ -n "${EXPECTED_NEW_IP:-}" ] || { echo "Set EXPECTED_NEW_IP to the Russian server IP." >&2; exit 1; }
IP="$(curl -4fsS --max-time 15 https://api.ipify.org)"
[ "$IP" = "$EXPECTED_NEW_IP" ] && [ "$IP" != "$OLD" ] || { echo "STOP: wrong target server: $IP" >&2; exit 1; }
# Аудированная версия импортёра: не скачиваем меняющийся main после остановки источника.
RAW=https://raw.githubusercontent.com/jEw1IK/tpn/b7c1d7bff9292bf01972c9d55f778d4ea016130e/postneo-app/deploy
DIR=/root/postneo-migration
DATA=/var/lib/postneo-kart
IMPORT="$DIR/import-db.sh"
id -u postneo >/dev/null 2>&1 || { echo "на этом сервере ещё нет отделения: сначала setup-ru-server.sh"; exit 1; }
mkdir -p -m 700 "$DIR"
curl -fsSL --max-time 60 "$RAW/import-db.sh" -o "$IMPORT.new"
bash -n "$IMPORT.new"
mv -f "$IMPORT.new" "$IMPORT"

PAUSED=0; SOURCE_ATTEMPTED=0; SUCCESS=0; APP_WAS_ACTIVE=0; TIMER_WAS_ACTIVE=0
systemctl is-active --quiet postneo-kart && APP_WAS_ACTIVE=1
systemctl is-active --quiet postneo-kart-update.timer && TIMER_WAS_ACTIVE=1
cleanup(){
  local rc=$?
  if [ "$SUCCESS" = 1 ]; then
    echo "Update timers remain paused until browser verification."
  elif [ "$SOURCE_ATTEMPTED" = 1 ]; then
    # Не оставлять два доступных для записи отделения после неудачного импорта.
    if systemctl stop postneo-kart; then
      echo "Target department stopped. To restore the OLD department, run on $OLD:"
      echo "  systemctl start postneo-kart postneo-kart-update.timer"
    else
      echo "STOP: could not stop target department. Check it before restarting the source." >&2
    fi
    echo "Migration failed; original source database and backups were not deleted." >&2
  elif [ "$PAUSED" = 1 ]; then
    [ "$APP_WAS_ACTIVE" = 0 ] || systemctl start postneo-kart || true
    [ "$TIMER_WAS_ACTIVE" = 0 ] || systemctl start postneo-kart-update.timer || true
  fi
  return "$rc"
}
trap cleanup EXIT
# Останавливаем все известные писатели назначения до проверки пустоты базы.
PAUSED=1
systemctl stop postneo-kart-update.timer postneo-kart-update.service
systemctl stop postneo-kart
python3 - "$DATA/postneo.sqlite" <<'PY'
from pathlib import Path
import shlex, sqlite3, sys
values = {}
for line in Path('/etc/postneo-kart.env').read_text().splitlines():
    key, sep, value = line.partition('=')
    if sep and key in ('DATA_DIR', 'DATABASE_FILE', 'PORT'):
        parsed = shlex.split(value)
        values[key] = parsed[0] if len(parsed) == 1 else ''
expected = Path(sys.argv[1])
configured = Path(values.get('DATABASE_FILE') or str(Path(values.get('DATA_DIR', '')) / 'postneo.sqlite'))
if configured != expected or values.get('PORT') != '3001':
    sys.exit('STOP: unexpected target database path or port')
db = sqlite3.connect(expected.as_uri() + '?mode=ro', uri=True)
if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
    sys.exit('STOP: target database integrity check failed')
counts = {table: db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]
          for table in ('users', 'patients', 'sheets')}
db.close()
print('Target counts:', counts)
if any(counts.values()):
    sys.exit('STOP: target database is not empty; nothing has been imported')
PY
OUT="$(mktemp "$DIR/final-$(date +%Y%m%d-%H%M%S)-XXXXXX.sqlite")"

echo "1/2 старый сервер $OLD: остановка отделения, свежая копия, передача сюда"
echo "    сейчас спросит пароль root старого сервера (при вводе не отображается)"
# -n: ssh не читает stdin (скрипт может идти через curl | bash); пароль ssh спрашивает с терминала сам
SOURCE_ATTEMPTED=1
if ! ssh -n -o StrictHostKeyChecking=yes -o ConnectTimeout=20 "root@$OLD" '
  set -e
  started=$(date +%s)
  systemctl stop postneo-kart-update.timer postneo-kart-update.service
  systemctl stop postneo-kart
  systemctl start postneo-kart-backup.service
  copy=$(ls -t /var/lib/postneo-kart/backups/postneo-*.sqlite | head -1)
  [ "$(stat -c %Y "$copy")" -ge "$started" ] || { echo "Fresh source backup missing" >&2; exit 1; }
  cat "$copy"
' > "$OUT"; then
  rm -f "$OUT"; echo "не удалось забрать копию со старого сервера (пароль? сеть?)"; exit 1
fi
if [ "$(head -c 15 "$OUT" 2>/dev/null)" != "SQLite format 3" ]; then
  rm -f "$OUT"; echo "получен не файл базы"; exit 1
fi
echo "    копия получена: $(stat -c %s "$OUT") байт"

echo "2/2 подключение базы на этом сервере"
if bash "$IMPORT" "$OUT"; then
  SUCCESS=1
  echo "Final snapshot retained privately: $OUT"
  echo; echo "Проверьте вход: https://$IP/kart/  (логин и пароль прежние)"
  echo "Старое отделение остаётся выключенным. Далее: проверка входа, маршрутов бота и переключение домена."
else
  exit 1
fi
