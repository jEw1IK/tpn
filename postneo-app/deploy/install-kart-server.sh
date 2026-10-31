#!/usr/bin/env bash
# POSTNEO Карточки на сервере: node 22 + systemd + nginx /kart/. Без Docker.
# Запуск:   curl -fsSL https://raw.githubusercontent.com/jEw1IK/tpn/main/postneo-app/deploy/install-kart-server.sh | sudo bash
# Повтор = обновление до свежего main (если коммит не менялся, ничего не пересобирается). Данные в /var/lib/postneo-kart.
# Сначала включите HTTPS (deploy/enable-https.sh): без него вход не работает, cookie только по защищённому каналу.
set -euo pipefail
REPO=https://github.com/jEw1IK/tpn.git
ROOT=/opt/postneo/kart; SRC=$ROOT/src; REL=$ROOT/releases; CUR=$ROOT/current
DATA=/var/lib/postneo-kart; PORT=3001; BASE_PATH=/kart; SVC=postneo-kart
RAW=https://raw.githubusercontent.com/jEw1IK/tpn/main/postneo-app/deploy/install-kart-server.sh
[ "$(id -u)" = 0 ] || { echo "нужен root: sudo bash"; exit 1; }
export DEBIAN_FRONTEND=noninteractive

echo "1/6 node"
if ! node -v 2>/dev/null | grep -qE '^v(2[2-9]|[3-9][0-9])'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
command -v git >/dev/null || apt-get install -y -qq git >/dev/null
node -v

echo "2/6 пользователь и папки"
id -u postneo >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin -d "$DATA" postneo
mkdir -p "$DATA/backups" "$REL"; chown -R postneo:postneo "$DATA"; chmod 750 "$DATA"

echo "3/6 исходники"
if [ -d "$SRC/.git" ]; then git -C "$SRC" fetch -q --depth 1 origin main && git -C "$SRC" reset -q --hard origin/main
else rm -rf "$SRC" && git clone -q --depth 1 "$REPO" "$SRC"; fi
COMMIT="$(git -C "$SRC" rev-parse --short HEAD)"

if [ -e "$CUR/COMMIT" ] && [ "$(cat "$CUR/COMMIT")" = "$COMMIT" ] && [ "${FORCE:-0}" != 1 ]; then
  echo "4/6 сборка не нужна: уже стоит $COMMIT"
else
  echo "4/6 сборка $COMMIT (несколько минут на одном ядре)"
  cd "$SRC/postneo-app"
  npm ci --no-audit --no-fund --loglevel=error
  NEXT_TELEMETRY_DISABLED=1 BASE_PATH=$BASE_PATH npm run build > "$ROOT/build.log" 2>&1 || { tail -30 "$ROOT/build.log"; exit 1; }
  NEW="$REL/$(date +%Y%m%d-%H%M%S)-$COMMIT"; mkdir -p "$NEW/.next"
  cp -r .next/standalone/. "$NEW/"; cp -r .next/static "$NEW/.next/static"; cp -r public "$NEW/public"; cp -r scripts "$NEW/scripts"
  echo "$COMMIT" > "$NEW/COMMIT"; chown -R root:root "$NEW"; mkdir -p "$NEW/.next/cache"; chown postneo:postneo "$NEW/.next/cache"
  ln -sfn "$NEW" "$CUR.tmp" && mv -Tf "$CUR.tmp" "$CUR"
  ls -1dt "$REL"/* | tail -n +4 | xargs -r rm -rf
  rm -rf "$SRC/postneo-app/.next"
fi

echo "5/6 служба"
SECURE=0; grep -qs "listen 443" /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf 2>/dev/null && SECURE=1
cat > /etc/postneo-kart.env <<ENV
NODE_ENV=production
PORT=$PORT
HOSTNAME=127.0.0.1
DATA_DIR=$DATA
BASE_PATH=$BASE_PATH
COOKIE_SECURE=$SECURE
TZ=Europe/Moscow
NEXT_TELEMETRY_DISABLED=1
ENV
chmod 640 /etc/postneo-kart.env
cat > /etc/systemd/system/$SVC.service <<UNIT
[Unit]
Description=POSTNEO Карточки: база пациентов и листы назначений
After=network.target

[Service]
User=postneo
Group=postneo
WorkingDirectory=$CUR
EnvironmentFile=/etc/postneo-kart.env
ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DATA $CUR/.next/cache

[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/$SVC-backup.service <<UNIT
[Unit]
Description=POSTNEO Карточки: копия базы
[Service]
Type=oneshot
User=postneo
EnvironmentFile=/etc/postneo-kart.env
ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning $CUR/scripts/backup.mjs $DATA/backups
UNIT
cat > /etc/systemd/system/$SVC-backup.timer <<UNIT
[Unit]
Description=POSTNEO Карточки: копия базы каждую ночь
[Timer]
OnCalendar=*-*-* 03:17:00
Persistent=true
[Install]
WantedBy=timers.target
UNIT
cat > /etc/systemd/system/$SVC-update.service <<UNIT
[Unit]
Description=POSTNEO Карточки: обновление из GitHub (main)
[Service]
Type=oneshot
ExecStart=/bin/bash -c 'curl -fsSL $RAW | bash'
UNIT
cat > /etc/systemd/system/$SVC-update.timer <<UNIT
[Unit]
Description=POSTNEO Карточки: проверка обновлений каждые 15 минут
[Timer]
OnBootSec=5min
OnUnitActiveSec=15min
RandomizedDelaySec=2min
[Install]
WantedBy=timers.target
UNIT
cat > /etc/systemd/system/$SVC-mirror.service <<UNIT
[Unit]
Description=POSTNEO Карточки: зеркало пакета для ПК в /opt/postneo/download
[Service]
Type=oneshot
ExecStart=/bin/bash -c 'curl -fsSL https://raw.githubusercontent.com/jEw1IK/tpn/main/postneo-app/deploy/kart-mirror.sh | bash'
UNIT
cat > /etc/systemd/system/$SVC-mirror.timer <<UNIT
[Unit]
Description=POSTNEO Карточки: проверка нового пакета для ПК каждые 15 минут
[Timer]
OnBootSec=3min
OnUnitActiveSec=15min
RandomizedDelaySec=2min
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable -q $SVC $SVC-backup.timer $SVC-update.timer $SVC-mirror.timer
systemctl restart $SVC
systemctl start $SVC-backup.timer $SVC-update.timer $SVC-mirror.timer
mkdir -p /opt/postneo/download

echo "6/6 nginx"
NGX=""
for f in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
  [ -f "$f" ] && grep -q "postneo" "$f" && { NGX="$(readlink -f "$f")"; break; }
done
# короткие адреса: только /calculator (корень принадлежит странице сервера). Заодно лечим прежние вставки.
if [ -n "$NGX" ]; then
  BAKH="$NGX.bak-heal-$(date +%Y%m%d%H%M%S)"; cp -a "$NGX" "$BAKH"
  curl -fsSL https://raw.githubusercontent.com/jEw1IK/tpn/main/postneo-app/deploy/nginx-heal.py -o /tmp/postneo-nginx-heal.py && python3 /tmp/postneo-nginx-heal.py "$NGX"
  if nginx -t 2>/dev/null; then systemctl reload nginx; else echo "nginx: конфиг не принят после лечения, возвращаю копию"; cp -a "$BAKH" "$NGX"; fi
fi
if [ -n "$NGX" ] && ! grep -q "location /download/" "$NGX"; then
  cp -a "$NGX" "$NGX.bak-dl-$(date +%Y%m%d%H%M%S)"
  python3 - "$NGX" <<'PYNGX'
import re,sys
f=sys.argv[1];s=open(f).read()
block="""
    # POSTNEO: пакет для ПК и его обновления, по обычному http тоже (больничные сети не всегда пускают https)
    location /download/ {
        alias /opt/postneo/download/;
        autoindex off;
        add_header Cache-Control "no-cache" always;
    }
"""
# в каждый блок server, с конца, чтобы смещения не сбивались
starts=[m.start() for m in re.finditer(r'^\s*server\s*\{',s,re.M)]
for st in reversed(starts):
    end=s.find('\n}',st)
    if end!=-1 and 'location /download/' not in s[st:end]:
        s=s[:end]+block+s[end:]
open(f,'w').write(s)
PYNGX
  nginx -t && systemctl reload nginx
fi
# ранняя версия ставила редирект /kart → /kart/, а приложение отвечает обратным редиректом: убираем петлю
if [ -n "$NGX" ] && grep -q "location = /kart { return 301 /kart/; }" "$NGX"; then
  sed -i '/location = \/kart { return 301 \/kart\/; }/d; s#location /kart/ {#location /kart {#' "$NGX" && nginx -t && systemctl reload nginx && echo "nginx: петля /kart исправлена"
fi
if [ -n "$NGX" ] && ! grep -q "location /kart" "$NGX"; then
  cp -a "$NGX" "$NGX.bak-kart-$(date +%Y%m%d%H%M%S)"
  python3 - "$NGX" "$PORT" <<'PY'
import re,sys
f,port=sys.argv[1],sys.argv[2];s=open(f).read()
block=f'''
    # POSTNEO Карточки: приложение на node, слушает только 127.0.0.1
    location /kart {{
        proxy_pass http://127.0.0.1:{port};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        client_max_body_size 5m;
    }}
'''
# в блок с listen 443, если он есть, иначе в последний блок server
blocks=[m.start() for m in re.finditer(r'^\s*server\s*\{',s,re.M)]
target=None
for b in blocks:
    end=s.find('\n}',b)
    if 'listen 443' in s[b:end]: target=end
if target is None: target=s.rfind('\n}')
s=s[:target]+block+s[target:]
open(f,'w').write(s)
PY
  nginx -t && systemctl reload nginx
fi

for i in $(seq 1 40); do curl -fsS "http://127.0.0.1:$PORT$BASE_PATH/api/health" >/dev/null 2>&1 && break; sleep 0.5; done
echo "--- состояние"
systemctl is-active $SVC
curl -sS "http://127.0.0.1:$PORT$BASE_PATH/api/health"; echo
systemctl start $SVC-mirror.service || true
echo "cookie secure: $SECURE (1 = только по HTTPS)"
echo "пакет для ПК: http://<сервер>/download/"
echo "готово: откройте https://<имя сервера>/kart/ — первый вход создаст администратора"
