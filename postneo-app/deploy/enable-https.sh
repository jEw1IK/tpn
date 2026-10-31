#!/usr/bin/env bash
# POSTNEO · HTTPS для сервера. Сначала имя вида 89-169-32-9.sslip.io, при лимите Let's Encrypt — сертификат на сам IP.
# Запуск:  curl -fsSL https://raw.githubusercontent.com/jEw1IK/tpn/main/postneo-app/deploy/enable-https.sh | sudo bash
#          ... | sudo bash -s -- kart.example.ru      (свой домен, уже направленный на этот сервер)
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "нужен root: sudo bash"; exit 1; }
IP="$(curl -fsS --max-time 10 https://api.ipify.org || hostname -I | awk '{print $1}')"
HOST="${1:-$(echo "$IP" | tr . -).sslip.io}"
echo "сервер: $IP, имя: $HOST"

NGX=""
for f in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
  [ -f "$f" ] && grep -q "postneo" "$f" && { NGX="$(readlink -f "$f")"; break; }
done
[ -n "$NGX" ] || { [ -f /etc/nginx/sites-enabled/default ] && NGX="$(readlink -f /etc/nginx/sites-enabled/default)"; }
[ -n "$NGX" ] || { echo "конфиг nginx с сайтом не найден"; exit 1; }
echo "конфиг: $NGX"

# 1. Имя сервера в блоке server: certbot находит блок по server_name.
if ! grep -qE "server_name[^;]*\b$HOST\b" "$NGX"; then
  cp -a "$NGX" "$NGX.bak-https-$(date +%Y%m%d%H%M%S)"
  python3 - "$NGX" "$HOST" <<'PY'
import re,sys
f,host=sys.argv[1],sys.argv[2];s=open(f).read()
m=re.search(r'^(\s*)listen\s+80[^;]*;\s*$',s,re.M)
if not m: m=re.search(r'^(\s*)server\s*\{\s*$',s,re.M)
indent=m.group(1) if m else '    '
pos=m.end() if m else 0
s=s[:pos]+f"\n{indent}server_name {host};"+s[pos:]
open(f,'w').write(s)
PY
  nginx -t && systemctl reload nginx
  echo "server_name $HOST добавлен"
fi

# 2. certbot из snap: свежий, умеет профили и IP-сертификаты.
if ! command -v certbot >/dev/null 2>&1; then
  if ! command -v snap >/dev/null 2>&1; then apt-get update -qq && apt-get install -y -qq snapd; fi
  snap install core >/dev/null 2>&1 || true; snap refresh core >/dev/null 2>&1 || true
  snap install --classic certbot
  ln -sf /snap/bin/certbot /usr/bin/certbot
fi
certbot --version

# 3. Сертификат на имя; при лимите — на IP (короткоживущий, продлевается сам дважды в день).
COMMON=(--nginx --non-interactive --agree-tos --register-unsafely-without-email --no-eff-email --redirect)
if certbot "${COMMON[@]}" -d "$HOST" 2>&1 | tee /tmp/certbot-host.log | tail -5 && grep -q "Successfully\|Certificate not yet due\|already" /tmp/certbot-host.log; then
  URL="https://$HOST/"
else
  if grep -qi "rateLimited\|too many" /tmp/certbot-host.log; then
    echo "Let's Encrypt упёрся в лимит для общего домена $HOST, беру сертификат на IP $IP"
  else
    echo "сертификат на $HOST не выдан, пробую IP $IP"
  fi
  if certbot "${COMMON[@]}" --preferred-profile shortlived -d "$IP" 2>&1 | tee /tmp/certbot-ip.log | tail -5 && grep -q "Successfully\|already" /tmp/certbot-ip.log; then
    URL="https://$IP/"
  else
    echo "HTTPS не настроен. Лог: /tmp/certbot-host.log и /tmp/certbot-ip.log"; exit 1
  fi
fi

systemctl list-timers --no-pager 2>/dev/null | grep -i certbot || true
nginx -t && systemctl reload nginx
echo "--- проверка"
curl -sI --max-time 10 "$URL" | head -1
curl -sI --max-time 10 "${URL}postneo/" | grep -i "^HTTP\|strict-transport" || true
echo "готово: сайт по адресу ${URL}postneo/"
