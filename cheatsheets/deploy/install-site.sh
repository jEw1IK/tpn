#!/usr/bin/env bash
# Раздать сайт ПОСТ·НЕО с этого же сервера через nginx: POSTNEO (калькулятор
# питания), шкалы, седация, энтеральное питание, шпаргалки и главная.
#
#   sudo ./install-site.sh                 # по IP, http://IP/postneo/
#   sudo ./install-site.sh мой.домен.ru    # по домену + сертификат Let's Encrypt
#
# Код берётся из того же каталога, что и у бота (/opt/postneo/app): если бот
# уже стоит, скрипт просто обновит код и настроит nginx. Повторный запуск —
# обновление. Ничего из бота (токен, сервис, кэш) не трогает.
set -euo pipefail

REPO="${REPO:-https://github.com/jEw1IK/tpn.git}"
BRANCH="${BRANCH:-main}"
TARGET="${TARGET:-/opt/postneo}"
DOMAIN="${1:-}"
SITE="${SITE:-postneo-site}"

die() { printf '\033[31mОшибка:\033[0m %s\n' "$1" >&2; exit 1; }
ok()  { printf '\033[32m✓\033[0m %s\n' "$1"; }
step(){ printf '\n\033[1m%s\033[0m\n' "$1"; }

[ "$(id -u)" = "0" ] || die "запускай через sudo"
command -v git >/dev/null || die "нужен git: apt install -y git"

APP="$TARGET/app"

step "1. Код"
mkdir -p "$TARGET"
if [ -d "$APP/.git" ]; then
    git -C "$APP" remote set-url origin "$REPO"
    git -C "$APP" fetch --depth 1 origin "$BRANCH" --quiet
    git -C "$APP" checkout -q -B "$BRANCH" "origin/$BRANCH"
    ok "обновлено до свежей ветки $BRANCH"
else
    git clone --depth 1 --branch "$BRANCH" --quiet "$REPO" "$APP"
    ok "склонировано в $APP"
fi
[ -f "$APP/postneo/index.html" ] || die "в $APP нет postneo/index.html — ветка $BRANCH без сборки сайта?"
# nginx работает от www-data: каталогу нужны права на чтение и проход.
chmod o+rx "$TARGET" "$APP"
find "$APP" -type d -exec chmod o+rx {} + 2>/dev/null || true
find "$APP" -type f -exec chmod o+r {} + 2>/dev/null || true
ok "права на чтение для nginx"

step "2. nginx"
if ! command -v nginx >/dev/null; then
    apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx >/dev/null
    ok "nginx установлен"
else
    ok "nginx уже стоит"
fi

CONF="/etc/nginx/sites-available/$SITE"
SERVER_NAME="${DOMAIN:-_}"
# IPv6 слушаем только там, где он есть, иначе nginx не стартует
LISTEN6=""
[ -s /proc/net/if_inet6 ] && LISTEN6="    listen [::]:80;"
cat > "$CONF" <<EOF
# ПОСТ·НЕО — статический сайт. Создано install-site.sh, правки затрёт повторный запуск.
server {
    listen 80;
$LISTEN6
    server_name $SERVER_NAME;

    root $APP;
    index index.html;

    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    # Нужен certbot для выпуска сертификата
    location /.well-known/acme-challenge/ { root /var/www/html; }

    # Страницы часто правятся — не кэшируем
    set \$nocache "no-cache, must-revalidate";

    # Сборка POSTNEO: главная + калькулятор питания
    location = /postneo { return 301 /postneo/; }
    location /postneo/ {
        add_header Cache-Control \$nocache always;
        try_files \$uri \$uri/index.html =404;
    }

    # Мини-приложения бота
    location ~ ^/(scales|sedation|enteral)/ {
        add_header Cache-Control \$nocache always;
        try_files \$uri \$uri/ =404;
    }

    # Шпаргалки: страница со списком и PDF, исходники сборки не отдаём
    location = /cheatsheets/ { add_header Cache-Control \$nocache always; try_files /cheatsheets/index.html =404; }
    location = /cheatsheets  { return 301 /cheatsheets/; }
    location /cheatsheets/pdf/ {
        add_header Cache-Control "public, max-age=3600" always;
        try_files \$uri =404;
    }
    location /cheatsheets/ { return 404; }

    # Главная с перечнем инструментов
    location = / { add_header Cache-Control \$nocache always; try_files /index.html =404; }
    location = /index.html { add_header Cache-Control \$nocache always; try_files /index.html =404; }

    # Всё остальное в репозитории (код бота, конфиги) наружу не отдаём
    location / { return 404; }
}
EOF
ln -sf "$CONF" "/etc/nginx/sites-enabled/$SITE"
# Дефолтная страница nginx на том же порту мешает server_name "_"
[ -z "$DOMAIN" ] && rm -f /etc/nginx/sites-enabled/default
nginx -t 2>&1 | grep -v 'syntax is ok' || true
nginx -t >/dev/null 2>&1 || die "nginx не принял конфиг $CONF (см. выше)"
systemctl enable --now nginx >/dev/null 2>&1 || true
systemctl reload nginx
ok "конфиг $CONF включён"

if [ -n "$DOMAIN" ]; then
    step "3. Сертификат для $DOMAIN"
    if ! command -v certbot >/dev/null; then
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
    fi
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect \
        || die "certbot не выпустил сертификат: проверь, что $DOMAIN указывает на этот сервер"
    ok "HTTPS включён"
    URL="https://$DOMAIN"
else
    IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
    URL="http://${IP:-IP-сервера}"
fi

step "Готово"
cat <<EOF
  Сайт:         $URL/
  Калькулятор:  $URL/postneo/calculator.html
  Шкалы:        $URL/scales/   Седация: $URL/sedation/   Энтерально: $URL/enteral/

  Обновить:     sudo $0 ${DOMAIN}
  Конфиг:       $CONF
EOF
[ -z "$DOMAIN" ] && cat <<'EOF'

  Без домена сайт работает по HTTP. Telegram открывает мини-приложения только
  по HTTPS с валидным сертификатом, поэтому для кнопок бота оставь адреса
  GitHub Pages либо запусти скрипт с доменом, направленным на этот сервер.
EOF
exit 0
