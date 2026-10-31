#!/usr/bin/env bash
# POSTNEO · свой домен рядом с адресом по IP. Сертификат на домен (и www) через webroot, отдельный блок server для домена:
# браузер, пришедший по имени, получает сертификат домена, а пришедший по IP — прежний сертификат на IP. Ничего не ломается.
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
grep -q "listen 443" "$NGX" || { echo "в $NGX нет блока с listen 443: сначала deploy/enable-https-ip.sh"; exit 1; }

# 0. Конфиг nginx должен проходить проверку до любых изменений. Прежние вставки установщика лечатся здесь же.
curl -fsSL https://raw.githubusercontent.com/jEw1IK/tpn/main/postneo-app/deploy/nginx-heal.py -o /tmp/postneo-nginx-heal.py
cp -a "$NGX" "$NGX.bak-preheal-$(date +%Y%m%d%H%M%S)"; python3 /tmp/postneo-nginx-heal.py "$NGX"
if ! nginx -t; then echo "конфиг nginx не проходит проверку и до домена — пришлите вывод nginx -t"; exit 1; fi
systemctl reload nginx

# 1. DNS: домен должен указывать на этот сервер (проверяем через публичный DNS, локальный кэш может помнить «нет такого»).
resolve(){ curl -fsS --max-time 10 "https://dns.google/resolve?name=$1&type=A" | python3 -c "import sys,json;print(' '.join(a['data'] for a in json.load(sys.stdin).get('Answer',[]) if a.get('type')==1))" 2>/dev/null || true; }
NAMES=()
for n in "$DOMAIN" "www.$DOMAIN"; do
  R="$(resolve "$n")"
  if echo " $R " | grep -q " $IP "; then echo "DNS: $n → $IP"; NAMES+=("$n"); else echo "DNS: $n → ${R:-пока нет}"; fi
done
[ "${NAMES[0]:-}" = "$DOMAIN" ] || { echo "A-запись $DOMAIN ещё не видна: подождите 10–30 минут и повторите"; exit 1; }

# 2. Путь для проверок Let's Encrypt (тот же, что для сертификата на IP).
WEBROOT=/var/www/letsencrypt
EXISTING="$(grep -A3 "acme-challenge" "$NGX" 2>/dev/null | grep -oE 'root\s+[^;]+' | head -1 | awk '{print $2}' || true)"
[ -n "$EXISTING" ] && WEBROOT="$EXISTING"
mkdir -p "$WEBROOT/.well-known/acme-challenge"; chmod -R a+rX "$WEBROOT"
grep -q "acme-challenge" "$NGX" || { echo "в конфиге нет location для ACME: сначала deploy/enable-https-ip.sh"; exit 1; }

# 3. Сертификат на домен (90 дней, продлевается сам), после продления nginx перечитывает конфиг.
ARGS=(); for n in "${NAMES[@]}"; do ARGS+=(-d "$n"); done
certbot certonly --webroot -w "$WEBROOT" --cert-name "$DOMAIN" "${ARGS[@]}" \
  --non-interactive --agree-tos --register-unsafely-without-email --no-eff-email \
  --deploy-hook "systemctl reload nginx" 2>&1 | tee /tmp/certbot-domain.log | tail -6
LIVE="/etc/letsencrypt/live/$DOMAIN"
[ -s "$LIVE/fullchain.pem" ] || { echo "сертификат не выдан, лог /tmp/certbot-domain.log"; exit 1; }

# 4. Отдельный блок server для домена: копия блока с listen 443, своё имя и свой сертификат.
#    Повторный запуск пересобирает блок заново (старый удаляется), так что скрипт чинит и сам себя.
BAK="$NGX.bak-domain-$(date +%Y%m%d%H%M%S)"; cp -a "$NGX" "$BAK"
python3 - "$NGX" "$DOMAIN" <<'PYDEL'
import re,sys
f,domain=sys.argv[1],sys.argv[2];s=open(f).read()
m=re.search(r'\n*[ \t]*server[ \t]*\{\n[ \t]*# POSTNEO domain '+re.escape(domain)+r':',s)
if m:
    st=m.start();j=s.index('{',st);depth=0
    while j<len(s):
        if s[j]=='{':depth+=1
        elif s[j]=='}':
            depth-=1
            if depth==0:break
        j+=1
    s=s[:st]+s[j+1:];open(f,'w').write(s.rstrip()+'\n');print('прежний блок домена убран, собираю заново')
PYDEL
if true; then
  python3 - "$NGX" "$DOMAIN" "$LIVE" "${NAMES[*]}" <<'PY'
import re,sys
f,domain,live,names=sys.argv[1],sys.argv[2],sys.argv[3],sys.argv[4]
s=open(f).read()
def blocks(text):
    out=[];i=0
    for m in re.finditer(r'^[ \t]*server[ \t]*\{',text,re.M):
        st=m.start();depth=0;j=text.index('{',st)
        while j<len(text):
            if text[j]=='{':depth+=1
            elif text[j]=='}':
                depth-=1
                if depth==0:break
            j+=1
        out.append((st,j+1))
    return out
cand=[(a,b) for a,b in blocks(s) if 'listen 443' in s[a:b] and 'postneo' in s[a:b]]
if not cand: sys.exit('не найден блок server с listen 443 и сайтом postneo')
a,b=cand[0];blk=s[a:b]
blk=re.sub(r'^([ \t]*)server_name[^;]*;[^\n]*\n',lambda m:'',blk,flags=re.M)
blk=re.sub(r'(server[ \t]*\{)',lambda m:m.group(1)+f'\n    # POSTNEO domain {domain}: свой сертификат, выбирается по имени (SNI)\n    server_name {names};',blk,count=1)
blk=re.sub(r'(ssl_certificate[ \t]+)[^;]+;',rf'\g<1>{live}/fullchain.pem;',blk)
blk=re.sub(r'(ssl_certificate_key[ \t]+)[^;]+;',rf'\g<1>{live}/privkey.pem;',blk)
# параметры listen (default_server, reuseport, backlog, ipv6only) задаются один раз на адрес: в копии только простые строки
blk=re.sub(r'^([ \t]*)listen[ \t]+\[::\]:443[^;]*;[^\n]*$',r'\1listen [::]:443 ssl;',blk,flags=re.M)
blk=re.sub(r'^([ \t]*)listen[ \t]+(?!\[)[^;]*443[^;]*;[^\n]*$',r'\1listen 443 ssl;',blk,flags=re.M)
open(f,'w').write(s.rstrip()+'\n\n'+blk+'\n')
PY
fi
if ! nginx -t; then
  echo "nginx не принял блок домена — возвращаю прежний конфиг, сайт по IP работает как раньше"
  cp -a "$BAK" "$NGX"; nginx -t && systemctl reload nginx; exit 1
fi
systemctl reload nginx
sleep 1

# 5. Проверка: по имени — сертификат домена, по IP — прежний.
curl -fsS --max-time 10 -o /dev/null --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/postneo/" && echo "https://$DOMAIN/postneo/ → ок, сертификат домена" || echo "https://$DOMAIN/postneo/ не открылся: nginx -T | grep -n ssl_certificate"
curl -fsS --max-time 10 -o /dev/null "https://$IP/postneo/" && echo "https://$IP/postneo/ → ок, сертификат на IP на месте" || echo "внимание: https://$IP/postneo/ перестал проходить проверку"
certbot certificates 2>/dev/null | grep -E "Certificate Name|Identifiers|Expiry" | sed 's/^ */  /'
echo "готово. Ссылки: https://$DOMAIN/postneo/ · https://$DOMAIN/kart/ · https://$DOMAIN/download/"
