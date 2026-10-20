#!/usr/bin/env bash
# Демо «Карточек» на нашем сервере по адресу http://IP/kart/ рядом с сайтом.
# Запуск на сервере:  curl -fsSL https://raw.githubusercontent.com/jEw1IK/tpn/main/postneo-app/deploy/install-kart-demo.sh | sudo bash
# Повторный запуск = обновление до свежего main. Данные в /opt/postneo/kart/data остаются.
# Только для демонстрации с вымышленными пациентами: реальные данные — в больнице, см. deploy/README.md.
set -euo pipefail
REPO=https://github.com/jEw1IK/tpn.git
ROOT=/opt/postneo/kart
BASE_PATH=/kart

[ "$(id -u)" = 0 ] || { echo "нужен root: sudo bash"; exit 1; }
if ! command -v docker >/dev/null 2>&1; then
  echo "Ставлю Docker…"; curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq docker-compose-plugin; }
command -v git >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq git; }

mkdir -p "$ROOT"
if [ -d "$ROOT/src/.git" ]; then git -C "$ROOT/src" fetch -q --depth 1 origin main && git -C "$ROOT/src" reset -q --hard origin/main
else rm -rf "$ROOT/src" && git clone -q --depth 1 "$REPO" "$ROOT/src"; fi
APP="$ROOT/src/postneo-app"
mkdir -p "$ROOT/data"
cat > "$APP/.env" <<EOF
BASE_PATH=$BASE_PATH
PORT=3000
COOKIE_SECURE=0
TZ=Europe/Moscow
EOF
# данные живут вне клона, чтобы обновление их не трогало
sed -i "s#- ./data:/data#- $ROOT/data:/data#" "$APP/docker-compose.yml"
( cd "$APP" && docker compose up -d --build )

# nginx: /kart/ → контейнер; конфиг сайта остаётся как есть, добавляем include
NGX=/etc/nginx/sites-available/postneo-site
if [ -f "$NGX" ] && ! grep -q "location /kart/" "$NGX"; then
  python3 - "$NGX" <<'PY'
import re,sys
f=sys.argv[1];s=open(f).read()
block='''
    location = /kart { return 301 /kart/; }
    location /kart/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
'''
i=s.rfind('}')
open(f,'w').write(s[:i]+block+s[i:])
PY
  nginx -t && systemctl reload nginx
fi
sleep 5
echo "Проверка: $(curl -s http://127.0.0.1:3000/kart/api/health || true)"
echo "Готово: http://$(curl -s -4 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')/kart/"
echo "Первый вход заведёт администратора. Обновить: запустить эту же команду ещё раз."
