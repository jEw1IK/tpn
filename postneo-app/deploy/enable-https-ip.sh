#!/usr/bin/env bash
# POSTNEO · сертификат Let's Encrypt на сам IP-адрес (короткоживущий, продлевается certbot сам раз в несколько дней).
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
if ss -ltnp | grep -q ':443 ' && ! ss -ltnp | grep ':443 ' | grep -q nginx; then echo "порт 443 занят не nginx"; ss -ltnp | grep ':443 '; exit 1; fi

# 1. IP как server_name рядом с каждым существующим server_name: certbot находит блоки по нему.
if ! grep -qE "server_name[^;]*\b$IP\b" "$NGX"; then
  cp -a "$NGX" "$NGX.bak-ip-$(date +%Y%m%d%H%M%S)"
  python3 - "$NGX" "$IP" <<'PY'
import re,sys
f,ip=sys.argv[1],sys.argv[2];s=open(f).read()
out=[];seen_block=False
for line in s.split('\n'):
    out.append(line)
    m=re.match(r'^(\s*)server_name\s+([^;]+);\s*$',line)
    if m and ip not in m.group(2) and '_' != m.group(2).strip():
        out.append(f"{m.group(1)}server_name {ip};")
open(f,'w').write('\n'.join(out))
PY
  nginx -t && systemctl reload nginx && echo "server_name $IP добавлен"
fi

# 2. Сертификат на IP: профиль shortlived (6 дней), certbot продлевает по таймеру дважды в день.
certbot --nginx --non-interactive --agree-tos --register-unsafely-without-email --no-eff-email --no-redirect \
  --preferred-profile shortlived --cert-name "ip-$IP" -d "$IP" 2>&1 | tee /tmp/certbot-ip.log | tail -6
grep -q "Successfully\|Certificate not yet due\|already" /tmp/certbot-ip.log || { echo "сертификат на IP не выдан, лог /tmp/certbot-ip.log"; exit 1; }

# 3. Старый сертификат на имя sslip больше не нужен: иначе при его продлении certbot вернёт его в тот же блок.
for name in $(certbot certificates 2>/dev/null | awk '/Certificate Name:/{print $3}' | grep -v "^ip-" || true); do
  certbot delete --cert-name "$name" --non-interactive >/dev/null 2>&1 && echo "удалён сертификат $name" || true
done
nginx -t && systemctl reload nginx

# 4. Проверка снаружи: сертификат должен проходить обычную проверку, без -k.
sleep 1
curl -s --max-time 10 -o /dev/null -w "https://$IP/postneo/ → %{http_code} (проверка сертификата пройдена)\n" "https://$IP/postneo/" || echo "сертификат не проходит проверку: смотрите /tmp/certbot-ip.log"
certbot certificates 2>/dev/null | grep -E "Certificate Name|Identifiers|Expiry" | sed 's/^ */  /'
echo "готово. Ссылки: https://$IP/postneo/ · https://$IP/kart/ · https://$IP/download/"
