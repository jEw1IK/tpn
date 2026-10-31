#!/usr/bin/env bash
# POSTNEO · nginx: сжатие и кэш статики. Идемпотентно, с резервной копией и откатом.
# Запуск на сервере:  curl -fsSL https://raw.githubusercontent.com/jEw1IK/tpn/main/postneo-app/deploy/tune-nginx.sh | sudo bash
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "нужен root: sudo bash tune-nginx.sh"; exit 1; }
command -v nginx >/dev/null || { echo "nginx не установлен"; exit 1; }

# 1. Конфиг сайта: тот, что раздаёт /postneo/.
NGX=""
for f in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
  [ -f "$f" ] && grep -q "postneo" "$f" && { NGX="$(readlink -f "$f")"; break; }
done
[ -n "$NGX" ] || { [ -f /etc/nginx/sites-enabled/default ] && NGX="$(readlink -f /etc/nginx/sites-enabled/default)"; }
[ -n "$NGX" ] || { echo "конфиг сайта не найден в sites-enabled и conf.d"; exit 1; }

# 2. Корень сайта: папка, где лежат version.json и postneo/.
ROOT="$(awk '$1=="root"{gsub(";","",$2);print $2;exit}' "$NGX" || true)"
[ -n "$ROOT" ] || ROOT="$(nginx -T 2>/dev/null | awk '$1=="root"{gsub(";","",$2);print $2;exit}')"
[ -d "$ROOT/postneo/nx" ] || { echo "в корне $ROOT нет postneo/nx — проверьте директиву root в $NGX"; exit 1; }
echo "конфиг: $NGX"; echo "корень: $ROOT"

# 3. Вставка блока перед закрывающей скобкой server.
if grep -q "POSTNEO static" "$NGX"; then
  echo "блок уже есть, конфиг не трогаю"
else
  BAK="$NGX.bak-$(date +%Y%m%d%H%M%S)"; cp -a "$NGX" "$BAK"; echo "резервная копия: $BAK"
  python3 - "$NGX" "$ROOT" <<'PY'
import sys
f,root=sys.argv[1],sys.argv[2];s=open(f).read()
block=f'''
    # POSTNEO static: сжатие текста и долгий кэш файлов с хэшем в имени
    gzip on;
    gzip_vary on;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/javascript application/javascript application/json image/svg+xml application/wasm;
    location ^~ /postneo/nx/ {{
        root {root};
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }}
    location ^~ /postneo/images/ {{
        root {root};
        expires 30d;
        add_header Cache-Control "public";
    }}
    location ^~ /postneo/examples/ {{
        root {root};
        expires 7d;
        add_header Cache-Control "public";
    }}
'''
i=s.rfind('}')
open(f,'w').write(s[:i]+block+s[i:])
PY
  if nginx -t; then
    systemctl reload nginx; echo "nginx перечитал конфиг"
  else
    cp -a "$BAK" "$NGX"; echo "nginx -t не прошёл, конфиг возвращён из копии"; exit 1
  fi
fi

# 4. Проверка на самом сервере.
JS="$(ls "$ROOT/postneo/nx/static/chunks" | grep -m1 '\.js$' || true)"
if [ -n "$JS" ]; then
  RAW=$(stat -c %s "$ROOT/postneo/nx/static/chunks/$JS")
  curl -s -o /dev/null -H 'Accept-Encoding: gzip' -w "скрипт $JS: %{http_code}, по сети %{size_download} байт вместо $RAW\n" "http://127.0.0.1/postneo/nx/static/chunks/$JS"
  curl -sI -H 'Accept-Encoding: gzip' "http://127.0.0.1/postneo/nx/static/chunks/$JS" | grep -i -E "content-encoding|cache-control" | sed 's/^/  /'
fi
curl -sI "http://127.0.0.1/postneo/calculator.html" | grep -i cache-control | sed 's/^/  html: /'
echo "готово"
