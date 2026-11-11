#!/usr/bin/env bash
# POSTNEO · перенос базы одной командой. Запускается на НОВОМ сервере, пароль root старого сервера спрашивается один раз.
#
#   curl -fsSL https://raw.githubusercontent.com/jEw1IK/tpn/main/postneo-app/deploy/pull-db.sh | sudo bash
#   другой старый сервер:  ... | sudo bash -s -- 1.2.3.4
#
# Что делает за одно подключение к старому серверу: останавливает там отделение (чтобы после копии ничего не дописали),
# снимает свежую копию базы через службу копирования и передаёт её сюда. Затем проверяет файл и подключает его (import-db.sh).
# Если что-то пошло не так, печатает команду, которая возвращает старое отделение в работу.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "нужен root: sudo bash"; exit 1; }
OLD="${1:-89.169.32.9}"
RAW=https://raw.githubusercontent.com/jEw1IK/tpn/main/postneo-app/deploy
OUT="/root/postneo-move-$(date +%Y%m%d-%H%M%S).sqlite"
back(){ echo; echo "Перенос не завершён. Вернуть старое отделение в работу (на старом сервере):"; echo "  systemctl start postneo-kart postneo-kart-update.timer"; }
id -u postneo >/dev/null 2>&1 || { echo "на этом сервере ещё нет отделения: сначала setup-ru-server.sh"; exit 1; }

echo "1/2 старый сервер $OLD: остановка отделения, свежая копия, передача сюда"
echo "    сейчас спросит пароль root старого сервера (при вводе не отображается)"
# -n: ssh не читает stdin (скрипт может идти через curl | bash); пароль ssh спрашивает с терминала сам
if ! ssh -n -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 "root@$OLD" \
  'systemctl stop postneo-kart-update.timer postneo-kart && systemctl start postneo-kart-backup.service && cat "$(ls -t /var/lib/postneo-kart/backups/postneo-*.sqlite | head -1)"' > "$OUT"; then
  rm -f "$OUT"; echo "не удалось забрать копию со старого сервера (пароль? сеть?)"; back; exit 1
fi
if [ "$(head -c 15 "$OUT" 2>/dev/null)" != "SQLite format 3" ]; then
  rm -f "$OUT"; echo "получен не файл базы"; back; exit 1
fi
echo "    копия получена: $(stat -c %s "$OUT") байт"

echo "2/2 подключение базы на этом сервере"
curl -fsSL "$RAW/import-db.sh" -o /root/import-db.sh
if bash /root/import-db.sh "$OUT"; then
  shred -u "$OUT" 2>/dev/null || rm -f "$OUT"
  IP="$(hostname -I | awk '{print $1}')"
  echo; echo "Проверьте вход: https://$IP/kart/  (логин и пароль прежние)"
  echo "Старое отделение остаётся выключенным. Следующий шаг — переадресация со старого сервера (retire-old-server.sh)."
else
  back; exit 1
fi
