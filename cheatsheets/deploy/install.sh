#!/usr/bin/env bash
# Установка модуля шпаргалок в существующего телеграм-бота.
#
#   ./install.sh /путь/к/каталогу/бота
#
# Скрипт НЕ трогает код бота: он только кладёт рядом каталог cheatsheets/
# и печатает две строки, которые нужно добавить самому.
set -euo pipefail

REPO="https://github.com/jEw1IK/tpn.git"
BRANCH="${BRANCH:-main}"
BOT_DIR="${1:-}"

die() { printf '\033[31mОшибка:\033[0m %s\n' "$1" >&2; exit 1; }
ok()  { printf '\033[32m✓\033[0m %s\n' "$1"; }
info(){ printf '  %s\n' "$1"; }

[ -n "$BOT_DIR" ] || die "укажи каталог бота: ./install.sh /opt/postneo"
[ -d "$BOT_DIR" ] || die "каталога $BOT_DIR не существует"
command -v git >/dev/null || die "нужен git"
command -v python3 >/dev/null || die "нужен python3"

BOT_DIR="$(cd "$BOT_DIR" && pwd)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

echo "Скачиваю ветку $BRANCH…"
git clone --depth 1 --branch "$BRANCH" --quiet "$REPO" "$STAGE/tpn"
ok "склонировано"

# Бэкап предыдущей установки: кэш file_id и локальные правки контента жалко.
if [ -d "$BOT_DIR/cheatsheets" ]; then
    BACKUP="$BOT_DIR/cheatsheets.backup.$(date +%Y%m%d-%H%M%S)"
    cp -a "$BOT_DIR/cheatsheets" "$BACKUP"
    ok "прежняя версия сохранена в $(basename "$BACKUP")"
    CACHE="$BOT_DIR/cheatsheets/bot/file_id_cache.json"
    [ -f "$CACHE" ] && cp "$CACHE" "$STAGE/file_id_cache.json" && info "кэш file_id перенесу"
fi

rm -rf "$BOT_DIR/cheatsheets"
cp -a "$STAGE/tpn/cheatsheets" "$BOT_DIR/cheatsheets"
[ -f "$STAGE/file_id_cache.json" ] && cp "$STAGE/file_id_cache.json" "$BOT_DIR/cheatsheets/bot/"
ok "модуль установлен в $BOT_DIR/cheatsheets"

# Мини-приложения кладём рядом — пригодятся, если раздаёшь их своим nginx.
rm -rf "$BOT_DIR/webapp"
mkdir -p "$BOT_DIR/webapp"
cp -a "$STAGE/tpn/index.html" "$BOT_DIR/webapp/index.html"
cp -a "$STAGE/tpn/scales" "$BOT_DIR/webapp/scales"
ok "мини-приложения в $BOT_DIR/webapp"

PDFS=$(find "$BOT_DIR/cheatsheets/pdf" -name '*.pdf' | wc -l)
python3 - "$BOT_DIR" <<'PY'
import json, sys, os
root = sys.argv[1]
man = json.load(open(os.path.join(root, "cheatsheets", "manifest.json"), encoding="utf-8"))
missing = [s["id"] for s in man["sheets"]
           if not os.path.exists(os.path.join(root, "cheatsheets", s["file"]))]
if missing:
    raise SystemExit("Не хватает PDF: " + ", ".join(missing))
print(f"  манифест: {man['count']} шпаргалок, собран {man['generated']}")
PY
ok "проверено: $PDFS PDF на месте"

python3 -c "import aiogram, sys; v=aiogram.__version__; print('  aiogram', v); sys.exit(0 if v.startswith('3') else 1)" 2>/dev/null \
  && ok "aiogram 3.x найден" \
  || printf '\033[33m!\033[0m aiogram 3.x не найден в этом python — проверь, что ставишь в то же окружение, где работает бот\n'

cat <<'TXT'

────────────────────────────────────────────────────────────
Модуль на месте. Дальше два пути.

1) Проще: запустить готового бота из этого же репозитория —
   поиск по КР, шпаргалки, дозы, шкалы и питание уже собраны:

       sudo cheatsheets/deploy/install-bot.sh /opt/postneo

2) Встроить в свой код бота — четыре строки:

       from cheatsheets.bot.aiogram_router import cheatsheets_router
       from cheatsheets.bot.scales_router import scales_router
       from cheatsheets.bot.search_router import search_router

       dp.include_router(scales_router)       # до обработчика текста!
       dp.include_router(cheatsheets_router)
       dp.include_router(search_router)       # он ловит свободный текст, поэтому последний

   Кнопки мини-приложений для реплай-клавиатуры:

       from cheatsheets.bot.keyboard import scales_button, tpn_button

   Справка /help — готовым текстом:

       from cheatsheets.bot.help_text import HELP_TEXT

   ВАЖНО: если в коде остался старый импорт bilirubin_router — убери его,
   этого модуля больше нет, бот упадёт на старте.

Адреса мини-приложений задаются переменными окружения:

    TPN_WEBAPP_URL=https://jew1ik.github.io/tpn/
    SCALES_WEBAPP_URL=https://jew1ik.github.io/tpn/scales/

После этого перезапусти бота. Проверка: /shpory, /scales, /search желтуха
────────────────────────────────────────────────────────────
TXT
