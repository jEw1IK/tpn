#!/usr/bin/env bash
# Настройка витрины бота через Telegram Bot API — БЕЗ единой правки кода.
#
# Что делает: кнопку меню рядом с полем ввода вешает на калькулятор
# билирубина, прописывает список команд, описание и текст «о боте».
#
# Запуск (токен передаётся переменной окружения, а не аргументом —
# так он не попадёт ни в историю оболочки, ни в вывод ps):
#
#     export BOT_TOKEN='1234567890:AA...'
#     ./setup-bot-menu.sh
#     unset BOT_TOKEN
#
# Переменные:
#     WEBAPP_URL   адрес мини-приложения (по умолчанию GitHub Pages)
#     MENU=commands  оставить кнопку меню списком команд, а не калькулятором
set -euo pipefail

API="https://api.telegram.org/bot${BOT_TOKEN:-}"
WEBAPP_URL="${WEBAPP_URL:-https://jew1ik.github.io/tpn/}"
MENU="${MENU:-webapp}"

red()  { printf '\033[31m%s\033[0m\n' "$1"; }
ok()   { printf '\033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '\033[33m!\033[0m %s\n' "$1"; }

[ -n "${BOT_TOKEN:-}" ] || { red "Не задан BOT_TOKEN. См. комментарий в начале файла."; exit 1; }
command -v curl >/dev/null || { red "нужен curl"; exit 1; }

# jq не обязателен — без него просто печатаем сырой ответ
if command -v jq >/dev/null; then HAVE_JQ=1; else HAVE_JQ=0; fi

call() {  # call <method> <json>
    local method="$1" body="$2" resp
    resp=$(curl -sS --max-time 20 -X POST "$API/$method" \
                -H 'Content-Type: application/json' -d "$body")
    if [ "$HAVE_JQ" = 1 ]; then
        if [ "$(printf '%s' "$resp" | jq -r '.ok')" = "true" ]; then
            return 0
        fi
        red "  $method: $(printf '%s' "$resp" | jq -r '.description // .')"
        return 1
    fi
    case "$resp" in
        *'"ok":true'*) return 0 ;;
        *) red "  $method: $resp"; return 1 ;;
    esac
}

# --- кто это вообще ---
me=$(curl -sS --max-time 20 "$API/getMe")
if [ "$HAVE_JQ" = 1 ]; then
    if [ "$(printf '%s' "$me" | jq -r '.ok')" != "true" ]; then
        red "Токен не принят: $(printf '%s' "$me" | jq -r '.description // .')"; exit 1
    fi
    username=$(printf '%s' "$me" | jq -r '.result.username')
    title=$(printf '%s' "$me" | jq -r '.result.first_name')
else
    case "$me" in *'"ok":true'*) : ;; *) red "Токен не принят: $me"; exit 1 ;; esac
    username=$(printf '%s' "$me" | sed -n 's/.*"username":"\([^"]*\)".*/\1/p')
    title=$(printf '%s' "$me" | sed -n 's/.*"first_name":"\([^"]*\)".*/\1/p')
fi
ok "Токен принят: @$username ($title)"

# --- проверяем, что мини-приложение реально открывается ---
code=$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' "$WEBAPP_URL" || echo 000)
if [ "$code" = "200" ]; then
    ok "Мини-приложение доступно: $WEBAPP_URL"
else
    warn "$WEBAPP_URL отвечает $code — Telegram такую кнопку не откроет."
    warn "Сначала включи GitHub Pages на ветке с калькулятором, потом запусти скрипт снова."
    if [ "$MENU" = "webapp" ]; then
        red "Прерываюсь, чтобы не повесить кнопку на битую ссылку."
        exit 1
    fi
fi

echo
printf 'Настроить @%s? Кнопка меню: %s [y/N] ' "$username" "$MENU"
read -r answer
case "$answer" in [yYдД]*) : ;; *) echo "Отменено."; exit 0 ;; esac
echo

# --- команды ---
call setMyCommands '{
  "commands": [
    {"command": "shpory", "description": "📄 Шпаргалки в PDF"},
    {"command": "scales", "description": "📊 Шкалы: nSOFA, боль, седация"}
  ],
  "scope": {"type": "all_private_chats"},
  "language_code": "ru"
}' && ok "Команды прописаны"

# --- кнопка меню ---
if [ "$MENU" = "webapp" ]; then
    call setChatMenuButton "{
      \"menu_button\": {
        \"type\": \"web_app\",
        \"text\": \"Инструменты\",
        \"web_app\": {\"url\": \"$WEBAPP_URL\"}
      }
    }" && ok "Кнопка меню открывает мини-приложение"
    warn "Кнопка меню теперь мини-приложение, а не список команд. Команды по-прежнему"
    warn "работают, если набрать «/». Вернуть список: MENU=commands ./setup-bot-menu.sh"
else
    call setChatMenuButton '{"menu_button": {"type": "commands"}}' \
        && ok "Кнопка меню — список команд"
fi

# --- описание ---
call setMyShortDescription '{
  "short_description": "Шпаргалки неонатолога и шкалы оценки",
  "language_code": "ru"
}' && ok "Короткое описание обновлено"

call setMyDescription '{
  "description": "Памятки для быстрой сверки у постели пациента: пороги фототерапии и ОЗПК, реанимация в родзале, РДС и сурфактант, параметры ИВЛ, сепсис, гипогликемия, судороги, ОАП, НЭК, гипотермия, инотропы, парентеральное питание, референсные значения.\n\n/shpory — шпаргалки в PDF\n/scales — шкалы оценки\n\nНе заменяет действующие клинические рекомендации и назначение врача.",
  "language_code": "ru"
}' && ok "Описание обновлено"

echo
ok "Готово. Открой @$username и проверь кнопку рядом с полем ввода."
warn "Команды /shpory и /scales появятся в списке, но ОТВЕЧАТЬ на них"
warn "бот начнёт только после подключения модуля к его коду."
