#!/usr/bin/env bash
# Обновляет модуль, правит bot.py, перезапускает бота — и откатывается,
# если после перезапуска сервис не поднялся.
#
#   bash apply.sh
#   BOT_DIR=/opt/telegram-bot SERVICE=telegram-bot bash apply.sh
#
# Ничего не спрашивает. Всё, что меняет, сначала копирует рядом с меткой
# времени, так что вернуться к прежнему состоянию можно всегда.
set -euo pipefail

REPO="${REPO:-https://github.com/jEw1IK/tpn.git}"
BRANCH="${BRANCH:-main}"
BOT_DIR="${BOT_DIR:-/opt/telegram-bot}"
SERVICE="${SERVICE:-telegram-bot}"
BOT_FILE="${BOT_FILE:-$BOT_DIR/bot.py}"
SKIP_RESTART="${SKIP_RESTART:-0}"

STAMP="$(date +%Y%m%d-%H%M%S)"
BOT_BACKUP="$BOT_FILE.bak-$STAMP"
MOD_BACKUP="$BOT_DIR/cheatsheets.backup-$STAMP"

die() { printf '\033[31mОшибка:\033[0m %s\n' "$1" >&2; exit 1; }
ok()  { printf '\033[32m✓\033[0m %s\n' "$1"; }
step(){ printf '\n\033[1m%s\033[0m\n' "$1"; }

[ -d "$BOT_DIR" ]  || die "каталога $BOT_DIR нет — задай BOT_DIR=/путь"
[ -f "$BOT_FILE" ] || die "файла $BOT_FILE нет — задай BOT_FILE=/путь/к/bot.py"
command -v git >/dev/null || die "нужен git: apt install -y git"

PY="$BOT_DIR/.venv/bin/python"
[ -x "$PY" ] || PY="$(command -v python3)"
[ -x "$PY" ] || die "не нашёл python"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

step "1. Свежий код"
git clone --depth 1 --branch "$BRANCH" --quiet "$REPO" "$STAGE/tpn"
ok "ветка $BRANCH получена"

step "2. Копии на случай отката"
cp -a "$BOT_FILE" "$BOT_BACKUP"
ok "$(basename "$BOT_BACKUP")"
if [ -d "$BOT_DIR/cheatsheets" ]; then
    cp -a "$BOT_DIR/cheatsheets" "$MOD_BACKUP"
    ok "$(basename "$MOD_BACKUP")"
fi

step "3. Модуль шпаргалок"
CACHE="$BOT_DIR/cheatsheets/bot/file_id_cache.json"
[ -f "$CACHE" ] && cp "$CACHE" "$STAGE/file_id_cache.json" && ok "кэш file_id сохранён"
rm -rf "$BOT_DIR/cheatsheets"
cp -a "$STAGE/tpn/cheatsheets" "$BOT_DIR/cheatsheets"
[ -f "$STAGE/file_id_cache.json" ] && cp "$STAGE/file_id_cache.json" "$BOT_DIR/cheatsheets/bot/"
PDFS=$(find "$BOT_DIR/cheatsheets/pdf" -name '*.pdf' | wc -l)
ok "модуль обновлён, PDF на месте: $PDFS"

# Мини-приложения — пригодятся, если раздаёшь их своим nginx.
rm -rf "$BOT_DIR/webapp"; mkdir -p "$BOT_DIR/webapp"
cp -a "$STAGE/tpn/index.html" "$STAGE/tpn/scales-data.js" "$BOT_DIR/webapp/"

step "4. Правка bot.py"
"$PY" "$BOT_DIR/cheatsheets/deploy/patch_bot.py" "$BOT_FILE" || {
    cp -a "$BOT_BACKUP" "$BOT_FILE"
    die "патч не применился, bot.py возвращён из копии"
}

if [ "$SKIP_RESTART" = "1" ]; then
    step "5. Перезапуск пропущен (SKIP_RESTART=1)"
    exit 0
fi

step "5. Перезапуск"
systemctl restart "$SERVICE"
sleep 4

if systemctl is-active --quiet "$SERVICE"; then
    ok "сервис $SERVICE работает"
    cat <<TXT

────────────────────────────────────────────────────────────
Готово. Открой бота и нажми /start — клавиатура перерисуется.

  Логи:   journalctl -u $SERVICE -f
  Откат:  cp $BOT_BACKUP $BOT_FILE && systemctl restart $SERVICE
────────────────────────────────────────────────────────────
TXT
else
    printf '\n\033[31mСервис не поднялся — возвращаю как было.\033[0m\n'
    cp -a "$BOT_BACKUP" "$BOT_FILE"
    if [ -d "$MOD_BACKUP" ]; then
        rm -rf "$BOT_DIR/cheatsheets"
        cp -a "$MOD_BACKUP" "$BOT_DIR/cheatsheets"
    fi
    systemctl restart "$SERVICE" || true
    sleep 3
    systemctl is-active --quiet "$SERVICE" && ok "бот снова работает на прежней версии" \
        || printf '\033[31mСтарая версия тоже не поднялась — смотри логи ниже.\033[0m\n'
    printf '\nПоследние строки журнала (пришли их мне):\n'
    journalctl -u "$SERVICE" --no-pager --lines=30 || true
    exit 1
fi
