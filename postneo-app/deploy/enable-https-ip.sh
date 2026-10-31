#!/usr/bin/env bash
# POSTNEO · сертификат Let's Encrypt на сам IP-адрес (короткоживущий, 6 дней; certbot продлевает по таймеру, nginx перечитывает).
# Нужен там, где фильтр сети режет имена вроде sslip.io, но пропускает HTTPS по IP. После него все ссылки — https://<IP>/...
# Запуск:  curl -fsSL https://raw.githubusercontent.com/jEw1IK/tpn/main/postneo-app/deploy/enable-https-ip.sh | sudo bash
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "нужен root: sudo bash"; exit 1; }
IP="$(curl -fsS --max-time 10 https://api.ipify.org || hostname -I | awk '{print $1}')"
echo "IP: $IP"
NGX=""
for f in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
  [ -f "$f" ] && grep -q "postneo" "$f" && { NGX="$(readlink -f "$f")"; break; }
done
[ -n "$NGX" ] || { echo "конфиг nginx с сайтом не найден"; exit 1; }
command -v certbot >/dev/null || { echo "сначала deploy/enable-https.sh (ставит certbot)"; exit 1; }
certbot --version 2>&1 | grep -qE "certbot (5\.([4-9]|[1-9][0-9])|[6-9]\.)" || { echo "нужен certbot 5.4+: snap refresh certbot"; snap refresh certbot || true; }
if ss -ltnp | grep -q ':443 ' && ! ss -ltnp | grep ':443 ' | grep -q nginx; then echo "порт 443 занят не nginx"; ss -ltnp | grep ':443 '; exit 1; fi
grep -q "listen 443" "$NGX" || { echo "в $NGX нет блока с listen 443: сначала deploy/enable-https.sh"; exit 1; }

# 1. Папка для проверок ACME и location под неё в каждом блоке server с listen 80: так продление будет работать всегда.
WEBROOT=/var/www/letsencrypt; mkdir -p "$WEBROOT/.well-known/acme-challenge"; chmod -R a+rX /var/www/letsencrypt
if ! grep -q "acme-challenge" "$NGX"; then
  cp -a "$NGX" "$NGX.bak-ip-$(date +%Y%m%d%H%M%S)"
  python3 - "$NGX" "$WEBROOT" <<'PY'
import re,sys
f,root=sys.argv[1],sys.argv[2];s=open(f).read()
block=f'''
    # Let's Encrypt: проверка владения для сертификата на IP
    location ^~ /.well-known/acme-challenge/ {{ root {root}; default_type text/plain; }}
'''
starts=[m.start() for m in re.finditer(r'^\s*server\s*\{',s,re.M)]
for st in reversed(starts):
    end=s.find('\n}',st)
    seg=s[st:end]
    if end!=-1 and re.search(r'listen\s+80\b',seg) and 'acme-challenge' not in seg:
        # сразу после открывающей скобки, чтобы стоять раньше любых return
        brace=s.find('{',st)+1
        s=s[:brace]+block+s[brace:]
open(f,'w').write(s)
PY
  nginx -t && systemctl reload nginx && echo "nginx: добавлен location для проверок ACME"
fi
echo ok > "$WEBROOT/.well-known/acme-challenge/test"; curl -fsS "http://127.0.0.1/.well-known/acme-challenge/test" >/dev/null && echo "проверка ACME-пути: ок" || { echo "ACME-путь не отдаётся по http://127.0.0.1/.well-known/acme-challenge/test"; exit 1; }; rm -f "$WEBROOT/.well-known/acme-challenge/test"

# 2. Сертификат на IP: webroot, профиль shortlived. После каждого продления nginx перечитывает конфиг.
certbot certonly --webroot -w "$WEBROOT" --ip-address "$IP" --preferred-profile shortlived --cert-name "ip-$IP" \
  --non-interactive --agree-tos --register-unsafely-without-email --no-eff-email \
  --deploy-hook "systemctl reload nginx" 2>&1 | tee /tmp/certbot-ip.log | tail -6
LIVE="/etc/letsencrypt/live/ip-$IP"
[ -s "$LIVE/fullchain.pem" ] || { echo "сертификат на IP не получен, лог /tmp/certbot-ip.log"; exit 1; }

# 3. nginx: все ssl_certificate указывают на сертификат IP. Старый сертификат на имя удаляем, чтобы его продление не вернуло его в конфиг.
cp -a "$NGX" "$NGX.bak-ipcert-$(date +%Y%m%d%H%M%S)"
sed -i -E "s#(ssl_certificate\s+)/etc/letsencrypt/live/[^/]+/fullchain.pem#\1$LIVE/fullchain.pem#; s#(ssl_certificate_key\s+)/etc/letsencrypt/live/[^/]+/privkey.pem#\1$LIVE/privkey.pem#" "$NGX"
nginx -t && systemctl reload nginx
for name in $(certbot certificates 2>/dev/null | awk '/Certificate Name:/{print $3}' | grep -v "^ip-" || true); do
  certbot delete --cert-name "$name" --non-interactive >/dev/null 2>&1 && echo "удалён сертификат на имя: $name" || true
done

# 4. Проверка без -k: цепочка должна проходить обычную проверку.
sleep 1
if curl -fsS --max-time 10 -o /dev/null "https://$IP/postneo/"; then echo "https://$IP/postneo/ → ок, сертификат проходит проверку"; else echo "сертификат не проходит проверку: смотрите /tmp/certbot-ip.log и nginx -T | grep ssl_certificate"; fi
certbot certificates 2>/dev/null | grep -E "Certificate Name|Identifiers|Expiry" | sed 's/^ */  /'
systemctl list-timers --no-pager 2>/dev/null | grep -i certbot | head -1 || true
echo "готово. Ссылки: https://$IP/postneo/ · https://$IP/kart/ · https://$IP/download/"
