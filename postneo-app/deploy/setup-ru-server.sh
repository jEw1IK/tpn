#!/usr/bin/env bash
# POSTNEO · новый сервер с нуля: сайт из репозитория, отделение /kart, пакет для ПК /download, HTTPS на IP и на домен.
# Для переезда на сервер в России. Чистый Ubuntu 22.04 или 24.04, запуск под root.
#
#   curl -fsSL https://raw.githubusercontent.com/jEw1IK/tpn/main/postneo-app/deploy/setup-ru-server.sh | sudo bash
#   другой домен:  ... | sudo DOMAIN=example.ru bash
#
# Порядок переезда (подробно в deploy/MIGRATE-RU.md):
#   1. Этот скрипт на новом сервере: сайт и отделение открываются по https://<новый IP>/.
#   2. Перенос базы: deploy/import-db.sh.
#   3. В Reg.ru A-записи postneo.ru и www.postneo.ru → новый IP.
#   4. Этот скрипт ещё раз: он увидит домен и выпустит сертификат на него.
# Повторный запуск безопасен: конфиг nginx собирается заново, данные отделения не трогаются, сертификаты не перевыпускаются зря.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "нужен root: sudo bash"; exit 1; }
DOMAIN="${DOMAIN:-postneo.ru}"
REPO=https://github.com/jEw1IK/tpn.git
RAW=https://raw.githubusercontent.com/jEw1IK/tpn/main/postneo-app/deploy
SITE_ROOT=/opt/postneo/site; SITE=$SITE_ROOT/current; UPDATER=/usr/local/sbin/postneo-site-update
DL=/opt/postneo/download; WEBROOT=/var/www/letsencrypt
NGX=/etc/nginx/sites-available/postneo; HDR=/etc/nginx/snippets/postneo-headers.conf; TLS=/etc/nginx/snippets/postneo-tls.conf
GEN=/opt/postneo/nginx-postneo.py
export DEBIAN_FRONTEND=noninteractive

IP="$(curl -fsS --max-time 10 https://api.ipify.org 2>/dev/null || curl -fsS --max-time 10 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
[[ "$IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "не удалось узнать внешний IPv4 (получено: $IP)"; exit 1; }
echo "сервер: $IP · домен: $DOMAIN"

echo "1/8 пакеты"
apt-get update -qq
apt-get install -y -qq nginx git curl python3 ufw unattended-upgrades >/dev/null
# автоматические обновления безопасности
printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' > /etc/apt/apt.conf.d/20auto-upgrades
# certbot 5.4+ нужен для сертификата на IP; в apt он старый, поэтому snap
certbot_ok(){ command -v certbot >/dev/null && certbot --version 2>&1 | grep -qE "certbot (5\.([4-9]|[1-9][0-9])|[6-9]\.)"; }
if ! certbot_ok; then
  apt-get install -y -qq snapd >/dev/null 2>&1 || true
  snap install --classic certbot >/dev/null 2>&1 || snap refresh certbot >/dev/null 2>&1 || true
  [ -x /snap/bin/certbot ] && ln -sf /snap/bin/certbot /usr/bin/certbot
fi
IPCERT_SUPPORTED=0; certbot_ok && IPCERT_SUPPORTED=1
command -v certbot >/dev/null && certbot --version 2>&1 | sed 's/^/  /' || echo "  certbot не установлен: будет только http"

echo "2/8 сеть: открыты только SSH, 80 и 443"
SSHP="$(sshd -T 2>/dev/null | awk '$1=="port"{print $2}' | sort -u | tr '\n' ' ')"; [ -n "$SSHP" ] || SSHP=22
if echo " $SSHP " | grep -q " 443 "; then
  echo "SSH слушает порт 443, nginx не сможет его занять. Перенесите SSH (deploy/README.md, раздел про порт 443) и запустите снова."; exit 1
fi
for p in $SSHP; do ufw allow "$p/tcp" >/dev/null; done
ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
echo "  SSH: $SSHP · 80 · 443"

echo "3/8 сайт: релизами через postneo-site-update (тот же механизм, что cheatsheets/deploy/install-site.sh)"
# В веб-корень попадают только опубликованные файлы; каждая выкладка — отдельный релиз, nginx смотрит на ссылку current.
mkdir -p /opt/postneo "$SITE_ROOT"; chmod o+x /opt/postneo
GIT_DIR="$SITE_ROOT/repo.git"
[ -d "$GIT_DIR" ] || git clone -q --bare --depth 1 --branch main "$REPO" "$GIT_DIR"
chmod 700 "$GIT_DIR"
git --git-dir="$GIT_DIR" fetch -q --depth 1 --force origin "+refs/heads/main:refs/heads/main"
git --git-dir="$GIT_DIR" show "refs/heads/main:cheatsheets/deploy/update-site.sh" > "$UPDATER.new"
chmod 755 "$UPDATER.new" && mv -f "$UPDATER.new" "$UPDATER"
REPO="$REPO" BRANCH=main SITE_ROOT="$SITE_ROOT" SELF_PATH="$UPDATER" "$UPDATER" --force
[ -f "$SITE/postneo/index.html" ] || { echo "после выкладки нет $SITE/postneo/index.html"; exit 1; }
mkdir -p "$DL" "$WEBROOT/.well-known/acme-challenge"; chmod -R a+rX "$WEBROOT" "$DL"
cat > /etc/systemd/system/postneo-site-update.service <<UNIT
[Unit]
Description=POSTNEO: обновление сайта из GitHub (main)
Wants=network-online.target
After=network-online.target
[Service]
Type=oneshot
Environment=HOME=/root REPO=$REPO BRANCH=main SITE_ROOT=$SITE_ROOT SELF_PATH=$UPDATER
ExecStart=$UPDATER
Nice=10
PrivateTmp=yes
NoNewPrivileges=yes
UNIT
cat > /etc/systemd/system/postneo-site-update.timer <<UNIT
[Unit]
Description=POSTNEO: обновление сайта каждые 10 минут
[Timer]
OnBootSec=2min
OnUnitActiveSec=10min
RandomizedDelaySec=60
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload; systemctl enable -q --now postneo-site-update.timer
"$UPDATER" --status 2>/dev/null | head -3 | sed 's/^/  /' || true

echo "4/8 nginx"
mkdir -p /etc/nginx/snippets
cat > "$HDR" <<'H'
# POSTNEO: заголовки безопасности (подключаются и в каждом location со своими add_header)
add_header X-Content-Type-Options nosniff always;
add_header Referrer-Policy strict-origin-when-cross-origin always;
add_header X-Frame-Options SAMEORIGIN always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
add_header Strict-Transport-Security "max-age=31536000" always;
H
cat > "$TLS" <<'H'
# POSTNEO: только TLS 1.2 и 1.3
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
ssl_session_cache shared:postneo:10m;
ssl_session_timeout 1d;
ssl_session_tickets off;
H
# генератор рядом со скриптом (запуск из клона репозитория) или из GitHub (запуск через curl | bash)
SELF="${BASH_SOURCE[0]:-}"
if [ -n "$SELF" ] && [ -f "$SELF" ] && [ -f "$(dirname "$SELF")/nginx-postneo.py" ]; then cp "$(dirname "$SELF")/nginx-postneo.py" "$GEN"; else curl -fsSL "$RAW/nginx-postneo.py" -o "$GEN"; fi
IPCERT="/etc/letsencrypt/live/ip-$IP"; DOMCERT="/etc/letsencrypt/live/$DOMAIN"
IPV6=""; [ -s /proc/net/if_inet6 ] && IPV6="--ipv6"
DOMAIN_NAMES="$DOMAIN"
build(){ # собрать конфиг; при ошибке nginx -t вернуть прежний
  local bak=""; [ -f "$NGX" ] && { bak="$NGX.bak-$(date +%Y%m%d%H%M%S)"; cp -a "$NGX" "$bak"; }
  python3 "$GEN" "$NGX" --site "$SITE" --download "$DL" --webroot "$WEBROOT" --domain "$DOMAIN" --domain-names "$DOMAIN_NAMES" \
    --ip-cert "$IPCERT" --domain-cert "$DOMCERT" --headers "$HDR" --tls "$TLS" $IPV6
  ln -sf "$NGX" /etc/nginx/sites-enabled/postneo; rm -f /etc/nginx/sites-enabled/default
  if ! nginx -t 2>/tmp/postneo-nginx-t.log; then
    if [ -n "$IPV6" ] && grep -q "Address family not supported" /tmp/postneo-nginx-t.log; then IPV6=""; echo "  IPv6 недоступен, собираю без него"; build; return; fi
    cat /tmp/postneo-nginx-t.log; [ -n "$bak" ] && cp -a "$bak" "$NGX"; echo "nginx не принял конфиг, вернул прежний"; exit 1
  fi
  systemctl enable -q nginx; systemctl reload nginx 2>/dev/null || systemctl restart nginx
  ls -1t "$NGX".bak-* 2>/dev/null | tail -n +6 | xargs -r rm -f
}
build

echo "5/8 сертификат на IP $IP"
echo ok > "$WEBROOT/.well-known/acme-challenge/postneo-test"
curl -fsS --noproxy '*' -H "Host: $IP" "http://127.0.0.1/.well-known/acme-challenge/postneo-test" >/dev/null || { echo "nginx не отдаёт путь проверки Let's Encrypt"; exit 1; }
rm -f "$WEBROOT/.well-known/acme-challenge/postneo-test"
if [ -s "$IPCERT/fullchain.pem" ]; then echo "  уже есть, продлевается сам"
elif [ "$IPCERT_SUPPORTED" = 1 ]; then
  certbot certonly --webroot -w "$WEBROOT" --ip-address "$IP" --preferred-profile shortlived --cert-name "ip-$IP" \
    --non-interactive --agree-tos --register-unsafely-without-email --no-eff-email \
    --deploy-hook "systemctl reload nginx" > /tmp/certbot-ip.log 2>&1 && echo "  выпущен (живёт 6 дней, certbot продлевает сам)" || { echo "  не получен, лог /tmp/certbot-ip.log:"; tail -5 /tmp/certbot-ip.log | sed 's/^/    /'; }
else echo "  пропущен: нет certbot 5.4+ (snap недоступен). По IP сайт будет по http, домен — по https"; fi

echo "6/8 сертификат на домен $DOMAIN"
resolve(){ curl -fsS --max-time 10 "https://dns.google/resolve?name=$1&type=A" 2>/dev/null | python3 -c "import sys,json;print(' '.join(a['data'] for a in json.load(sys.stdin).get('Answer',[]) if a.get('type')==1))" 2>/dev/null || getent ahostsv4 "$1" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' '; }
NAMES=()
for n in "$DOMAIN" "www.$DOMAIN"; do
  R="$(resolve "$n")"
  if echo " $R " | grep -q " $IP "; then echo "  DNS: $n → $IP"; NAMES+=("$n"); else echo "  DNS: $n → ${R:-нет записи} (не этот сервер)"; fi
done
if [ "${NAMES[0]:-}" = "$DOMAIN" ]; then
  DOMAIN_NAMES="${NAMES[*]}"
  if [ -s "$DOMCERT/fullchain.pem" ] && [ "$(openssl x509 -in "$DOMCERT/fullchain.pem" -noout -ext subjectAltName 2>/dev/null | grep -o 'DNS:[^,]*' | wc -l)" -ge "${#NAMES[@]}" ]; then
    echo "  уже есть, продлевается сам"
  else
    ARGS=(); for n in "${NAMES[@]}"; do ARGS+=(-d "$n"); done
    certbot certonly --webroot -w "$WEBROOT" --cert-name "$DOMAIN" "${ARGS[@]}" --expand \
      --non-interactive --agree-tos --register-unsafely-without-email --no-eff-email \
      --deploy-hook "systemctl reload nginx" > /tmp/certbot-domain.log 2>&1 && echo "  выпущен на: ${NAMES[*]}" || { echo "  не получен, лог /tmp/certbot-domain.log:"; tail -5 /tmp/certbot-domain.log | sed 's/^/    /'; }
  fi
else
  echo "  домен пока смотрит на другой сервер: поменяйте A-записи в Reg.ru на $IP и запустите скрипт ещё раз"
fi
build

echo "7/8 отделение (install-kart-server.sh)"
curl -fsSL "$RAW/install-kart-server.sh" | bash

echo "8/8 проверка"
S=http; { [ -s "$IPCERT/fullchain.pem" ] || [ -s "$DOMCERT/fullchain.pem" ]; } && S=https
code(){ curl -sk -o /dev/null -w "%{http_code}" --noproxy '*' --max-time 15 "$@"; }
H=(-H "Host: $IP"); [ "$S" = https ] && H=()
BASE="$S://$IP"; [ "$S" = https ] && [ ! -s "$IPCERT/fullchain.pem" ] && BASE="https://$DOMAIN" && H=(--resolve "$DOMAIN:443:127.0.0.1")
ok=1
for t in "200 /" "200 /postneo/" "200 /postneo/calculator.html" "200 /kart/api/health" "404 /.git/config" "404 /postneo-app/package.json"; do
  want=${t%% *}; path=${t#* }; got=$(code "${H[@]}" "$BASE$path")
  [ "$got" = "$want" ] && echo "  ок   $got $path" || { echo "  СБОЙ $got $path (ждали $want)"; ok=0; }
done
echo
[ "$ok" = 1 ] && echo "Готово." || echo "Есть сбои — пришлите вывод целиком."
echo "  Сайт:       $BASE/postneo/"
echo "  Отделение:  $BASE/kart/"
[ -s "$DOMCERT/fullchain.pem" ] && echo "  Домен:      https://$DOMAIN/postneo/"
echo "Дальше: перенос базы — curl -fsSL $RAW/import-db.sh -o import-db.sh && sudo bash import-db.sh /путь/к/postneo-….sqlite"
