#!/usr/bin/env bash
# POSTNEO · старый сервер после переезда: сайт и отделение выключаются, все адреса переадресуются на новый сервер.
# Telegram-бот (postneo-bot) и его файлы в /opt/postneo/app, /opt/postneo/.venv, /opt/postneo/.env не трогаются.
#
#   sudo bash retire-old-server.sh НОВЫЙ_IP            # в день переезда: выключить сайт и отделение, включить переадресацию
#   sudo bash retire-old-server.sh НОВЫЙ_IP --wipe     # через неделю: ещё и стереть базу отделения и её копии
#
# Переадресация 301 на https://НОВЫЙ_IP/… сохраняет путь: закладки врачей, ссылки и приложение для ПК
# (вход в отделение и проверка обновлений) продолжают работать без пересборки. Журнал запросов выключен.
# Сертификат на старый IP продолжает продлеваться: путь проверки Let's Encrypt остаётся.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "нужен root: sudo bash retire-old-server.sh НОВЫЙ_IP"; exit 1; }
NEW="${1:-}"; WIPE=0; [ "${2:-}" = "--wipe" ] && WIPE=1
[[ "$NEW" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "укажите IP нового сервера: sudo bash retire-old-server.sh 1.2.3.4"; exit 1; }
OLD="$(hostname -I | awk '{print $1}')"
[ "$NEW" != "$OLD" ] || { echo "это и есть новый сервер ($NEW): скрипт запускается на старом"; exit 1; }

echo "1/4 новый сервер отвечает?"
curl -fsS -k --max-time 15 -o /dev/null "https://$NEW/kart/api/health" \
  || { echo "https://$NEW/kart/api/health не отвечает: сначала setup-ru-server.sh и import-db.sh на новом сервере"; exit 1; }
echo "  да: https://$NEW/kart/api/health"

echo "2/4 выключаю сайт и отделение (бот остаётся)"
for u in postneo-kart.service postneo-kart-backup.timer postneo-kart-update.timer postneo-kart-mirror.timer postneo-site-update.timer; do
  systemctl disable --now "$u" >/dev/null 2>&1 && echo "  выключено: $u" || true
done
systemctl is-active --quiet postneo-bot && echo "  бот работает: postneo-bot" || echo "  бот сейчас не запущен (скрипт его не трогал)"

echo "3/4 nginx: переадресация на $NEW"
CERT="$(grep -RhoE 'ssl_certificate\s+/etc/letsencrypt/live/ip-[^/]+/fullchain.pem' /etc/nginx/sites-enabled/ 2>/dev/null | head -1 | awk '{print $2}' || true)"
[ -n "$CERT" ] || CERT="$(grep -RhoE 'ssl_certificate\s+[^;]+' /etc/nginx/sites-enabled/ 2>/dev/null | head -1 | awk '{print $2}' || true)"
KEY="${CERT%fullchain.pem}privkey.pem"
WEBROOT="$(grep -RhA2 'acme-challenge' /etc/nginx/sites-enabled/ 2>/dev/null | grep -oE 'root\s+[^;]+' | head -1 | awk '{print $2}' || true)"
[ -n "$WEBROOT" ] || WEBROOT=/var/www/letsencrypt
mkdir -p "$WEBROOT/.well-known/acme-challenge"
BAK="/root/nginx-before-move-$(date +%Y%m%d-%H%M%S)"; mkdir -p "$BAK"; cp -a /etc/nginx/sites-available /etc/nginx/sites-enabled "$BAK/"
echo "  прежние конфиги: $BAK"
CONF=/etc/nginx/sites-available/postneo-moved
V6=""; [ -s /proc/net/if_inet6 ] && V6=1
{
  echo "# POSTNEO переехал на $NEW. Создано retire-old-server.sh; прежние конфиги в $BAK"
  echo "server {"
  echo "    listen 80 default_server;"; [ -n "$V6" ] && echo "    listen [::]:80 default_server;"
  echo "    server_name _;"
  echo "    server_tokens off;"
  echo "    access_log off;"
  echo "    location ^~ /.well-known/acme-challenge/ { root $WEBROOT; default_type text/plain; }"
  echo "    location / { return 301 https://$NEW\$request_uri; }"
  echo "}"
  if [ -n "$CERT" ] && [ -s "$CERT" ] && [ -s "$KEY" ]; then
    echo "server {"
    echo "    listen 443 ssl default_server;"; [ -n "$V6" ] && echo "    listen [::]:443 ssl default_server;"
    echo "    server_name _;"
    echo "    server_tokens off;"
    echo "    access_log off;"
    echo "    ssl_certificate $CERT;"
    echo "    ssl_certificate_key $KEY;"
    echo "    ssl_protocols TLSv1.2 TLSv1.3;"
    echo "    return 301 https://$NEW\$request_uri;"
    echo "}"
  fi
} > "$CONF"
find /etc/nginx/sites-enabled -maxdepth 1 \( -type l -o -type f \) ! -name postneo-moved -delete
ln -sf "$CONF" /etc/nginx/sites-enabled/postneo-moved
if nginx -t 2>/tmp/postneo-moved-nginx.log; then
  systemctl reload nginx
  echo "  http(s)://$OLD/… → https://$NEW/…"
else
  cat /tmp/postneo-moved-nginx.log
  rm -f /etc/nginx/sites-enabled/postneo-moved; cp -a "$BAK/sites-enabled/." /etc/nginx/sites-enabled/
  nginx -t && systemctl reload nginx
  echo "nginx не принял переадресацию, вернул прежние конфиги"; exit 1
fi

echo "4/4 данные отделения"
if [ "$WIPE" = 1 ]; then
  shopt -s nullglob
  files=(/var/lib/postneo-kart/postneo.sqlite* /var/lib/postneo-kart/backups/*)
  [ ${#files[@]} -gt 0 ] && shred -u "${files[@]}"
  rm -rf /opt/postneo/kart /opt/postneo/site /opt/postneo/download /opt/postneo/download-cache /var/lib/postneo-kart
  echo "  база, копии, сборки сайта и отделения стёрты. Бот: /opt/postneo/app и /opt/postneo/.env на месте"
else
  echo "  база пока на месте (на случай отката). Через неделю: sudo bash retire-old-server.sh $NEW --wipe"
fi
curl -s -o /dev/null -w "  проверка: http://127.0.0.1/postneo/ → %{http_code} %{redirect_url}\n" --max-time 5 http://127.0.0.1/postneo/ || true
