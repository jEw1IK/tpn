#!/usr/bin/env bash
# POSTNEO · свой домен: сертификат Let's Encrypt на домен (и www), nginx отвечает по нему, старые имена остаются как запасные.
# Запуск:  curl -fsSL https://raw.githubusercontent.com/jEw1IK/tpn/main/postneo-app/deploy/enable-domain.sh | sudo bash -s -- postneo.ru
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "нужен root: sudo bash"; exit 1; }
DOMAIN="${1:-}"; [ -n "$DOMAIN" ] || { echo "укажите домен: ... | sudo bash -s -- postneo.ru"; exit 1; }
IP="$(curl -fsS --max-time 10 https://api.ipify.org || hostname -I | awk '{print $1}')"
echo "домен: $DOMAIN, сервер: $IP"
NGX=""
for f in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
  [ -f "$f" ] && grep -q "postneo" "$f" && { NGX="$(readlink -f "$f")"; break; }
done
[ -n "$NGX" ] || { echo "конфиг nginx с сайтом не найден"; exit 1; }
command -v certbot >/dev/null || { echo "сначала deploy/enable-https.sh (ставит certbot)"; exit 1; }

# 1. DNS: домен должен указывать на этот сервер, иначе Let's Encrypt не выдаст сертификат.
NAMES=("$DOMAIN"); OK=1
for n in "$DOMAIN" "www.$DOMAIN"; do
  R="$(getent ahostsv4 "$n" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ' || true)"
  if echo " $R" | grep -q " $IP"; then echo "DNS: $n → $IP"; [ "$n" = "www.$DOMAIN" ] && NAMES+=("www.$DOMAIN")
  else echo "DNS: $n → ${R:-ничего}"; [ "$n" = "$DOMAIN" ] && OK=0; fi
done
[ "$OK" = 1 ] || { echo "A-запись $DOMAIN ещё не указывает на $IP: подождите 10–30 минут после сохранения записи и повторите"; exit 1; }

# 2. Имя домена в каждом блоке server с server_name.
if ! grep -qE "server_name[^;]*\b$DOMAIN\b" "$NGX"; then
  cp -a "$NGX" "$NGX.bak-domain-$(date +%Y%m%d%H%M%S)"
  python3 - "$NGX" "$DOMAIN" <<'PY'
import re,sys
f,d=sys.argv[1],sys.argv[2];s=open(f).read()
out=[];done=set()
for line in s.split('\n'):
    out.append(line)
    m=re.match(r'^(\s*)server_name\s+([^;]+);\s*$',line)
    if m and m.group(2).strip()!='_' and d not in m.group(2):
        out.append(f"{m.group(1)}server_name {d} www.{d};")
open(f,'w').write('\n'.join(out))
PY
  nginx -t && systemctl reload nginx && echo "server_name $DOMAIN добавлен"
fi

# 3. Сертификат через nginx-плагин: он сам пройдёт проверку и пропишет пути в блок с listen 443.
ARGS=(); for n in "${NAMES[@]}"; do ARGS+=(-d "$n"); done
certbot --nginx --non-interactive --agree-tos --register-unsafely-without-email --no-eff-email --no-redirect \
  --cert-name "$DOMAIN" "${ARGS[@]}" 2>&1 | tee /tmp/certbot-domain.log | tail -6
grep -q "Successfully\|Certificate not yet due\|already" /tmp/certbot-domain.log || { echo "сертификат не выдан, лог /tmp/certbot-domain.log"; exit 1; }
nginx -t && systemctl reload nginx

# 4. Проверка и подсказка про старые сертификаты.
sleep 1
curl -fsS --max-time 10 -o /dev/null "https://$DOMAIN/postneo/" && echo "https://$DOMAIN/postneo/ → ок, сертификат проходит проверку" || echo "https://$DOMAIN/postneo/ не открылся: nginx -T | grep -n ssl_certificate"
certbot certificates 2>/dev/null | grep -E "Certificate Name|Identifiers|Expiry" | sed 's/^ */  /'
echo "готово. Ссылки: https://$DOMAIN/postneo/ · https://$DOMAIN/kart/ · https://$DOMAIN/download/"
echo "Карточки на сервере: COOKIE_SECURE уже 1; пакет для ПК начнёт искать обновления по домену после следующей публикации."
