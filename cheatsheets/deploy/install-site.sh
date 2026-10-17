#!/usr/bin/env bash
# Раздать сайт ПОСТ·НЕО с этого же сервера через nginx: POSTNEO (калькулятор
# питания), шкалы, седация, энтеральное питание, шпаргалки и главная.
#
#   sudo ./install-site.sh                 # по IP, http://IP/postneo/
#   sudo ./install-site.sh мой.домен.ru    # по домену + сертификат Let's Encrypt
#   AUTO_UPDATE=0 sudo ./install-site.sh   # без автообновления по таймеру
#
# Сайт живёт в своём каталоге /opt/postneo/site, отдельно от клона бота
# /opt/postneo/app: обновление сайта не трогает код, токен и сервис бота.
# Каждая выкладка — отдельный релиз, nginx смотрит на ссылку current, откат
# одной командой. По умолчанию таймер раз в 10 минут забирает свежий main.
# Повторный запуск установщика безопасен и тоже обновляет сайт.
set -euo pipefail

REPO="${REPO:-https://github.com/jEw1IK/tpn.git}"
BRANCH="${BRANCH:-main}"
TARGET="${TARGET:-/opt/postneo}"
DOMAIN="${1:-}"
SITE="${SITE:-postneo-site}"
SITE_ROOT="${SITE_ROOT:-$TARGET/site}"
AUTO_UPDATE="${AUTO_UPDATE:-1}"
UPDATER="/usr/local/sbin/postneo-site-update"

die() { printf '\033[31mОшибка:\033[0m %s\n' "$1" >&2; exit 1; }
ok()  { printf '\033[32m✓\033[0m %s\n' "$1"; }
warn(){ printf '\033[33m!\033[0m %s\n' "$1" >&2; }
step(){ printf '\n\033[1m%s\033[0m\n' "$1"; }

[ "$(id -u)" = "0" ] || die "запускай через sudo"
command -v git >/dev/null || die "нужен git: apt install -y git"

step "1. Код и первая выкладка"
mkdir -p "$TARGET" "$SITE_ROOT"
# nginx работает от www-data: ему нужен проход по каталогам, но не их листинг.
chmod o+x "$TARGET"
GIT_DIR="$SITE_ROOT/repo.git"
if [ -d "$GIT_DIR" ]; then
    git --git-dir="$GIT_DIR" remote set-url origin "$REPO"
else
    git clone --quiet --bare --depth 1 --branch "$BRANCH" "$REPO" "$GIT_DIR" || die "не удалось склонировать $REPO"
fi
chmod 700 "$GIT_DIR"
git --git-dir="$GIT_DIR" fetch --quiet --depth 1 --force origin "+refs/heads/$BRANCH:refs/heads/$BRANCH" \
    || die "не удалось получить $BRANCH из $REPO"
git --git-dir="$GIT_DIR" show "refs/heads/$BRANCH:cheatsheets/deploy/update-site.sh" > "$UPDATER.new" \
    || die "в $BRANCH нет cheatsheets/deploy/update-site.sh"
chmod 755 "$UPDATER.new" && mv -f "$UPDATER.new" "$UPDATER"
ok "скрипт обновления: $UPDATER"
# Переустановка = свежая выкладка, даже если коммит не изменился (снимает паузу после отката).
REPO="$REPO" BRANCH="$BRANCH" SITE_ROOT="$SITE_ROOT" SELF_PATH="$UPDATER" "$UPDATER" --force
[ -f "$SITE_ROOT/current/postneo/index.html" ] || die "после выкладки нет $SITE_ROOT/current/postneo/index.html"

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

    # Только опубликованные файлы текущего релиза (см. update-site.sh)
    root $SITE_ROOT/current;
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

    # Какая версия сейчас выложена
    location = /version.json { add_header Cache-Control \$nocache always; try_files /version.json =404; }

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
if [ -d /run/systemd/system ]; then
    systemctl enable --now nginx >/dev/null 2>&1 || true
    systemctl reload nginx
else
    # Контейнер без systemd
    nginx -s reload 2>/dev/null || nginx
fi
ok "конфиг $CONF включён, корень $SITE_ROOT/current"

step "3. Автообновление"
if [ "$AUTO_UPDATE" != "1" ]; then
    if [ -d /run/systemd/system ]; then systemctl disable --now postneo-site-update.timer >/dev/null 2>&1 || true; fi
    ok "выключено (AUTO_UPDATE=$AUTO_UPDATE); обновлять вручную: sudo postneo-site-update"
elif [ ! -d /run/systemd/system ]; then
    warn "systemd нет — таймер не поставлен; обновлять вручную: sudo postneo-site-update"
else
    cat > /etc/systemd/system/postneo-site-update.service <<EOF
[Unit]
Description=ПОСТ·НЕО: обновление сайта из $REPO ($BRANCH)
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
Environment=HOME=/root REPO=$REPO BRANCH=$BRANCH SITE_ROOT=$SITE_ROOT SELF_PATH=$UPDATER
ExecStart=$UPDATER
Nice=10
PrivateTmp=yes
NoNewPrivileges=yes
EOF
    cat > /etc/systemd/system/postneo-site-update.timer <<'EOF'
[Unit]
Description=ПОСТ·НЕО: проверять обновление сайта каждые 10 минут

[Timer]
OnBootSec=2min
OnUnitActiveSec=10min
RandomizedDelaySec=60

[Install]
WantedBy=timers.target
EOF
    systemctl daemon-reload
    systemctl enable --now postneo-site-update.timer >/dev/null
    ok "таймер postneo-site-update.timer: каждые 10 минут"
fi

if [ -n "$DOMAIN" ]; then
    step "4. Сертификат для $DOMAIN"
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
VERSION="$(sed -n 's/.*"short":"\([^"]*\)".*"subject":"\([^"]*\)".*/\1  \2/p' "$SITE_ROOT/current/version.json" 2>/dev/null)"
cat <<EOF
  Версия:       ${VERSION:-—}   ($URL/version.json)
  Сайт:         $URL/
  Калькулятор:  $URL/postneo/calculator.html
  Шкалы:        $URL/scales/   Седация: $URL/sedation/   Энтерально: $URL/enteral/

  Обновить сейчас:  sudo postneo-site-update
  Что выложено:     sudo postneo-site-update --status
  Откатить:         sudo postneo-site-update --rollback
  Журнал таймера:   journalctl -u postneo-site-update -n 20
  Конфиг nginx:     $CONF
EOF
[ -z "$DOMAIN" ] && cat <<'EOF'

  Без домена сайт работает по HTTP. Telegram открывает мини-приложения только
  по HTTPS с валидным сертификатом, поэтому для кнопок бота оставь адреса
  GitHub Pages либо запусти скрипт с доменом, направленным на этот сервер.
EOF
exit 0
