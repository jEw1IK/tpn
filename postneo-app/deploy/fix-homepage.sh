#!/usr/bin/env bash
# Исправить только корневой маршрут существующего nginx, не переустанавливая сайт.
# База, службы отделения и бота, DNS и сертификаты не изменяются.
set -euo pipefail

[ "$(id -u)" = 0 ] || { echo "Запустите от root или через sudo." >&2; exit 1; }
CONF="$(readlink -f "${POSTNEO_NGINX_CONF:-/etc/nginx/sites-enabled/postneo}")"
[ -f "$CONF" ] || { echo "Конфигурация не найдена: $CONF" >&2; exit 1; }
nginx -t

BACKUPS="${POSTNEO_NGINX_BACKUP_DIR:-/root/postneo-nginx-backups}"
mkdir -p -m 700 "$BACKUPS"
BACKUP="$(mktemp "$BACKUPS/before-homepage.XXXXXX.conf")"
cp -p "$CONF" "$BACKUP"
echo "Резервная копия: $BACKUP"

if ! python3 - "$CONF" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
old = 'location = / { try_files /index.html =404; }'
new = 'location = / { return 302 /postneo/$is_args$args; }'
count = text.count(old)
if count:
    path.write_text(text.replace(old, new))
    print(f'Исправлено корневых маршрутов: {count}')
elif new in text:
    print('Корневой маршрут уже исправлен.')
else:
    sys.exit('Ожидаемый маршрут не найден. Нужна проверка конфигурации; файл не изменён.')
PY
then
    cp -p "$BACKUP" "$CONF"
    exit 1
fi

if ! nginx -t; then
    cp -p "$BACKUP" "$CONF"
    echo "Проверка не прошла: прежний файл восстановлен, reload не выполнялся." >&2
    exit 1
fi
if ! systemctl reload nginx; then
    cp -p "$BACKUP" "$CONF"
    echo "Reload не прошёл: файл восстановлен; применяем прежнюю конфигурацию." >&2
    nginx -t && systemctl reload nginx
    exit 1
fi

echo "Готово: корень сайта перенаправляется на /postneo/."
