#!/usr/bin/env bash
# Зеркало пакета для ПК: забирает ветку desktop-dist из GitHub, собирает полный архив с node.exe и кладёт в /opt/postneo/download.
# Запускается таймером postneo-kart-mirror.timer (ставит install-kart-server.sh). Повторный запуск без изменений ничего не делает.
set -euo pipefail
RAW=https://raw.githubusercontent.com/jEw1IK/tpn/desktop-dist
DL=/opt/postneo/download; CACHE=/opt/postneo/download-cache; NODE_VER=22.22.0
mkdir -p "$DL" "$CACHE"
command -v zip >/dev/null && command -v unzip >/dev/null || { export DEBIAN_FRONTEND=noninteractive; apt-get install -y -qq zip unzip >/dev/null; }
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
curl -fsSL --max-time 60 -o "$TMP/kart-version.json" "$RAW/kart-version.json"
COMMIT="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['commit'])" "$TMP/kart-version.json")"
APPZIP="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['app_url'])" "$TMP/kart-version.json")"
SHA="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['sha256'])" "$TMP/kart-version.json")"
if [ -s "$DL/kart-version.json" ] && [ "$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['commit'])" "$DL/kart-version.json")" = "$COMMIT" ] && [ -s "$DL/POSTNEO-Kartochki-win64.zip" ]; then
  echo "зеркало актуально: $COMMIT"; exit 0
fi
echo "новая версия пакета: $COMMIT"
curl -fsSL --max-time 600 -o "$TMP/$APPZIP" "$RAW/$APPZIP"
echo "$SHA  $TMP/$APPZIP" | sha256sum -c --quiet
curl -fsSL --max-time 300 -o "$TMP/POSTNEO-Kartochki.exe" "$RAW/POSTNEO-Kartochki.exe"
curl -fsSL --max-time 60 -o "$TMP/README.txt" "$RAW/README.txt"
NODEZIP="$CACHE/node-v$NODE_VER-win-x64.zip"
[ -s "$NODEZIP" ] || curl -fsSL --max-time 600 -o "$NODEZIP" "https://nodejs.org/dist/v$NODE_VER/node-v$NODE_VER-win-x64.zip"
# полный пакет: exe, README, node/, app/
PK="$TMP/postneo-kart-windows"; mkdir -p "$PK/app" "$PK/node"
unzip -q "$TMP/$APPZIP" -d "$PK/app"
unzip -q -o -j "$NODEZIP" "node-v$NODE_VER-win-x64/node.exe" "node-v$NODE_VER-win-x64/LICENSE" -d "$PK/node"
cp "$TMP/POSTNEO-Kartochki.exe" "$TMP/README.txt" "$PK/"
( cd "$TMP" && zip -qr "POSTNEO-Kartochki-win64.zip" postneo-kart-windows )
# выкладываем атомарно: сначала файлы, потом version.json
mv -f "$TMP/$APPZIP" "$DL/$APPZIP"
mv -f "$TMP/POSTNEO-Kartochki.exe" "$DL/POSTNEO-Kartochki.exe"
mv -f "$TMP/README.txt" "$DL/README.txt"
mv -f "$TMP/POSTNEO-Kartochki-win64.zip" "$DL/POSTNEO-Kartochki-win64.zip"
mv -f "$TMP/kart-version.json" "$DL/kart-version.json"
# старые архивы приложения не копим
ls -1t "$DL"/kart-app-*.zip 2>/dev/null | tail -n +3 | xargs -r rm -f
cat > "$DL/index.html" <<HTML
<!doctype html><html lang="ru"><meta charset="utf-8"><title>POSTNEO Карточки: загрузка</title>
<style>body{font-family:system-ui,Arial,sans-serif;max-width:640px;margin:48px auto;padding:0 16px;line-height:1.5;color:#222}a.b{display:inline-block;padding:12px 18px;background:#8f1f1a;color:#fff;border-radius:10px;text-decoration:none;font-weight:600}code{background:#f3efe8;padding:2px 6px;border-radius:4px}</style>
<h1>POSTNEO Карточки для Windows</h1>
<p>Версия <code>$COMMIT</code>. Распакуйте архив целиком и запустите <code>POSTNEO-Kartochki.exe</code>. Обновления приходят сами при запуске.</p>
<p><a class="b" href="POSTNEO-Kartochki-win64.zip">Скачать архив</a></p>
<p>Это калькулятор с печатью, без входа и базы. Пациенты отделения ведутся на сервере: <a href="../kart/login">войти в отделение</a>.</p>
<p><a href="README.txt">Инструкция</a> · <a href="kart-version.json">версия</a> · <a href="../postneo/">сайт</a></p>
HTML
chmod -R a+rX "$DL"
echo "готово: $DL ($COMMIT)"
