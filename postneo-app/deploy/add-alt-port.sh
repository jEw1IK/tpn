#!/usr/bin/env bash
# Запасной порт 8080 для сайта по http: проверить, режет ли фильтр больницы весь адрес или только порт 80.
# Запуск: curl -fsSL https://raw.githubusercontent.com/jEw1IK/tpn/main/postneo-app/deploy/add-alt-port.sh | sudo bash
set -euo pipefail
PORT="${1:-8080}"
NGX=""
for f in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do [ -f "$f" ] && grep -q "postneo" "$f" && { NGX="$(readlink -f "$f")"; break; }; done
[ -n "$NGX" ] || { echo "конфиг сайта не найден"; exit 1; }
if grep -qE "listen\s+$PORT;" "$NGX"; then echo "порт $PORT уже есть"; else
  cp -a "$NGX" "$NGX.bak-alt-$(date +%Y%m%d%H%M%S)"
  python3 - "$NGX" "$PORT" <<'PY'
import re,sys
f,port=sys.argv[1],sys.argv[2];s=open(f).read()
m=re.search(r'^(\s*)listen\s+80;\s*$',s,re.M)
if not m: sys.exit("нет строки listen 80;")
s=s[:m.end()]+f"\n{m.group(1)}listen {port};"+s[m.end():]
open(f,'w').write(s)
PY
  nginx -t && systemctl reload nginx && echo "nginx слушает $PORT"
fi
if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then ufw allow "$PORT"/tcp >/dev/null && echo "ufw: порт $PORT открыт"; fi
IP="$(hostname -I | awk '{print $1}')"
curl -s -o /dev/null -w "проверка: %{http_code} http://127.0.0.1:$PORT/postneo/\n" "http://127.0.0.1:$PORT/postneo/"
echo "откройте из больницы: http://$IP:$PORT/postneo/"
