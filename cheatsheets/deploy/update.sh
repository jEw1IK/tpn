#!/usr/bin/env bash
# Обновление уже установленного модуля: забирает свежую ветку,
# сохраняет кэш file_id и перезапускает сервис.
#
#   ./update.sh /путь/к/каталогу/бота [имя-сервиса]
set -euo pipefail

BOT_DIR="${1:-}"
SERVICE="${2:-}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[ -n "$BOT_DIR" ] || { echo "Использование: ./update.sh /opt/postneo [postneo-bot]" >&2; exit 1; }

bash "$HERE/install.sh" "$BOT_DIR"

if [ -n "$SERVICE" ]; then
    echo "Перезапускаю $SERVICE…"
    systemctl restart "$SERVICE"
    sleep 2
    systemctl --no-pager --lines=15 status "$SERVICE" || true
else
    echo "Имя сервиса не указано — перезапусти бота сам."
fi
