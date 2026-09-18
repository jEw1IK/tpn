#!/usr/bin/env bash
# Полная установка бота ПОСТ·НЕО на сервер — с нуля и до работающего сервиса.
#
#   sudo ./install-bot.sh                 # поставит в /opt/postneo
#   sudo ./install-bot.sh /srv/postneo    # или куда скажешь
#
# Повторный запуск = обновление: заберёт свежий код и перезапустит сервис.
# Токен спросит один раз и положит в /opt/postneo/.env с правами 600.
set -euo pipefail

REPO="${REPO:-https://github.com/jEw1IK/tpn.git}"
BRANCH="${BRANCH:-main}"
TARGET="${1:-/opt/postneo}"
SERVICE="${SERVICE:-postneo-bot}"
BOT_USER="${BOT_USER:-postneo}"

die() { printf '\033[31mОшибка:\033[0m %s\n' "$1" >&2; exit 1; }
ok()  { printf '\033[32m✓\033[0m %s\n' "$1"; }
step(){ printf '\n\033[1m%s\033[0m\n' "$1"; }

[ "$(id -u)" = "0" ] || die "запускай через sudo"
command -v git >/dev/null || die "нужен git: apt install -y git"
python3 -c 'import venv' 2>/dev/null || die "нужен модуль venv: apt install -y python3-venv"

APP="$TARGET/app"
VENV="$TARGET/.venv"
ENV_FILE="$TARGET/.env"

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

step "2. Окружение Python"
[ -d "$VENV" ] || python3 -m venv "$VENV"
"$VENV/bin/pip" install --quiet --upgrade pip
"$VENV/bin/pip" install --quiet -r "$APP/cheatsheets/requirements-bot.txt"
ok "aiogram $("$VENV/bin/python" -c 'import aiogram;print(aiogram.__version__)')"

step "3. Токен"
if [ -f "$ENV_FILE" ] && grep -q '^BOT_TOKEN=' "$ENV_FILE"; then
    ok "токен уже лежит в $ENV_FILE — не трогаю"
else
    TOKEN="${BOT_TOKEN:-}"
    if [ -z "$TOKEN" ]; then
        printf 'Токен от @BotFather (ввод не отображается): '
        read -rs TOKEN
        printf '\n'
    fi
    [ -n "$TOKEN" ] || die "без токена бот не запустится"
    umask 077
    cat > "$ENV_FILE" <<ENV
BOT_TOKEN=$TOKEN
TPN_WEBAPP_URL=https://jew1ik.github.io/tpn/
SCALES_WEBAPP_URL=https://jew1ik.github.io/tpn/scales/
CHEATSHEET_FILE_ID_CACHE=$TARGET/file_id_cache.json
# Канал: адрес по умолчанию берётся из cheatsheets/data/brand.json,
# эта переменная его перебивает — пригодится, если канал переедет.
# CHANNEL_URL=https://t.me/postneo01
ENV
    chmod 600 "$ENV_FILE"
    ok "токен записан в $ENV_FILE (права 600)"
fi

step "4. Пользователь и права"
id "$BOT_USER" >/dev/null 2>&1 || useradd --system --home "$TARGET" --shell /usr/sbin/nologin "$BOT_USER"
touch "$TARGET/file_id_cache.json"
chown -R "$BOT_USER:$BOT_USER" "$TARGET"
ok "каталог принадлежит $BOT_USER"

step "5. Сервис"
cat > "/etc/systemd/system/$SERVICE.service" <<UNIT
[Unit]
Description=PostNeo Telegram bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$BOT_USER
Group=$BOT_USER
WorkingDirectory=$APP
Environment=PYTHONUNBUFFERED=1
EnvironmentFile=$ENV_FILE
ExecStart=$VENV/bin/python -m cheatsheets.bot.app
Restart=always
RestartSec=5

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$TARGET

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --quiet "$SERVICE"
systemctl restart "$SERVICE"
ok "сервис $SERVICE запущен"

sleep 3
step "6. Проверка"
if systemctl is-active --quiet "$SERVICE"; then
    ok "бот работает"
    systemctl --no-pager --lines=8 status "$SERVICE" || true
    cat <<TXT

────────────────────────────────────────────────────────────
Готово. Открой бота в Telegram и нажми /start.

  Обновить потом:   sudo $0 $TARGET
  Логи:             journalctl -u $SERVICE -f
  Остановить:       sudo systemctl stop $SERVICE
────────────────────────────────────────────────────────────
TXT
else
    printf '\033[31mСервис не поднялся.\033[0m Логи:\n'
    journalctl -u "$SERVICE" --no-pager --lines=30 || true
    exit 1
fi
